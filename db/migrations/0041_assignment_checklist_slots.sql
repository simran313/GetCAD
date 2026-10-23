-- 0041_assignment_checklist_slots.sql
-- Phase 3a: assignment with capacity, the two-level 19-point checklist, and
-- the upload slots (Spec §7–§9, DECISIONS §9–§11).
--
-- ASSIGNMENT. Admin → pod lead → designer. assign_designer() is the one way
-- an order reaches a designer; transition_order's old ASSIGNED move now hands
-- over to it, so there is a single set of rules. The designer must belong to
-- the order's pod. Capacity is the sum of category minutes of the designer's
-- open jobs against the shift (480): over it, a warning while
-- `capacity_blocking` is off (October), a hard stop without an admin override
-- and a reason once it is on.
--
-- VERSIONS. orders.work_version counts attempts. A QC send-back or a client
-- revision opens a new version, which starts with an empty checklist and
-- empty slots; earlier versions stay on record.
--
-- THE GATES (DECISIONS §10, owner answers):
--   submit  = all 19 designer ticks (18 checks + sign-off) + all 10 required
--             slots filled for this version; submitting goes straight to QC.
--   QC pass = all 19 QC ticks (18 checks + the pod lead's sign-off).
--   send back = a written note.

ALTER TABLE orders ADD COLUMN work_version integer NOT NULL DEFAULT 1 CHECK (work_version >= 1);

-- ----------------------------------------------------------- capacity --

-- Category minutes of a designer's open work.
CREATE OR REPLACE FUNCTION app.designer_open_minutes(p_designer_id text, p_excluding text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(c.minutes), 0)::integer
  FROM public.orders o
  JOIN public.job_categories c ON c.letter = o.category
  WHERE o.designer_id = p_designer_id
    AND o.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED')
    AND o.id IS DISTINCT FROM p_excluding
$$;

REVOKE ALL ON FUNCTION app.designer_open_minutes(text, text) FROM PUBLIC;

-- Designers of the order's pod, with their load, for the assignment picker.
-- Admin or the order's pod lead only. Names are allowed here: "designer
-- identity — names in own pod" (Spec §1).
CREATE OR REPLACE FUNCTION public.pod_designers(p_order_id text)
RETURNS TABLE (
  designer_id   text,
  designer_ref  text,
  name          text,
  open_minutes  integer,
  shift_minutes integer,
  assignable    boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pod text;
BEGIN
  SELECT pod_id INTO v_pod FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (app.is_admin() OR app.is_pod_lead_of(v_pod)) THEN
    RAISE EXCEPTION 'only an admin or this order''s pod lead may see its pod';
  END IF;

  RETURN QUERY
  SELECT m.user_id, d.designer_ref, d.legal_name,
         app.designer_open_minutes(m.user_id),
         coalesce(app.setting('shift_minutes'), 480),
         app.designer_is_assignable(m.user_id)
  FROM public.pod_members m
  LEFT JOIN public.designer_profiles d ON d.user_id = m.user_id
  WHERE m.pod_id = v_pod AND m.member_role = 'DESIGNER'
  ORDER BY d.designer_ref NULLS LAST, m.user_id;
END
$$;

REVOKE ALL ON FUNCTION public.pod_designers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pod_designers(text) TO authenticated, service_role;

-- --------------------------------------------------------- assignment --

CREATE OR REPLACE FUNCTION public.assign_designer(
  p_order_id        text,
  p_designer_id     text,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_minutes  integer;
  v_open     integer;
  v_shift    integer;
  v_over     boolean;
  v_warning  text;
  v_reason   text := nullif(btrim(p_override_reason), '');
  v_role     public.role;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  -- Admin → pod lead → designer (DECISIONS §11). OPS keeps the move it always
  -- had, so an ops member without the full admin set can still staff work.
  IF app.is_pod_lead_of(v_order.pod_id) THEN
    v_role := 'QC';
  ELSIF app.is_admin() OR app.has_role('OPS') THEN
    v_role := 'OPS';
  ELSE
    RAISE EXCEPTION 'only an admin or this order''s pod lead may assign it';
  END IF;

  IF v_order.status NOT IN ('PAYMENT_HELD', 'ASSIGNED') THEN
    RAISE EXCEPTION 'can only assign a paid order (is %)', v_order.status;
  END IF;
  IF p_designer_id IS NULL THEN
    RAISE EXCEPTION 'choose a designer';
  END IF;
  IF NOT app.designer_is_assignable(p_designer_id) THEN
    RAISE EXCEPTION 'designer is not assignable: must be an ACTIVE designer who has accepted the agreement';
  END IF;
  IF v_order.pod_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pod_members
       WHERE pod_id = v_order.pod_id AND user_id = p_designer_id AND member_role = 'DESIGNER') THEN
    RAISE EXCEPTION 'that designer is not in this order''s pod';
  END IF;
  IF v_order.qc_reviewer_id IS NOT DISTINCT FROM p_designer_id THEN
    RAISE EXCEPTION 'independent QC: cannot assign the order to its own reviewer';
  END IF;

  -- Capacity (Spec §7, DECISIONS §12 capacity_blocking).
  SELECT minutes INTO v_minutes FROM public.job_categories WHERE letter = v_order.category;
  v_open  := app.designer_open_minutes(p_designer_id, p_order_id);
  v_shift := coalesce(app.setting('shift_minutes'), 480);
  v_over  := v_open + coalesce(v_minutes, 0) > v_shift;
  IF v_over THEN
    v_warning := format('Over capacity: %s + %s of %s minutes this shift.', v_open, coalesce(v_minutes, 0), v_shift);
    IF app.flag('capacity_blocking') AND NOT (app.is_admin() AND v_reason IS NOT NULL) THEN
      RAISE EXCEPTION '% An admin can override with a reason.', v_warning;
    END IF;
  END IF;

  UPDATE public.job_assignments SET ended_at = now()
  WHERE order_id = p_order_id AND ended_at IS NULL;
  INSERT INTO public.job_assignments (order_id, designer_id, assigned_by, override_reason)
  VALUES (p_order_id, p_designer_id, v_clerk_id, CASE WHEN v_over THEN v_reason END);

  UPDATE public.orders SET designer_id = p_designer_id, status = 'ASSIGNED' WHERE id = p_order_id;

  -- As an ordinary status change, so the timeline and the designer's
  -- notification (0015) pick it up. No designer id in the payload (0036).
  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, v_role,
    jsonb_build_object('from', v_order.status, 'to', 'ASSIGNED', 'over_capacity', v_over)
      || CASE WHEN v_over AND v_reason IS NOT NULL THEN jsonb_build_object('override_reason', v_reason) ELSE '{}'::jsonb END
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', 'ASSIGNED',
                            'warning', v_warning);
END
$$;

REVOKE ALL ON FUNCTION public.assign_designer(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_designer(text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------- checklist --

CREATE OR REPLACE FUNCTION app.ticks_complete(p_order_id text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) = (SELECT count(*) FROM public.checklist_items)
  FROM public.order_checks c
  JOIN public.orders o ON o.id = c.order_id AND c.version = o.work_version
  WHERE c.order_id = p_order_id
    AND CASE p_column WHEN 'designer' THEN c.designer_at IS NOT NULL ELSE c.qc_at IS NOT NULL END
$$;

-- Required slots with no file in this version.
CREATE OR REPLACE FUNCTION app.missing_slots(p_order_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(s.code ORDER BY s.position), '{}')
  FROM public.deliverable_slots s
  JOIN public.orders o ON o.id = p_order_id
  WHERE s.required
    AND NOT EXISTS (SELECT 1 FROM public.deliverables d
                    WHERE d.order_id = o.id AND d.slot = s.code AND d.version = o.work_version)
$$;

REVOKE ALL ON FUNCTION app.ticks_complete(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.missing_slots(text)        FROM PUBLIC;

-- Tick or untick one checklist line. Designer column: the assigned designer,
-- while IN_PROGRESS. QC column: the order's pod lead, in QC_REVIEW, after the
-- designer signed off this version, and never the person who designed it.
CREATE OR REPLACE FUNCTION public.tick_check(
  p_order_id text,
  p_item_id  integer,
  p_column   text,
  p_ticked   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_signoff  smallint;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_column NOT IN ('designer', 'qc') THEN RAISE EXCEPTION 'column must be designer or qc'; END IF;
  PERFORM 1 FROM public.checklist_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such checklist item'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF p_column = 'designer' THEN
    IF NOT app.is_assigned_designer(p_order_id) THEN
      RAISE EXCEPTION 'only the assigned designer ticks the designer column';
    END IF;
    IF v_order.status <> 'IN_PROGRESS' THEN
      RAISE EXCEPTION 'the designer checklist is open only while the job is in progress (is %)', v_order.status;
    END IF;
    INSERT INTO public.order_checks (order_id, version, item_id, designer_by, designer_at)
    VALUES (p_order_id, v_order.work_version, p_item_id,
            CASE WHEN p_ticked THEN v_clerk_id END, CASE WHEN p_ticked THEN now() END)
    ON CONFLICT (order_id, version, item_id) DO UPDATE
      SET designer_by = EXCLUDED.designer_by, designer_at = EXCLUDED.designer_at;
  ELSE
    IF NOT app.is_pod_lead_of(v_order.pod_id) THEN
      RAISE EXCEPTION 'only this order''s pod lead ticks the QC column';
    END IF;
    IF v_order.designer_id IS NOT DISTINCT FROM v_clerk_id THEN
      RAISE EXCEPTION 'independent QC: you cannot review work you produced';
    END IF;
    IF v_order.status <> 'QC_REVIEW' THEN
      RAISE EXCEPTION 'the QC checklist is open only in QC review (is %)', v_order.status;
    END IF;
    SELECT id INTO v_signoff FROM public.checklist_items WHERE is_signoff;
    IF NOT EXISTS (SELECT 1 FROM public.order_checks
                   WHERE order_id = p_order_id AND version = v_order.work_version
                     AND item_id = v_signoff AND designer_at IS NOT NULL) THEN
      RAISE EXCEPTION 'QC starts after the designer has signed off';
    END IF;
    INSERT INTO public.order_checks (order_id, version, item_id, qc_by, qc_at)
    VALUES (p_order_id, v_order.work_version, p_item_id,
            CASE WHEN p_ticked THEN v_clerk_id END, CASE WHEN p_ticked THEN now() END)
    ON CONFLICT (order_id, version, item_id) DO UPDATE
      SET qc_by = EXCLUDED.qc_by, qc_at = EXCLUDED.qc_at;
  END IF;

  PERFORM audit.log_event(
    CASE WHEN p_ticked THEN 'CHECK_TICKED' ELSE 'CHECK_UNTICKED' END, 'order', p_order_id, v_clerk_id,
    app.current_user_role(),
    jsonb_build_object('item', p_item_id, 'column', p_column, 'version', v_order.work_version)
  );
  RETURN jsonb_build_object('order_id', p_order_id, 'item', p_item_id, 'column', p_column, 'ticked', p_ticked);
END
$$;

REVOKE ALL ON FUNCTION public.tick_check(text, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tick_check(text, integer, text, boolean) TO authenticated, service_role;

-- The checklist for this version, for the designer, the pod lead and admin.
-- Times only — never who ticked.
CREATE OR REPLACE FUNCTION public.job_checklist(p_order_id text)
RETURNS TABLE (
  item_id     smallint,
  group_name  text,
  label       text,
  flag        text,
  is_signoff  boolean,
  designer_at timestamptz,
  qc_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel     text := app.order_relation(p_order_id);
  v_version integer;
BEGIN
  IF v_rel IS NULL OR v_rel NOT IN ('DESIGNER', 'POD_LEAD', 'ADMIN') THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT work_version INTO v_version FROM public.orders WHERE id = p_order_id;
  RETURN QUERY
  SELECT i.id, i.group_name, i.label, i.flag, i.is_signoff, c.designer_at, c.qc_at
  FROM public.checklist_items i
  LEFT JOIN public.order_checks c
    ON c.order_id = p_order_id AND c.version = v_version AND c.item_id = i.id
  ORDER BY i.id;
END
$$;

REVOKE ALL ON FUNCTION public.job_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_checklist(text) TO authenticated, service_role;

-- --------------------------------------------------------------- slots --

-- What each slot's file IS, so the client download gate (core/files) treats
-- it right: the 5 render views, diamond details and gold weight are the
-- review set the client approves on (owner answer: all 5 views); 3DM, STL,
-- the M view and the summary are released after approval.
CREATE OR REPLACE FUNCTION app.slot_kind(p_slot text)
RETURNS file_kind
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (CASE p_slot
    WHEN '3DM' THEN 'RHINO_3DM'
    WHEN 'STL' THEN 'STL'
    WHEN 'TV' THEN 'RENDER' WHEN 'PV' THEN 'RENDER' WHEN 'RV' THEN 'RENDER'
    WHEN 'FV' THEN 'RENDER' WHEN 'BV' THEN 'RENDER'
    WHEN 'DD' THEN 'DIAMOND_DETAILS' WHEN 'DIAMOND_DETAILS' THEN 'DIAMOND_DETAILS'
    WHEN 'GW' THEN 'WEIGHT_CHART' WHEN 'GOLD_WEIGHT_CHART' THEN 'WEIGHT_CHART'
    WHEN 'SUMMARY' THEN 'SUMMARY_SHEET'
    ELSE 'OTHER'
  END)::public.file_kind
$$;

-- The designer puts a sanitized file into a slot. The file is recorded by
-- add_file_version (same rules and audit as any upload) and named
-- {JOB_CODE}_{SLOT}_v{n}.{ext} by the server — never by the uploader, and
-- never with the client part of the reference (designers do not see it).
-- Uploading into a filled slot replaces that slot's file for this version.
CREATE OR REPLACE FUNCTION public.add_slot_file(
  p_id           text,
  p_order_id     text,
  p_slot         text,
  p_object_key   text,
  p_content_type text,
  p_size_bytes   integer,
  p_extension    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_name  text;
BEGIN
  IF NOT app.is_assigned_designer(p_order_id) THEN
    RAISE EXCEPTION 'only the assigned designer uploads into slots';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'slots are open only while the job is in progress (is %)', v_order.status;
  END IF;
  PERFORM 1 FROM public.deliverable_slots WHERE code = p_slot;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such slot: %', p_slot; END IF;
  IF p_extension !~ '^[a-z0-9]{1,8}$' THEN RAISE EXCEPTION 'bad file extension'; END IF;

  PERFORM public.add_file_version(p_id, p_order_id, p_object_key, p_content_type, p_size_bytes, app.slot_kind(p_slot));

  v_name := coalesce(v_order.job_code, left(p_order_id, 8)) || '_' || p_slot || '_v' || v_order.work_version || '.' || p_extension;
  INSERT INTO public.deliverables (order_id, slot, version, file_version_id, file_name)
  VALUES (p_order_id, p_slot, v_order.work_version, p_id, v_name)
  ON CONFLICT (order_id, slot, version) DO UPDATE
    SET file_version_id = EXCLUDED.file_version_id, file_name = EXCLUDED.file_name, created_at = now();

  RETURN jsonb_build_object('order_id', p_order_id, 'slot', p_slot, 'file_name', v_name,
                            'missing', app.missing_slots(p_order_id));
END
$$;

REVOKE ALL ON FUNCTION public.add_slot_file(text, text, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_slot_file(text, text, text, text, text, integer, text) TO authenticated, service_role;

-- The slots for this version, for the designer, the pod lead and admin.
CREATE OR REPLACE FUNCTION public.job_slots(p_order_id text)
RETURNS TABLE (
  code            text,
  label           text,
  required        boolean,
  file_version_id text,
  file_name       text,
  uploaded_at     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel     text := app.order_relation(p_order_id);
  v_version integer;
BEGIN
  IF v_rel IS NULL OR v_rel NOT IN ('DESIGNER', 'POD_LEAD', 'ADMIN') THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT work_version INTO v_version FROM public.orders WHERE id = p_order_id;
  RETURN QUERY
  SELECT s.code, s.label, s.required, d.file_version_id, d.file_name, d.created_at
  FROM public.deliverable_slots s
  LEFT JOIN public.deliverables d ON d.order_id = p_order_id AND d.slot = s.code AND d.version = v_version
  ORDER BY s.position;
END
$$;

REVOKE ALL ON FUNCTION public.job_slots(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_slots(text) TO authenticated, service_role;

-- ---------------------------------------------- transitions and QC v3 --

-- 0036's transition_order, with:
--   ASSIGNED            → handed to assign_designer() (one set of rules)
--   DESIGNER_SUBMITTED  → only with 19 designer ticks + all required slots,
--                         and straight on to QC_REVIEW (owner answer)
--   → REVISION_REQUESTED by the client opens a new work version
CREATE OR REPLACE FUNCTION public.transition_order(
  p_order_id   text,
  p_new_status order_status,
  p_payload    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text;
  v_role     public.role;
  v_order    public.orders%ROWTYPE;
  v_scope    text;
  v_missing  text[];
BEGIN
  v_clerk_id := app.current_clerk_id();
  IF v_clerk_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF app.current_user_role() IS NULL THEN
    RAISE EXCEPTION 'no role: complete onboarding first';
  END IF;

  IF p_new_status = 'ASSIGNED' THEN
    RETURN public.assign_designer(p_order_id, p_payload ->> 'designer_id', p_payload ->> 'override_reason');
  END IF;

  IF p_new_status IN ('QUOTED', 'PAYMENT_HELD', 'PAYOUT_RELEASED', 'REFUNDED') THEN
    RAISE EXCEPTION 'money-bearing transition to %: use quote_order / hold_escrow / release_escrow / refund_escrow',
      p_new_status;
  END IF;
  IF p_new_status = 'DISPUTED' THEN
    RAISE EXCEPTION 'raising a dispute requires a reason: use raise_dispute()';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_order.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'a disputed order must be resolved via resolve_dispute()';
  END IF;

  IF v_order.status = 'QC_REVIEW'
     AND p_new_status IN ('CLIENT_PREVIEW', 'REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'a QC decision must be recorded via record_qc_decision()';
  END IF;

  SELECT t.actor_scope, t.actor_role INTO v_scope, v_role
  FROM public.order_transitions t
  WHERE t.from_status = v_order.status
    AND t.to_status   = p_new_status
    AND t.actor_role  = ANY (app.current_roles())
  ORDER BY (t.actor_role = app.current_user_role()) DESC, t.actor_role
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'illegal transition: % -> % by role %',
      v_order.status, p_new_status, app.current_user_role();
  END IF;

  IF v_scope = 'CLIENT_PARTY' AND v_order.client_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the client of this order';
  ELSIF v_scope = 'DESIGNER_PARTY' AND v_order.designer_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the assigned designer of this order';
  END IF;

  IF p_new_status = 'DESIGNER_SUBMITTED' THEN
    IF NOT app.ticks_complete(p_order_id, 'designer') THEN
      RAISE EXCEPTION 'tick and sign off all 19 checklist lines before submitting';
    END IF;
    v_missing := app.missing_slots(p_order_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'upload every required file before submitting (missing: %)', array_to_string(v_missing, ', ');
    END IF;
  END IF;

  UPDATE public.orders
    SET status = p_new_status,
        work_version = work_version + CASE WHEN p_new_status = 'REVISION_REQUESTED' THEN 1 ELSE 0 END
    WHERE id = p_order_id;

  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, v_role,
    jsonb_build_object('from', v_order.status, 'to', p_new_status)
      || (coalesce(p_payload, '{}'::jsonb) - 'designer_id')
  );

  -- Straight to the pod lead's QC queue (owner answer).
  IF p_new_status = 'DESIGNER_SUBMITTED' THEN
    UPDATE public.orders SET status = 'QC_REVIEW' WHERE id = p_order_id;
    PERFORM audit.log_event(
      'ORDER_STATUS_CHANGED', 'order', p_order_id, NULL, NULL,
      jsonb_build_object('from', 'DESIGNER_SUBMITTED', 'to', 'QC_REVIEW', 'automatic', true)
    );
    PERFORM app.notify(v_order.pod_lead_id, v_clerk_id, 'QC', p_order_id,
                       'A job in your pod is ready for QC.');
    RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', 'QC_REVIEW');
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_new_status);
END
$$;

-- 0036's record_qc_decision, with the checklist gate: PASS needs all 19 QC
-- ticks; a send-back needs a note and opens a new version for the designer.
CREATE OR REPLACE FUNCTION public.record_qc_decision(
  p_order_id text,
  p_outcome  text,
  p_notes    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text;
  v_order    public.orders%ROWTYPE;
  v_to       public.order_status;
BEGIN
  v_clerk_id := app.current_clerk_id();
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT app.has_role('QC') THEN
    RAISE EXCEPTION 'only QC may record a review decision';
  END IF;

  IF p_outcome IS NULL OR p_outcome NOT IN ('PASS', 'REVISION') THEN
    RAISE EXCEPTION 'outcome must be PASS or REVISION';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF NOT app.is_pod_lead_of(v_order.pod_id) THEN
    RAISE EXCEPTION 'only the pod lead of this order''s pod may review it';
  END IF;

  IF v_order.status <> 'QC_REVIEW' THEN
    RAISE EXCEPTION 'can only review an order in QC_REVIEW (is %)', v_order.status;
  END IF;

  IF v_order.designer_id IS NOT DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'independent QC: you cannot review work you produced';
  END IF;
  IF v_order.client_id IS NOT DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'independent QC: you cannot review your own order';
  END IF;

  IF p_outcome = 'PASS' AND NOT app.ticks_complete(p_order_id, 'qc') THEN
    RAISE EXCEPTION 'tick and sign off all 19 QC checklist lines before passing';
  END IF;
  IF p_outcome = 'REVISION' AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'sending a job back needs a written note';
  END IF;

  v_to := CASE p_outcome WHEN 'PASS' THEN 'CLIENT_PREVIEW' ELSE 'REVISION_REQUESTED' END;

  UPDATE public.orders
    SET status = v_to,
        qc_reviewer_id = v_clerk_id,
        work_version = work_version + CASE WHEN p_outcome = 'REVISION' THEN 1 ELSE 0 END
    WHERE id = p_order_id;

  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, 'QC',
    jsonb_build_object('from', v_order.status, 'to', v_to, 'qc_outcome', p_outcome)
      || CASE WHEN p_notes IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('notes', p_notes) END
  );

  -- The note goes where the designer reads: the internal thread. The
  -- notification comes from that post (0036 fan-out).
  IF p_outcome = 'REVISION' THEN
    PERFORM public.post_thread_message(
      (SELECT id FROM public.message_threads WHERE order_id = p_order_id AND kind = 'internal'),
      'Sent back by QC: ' || btrim(p_notes));
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', v_to);
END
$$;

-- ------------------------------------------------------- notifications --

-- 0036's fan-out, except designer uploads: with ten slots per version, the
-- old "a new file was added" would message the client ten times before QC.
CREATE OR REPLACE FUNCTION app.fanout_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client   text;
  v_designer text;
  v_pod_lead text;
  v_other    text;
  v_to       text;
BEGIN
  IF NEW.entity_type <> 'order' OR NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id, designer_id, pod_lead_id INTO v_client, v_designer, v_pod_lead
  FROM public.orders WHERE id = NEW.entity_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_other := CASE
    WHEN NEW.actor_id IS NOT DISTINCT FROM v_client   THEN v_designer
    WHEN NEW.actor_id IS NOT DISTINCT FROM v_designer THEN v_client
    ELSE NULL
  END;

  IF NEW.action = 'MESSAGE_POSTED' THEN
    IF NEW.payload ->> 'thread_kind' = 'client_team' THEN
      IF NEW.actor_id IS NOT DISTINCT FROM v_client THEN
        PERFORM app.notify(v_pod_lead, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the client.');
      ELSE
        PERFORM app.notify(v_client, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the team.');
      END IF;
    ELSIF NEW.payload ->> 'thread_kind' = 'internal' THEN
      IF NEW.actor_id IS NOT DISTINCT FROM v_designer THEN
        PERFORM app.notify(v_pod_lead, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the designer.');
      ELSE
        PERFORM app.notify(v_designer, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the team.');
      END IF;
    END IF;
  ELSIF NEW.action = 'FILE_VERSION_ADDED' THEN
    -- A client attachment tells the designer. A designer upload tells nobody:
    -- the client hears at first look, after QC, not ten times mid-job.
    IF NEW.actor_id IS NOT DISTINCT FROM v_client THEN
      PERFORM app.notify(v_designer, NEW.actor_id, 'FILE', NEW.entity_id, 'A new file was added to your order.');
    END IF;
  ELSIF NEW.action = 'ORDER_QUOTED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'QUOTED', NEW.entity_id, 'Your order has been quoted.');
  ELSIF NEW.action = 'ESCROW_RELEASED' THEN
    PERFORM app.notify(v_designer, NEW.actor_id, 'PAYOUT', NEW.entity_id, 'Your payout has been released.');
  ELSIF NEW.action = 'ESCROW_REFUNDED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'REFUNDED', NEW.entity_id, 'Your order has been refunded.');
  ELSIF NEW.action = 'DISPUTE_RAISED' THEN
    PERFORM app.notify(v_designer, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute was raised on your order.');
  ELSIF NEW.action = 'DISPUTE_RESOLVED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute on your order was resolved.');
    PERFORM app.notify(v_designer, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute on your order was resolved.');
  ELSIF NEW.action = 'ORDER_STATUS_CHANGED' THEN
    v_to := NEW.payload ->> 'to';
    IF v_to = 'ASSIGNED' THEN
      PERFORM app.notify(v_designer, NEW.actor_id, 'ASSIGNED', NEW.entity_id, 'You have been assigned to an order.');
    ELSIF v_to = 'CLIENT_PREVIEW' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'PREVIEW', NEW.entity_id, 'Your order is ready to preview.');
    ELSIF v_to = 'DELIVERED' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'DELIVERED', NEW.entity_id, 'Your order has been delivered.');
    ELSIF v_to = 'DESIGNER_SUBMITTED' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'SUBMITTED', NEW.entity_id, 'Work has been submitted on your order.');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- notifications are best-effort; never break the business action
END
$$;
