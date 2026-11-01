-- 0059_qc_checklist_v2.sql
--
-- Phase 13d (owner's QC sheet, 1 Nov 2026): the 19-line checklist becomes a
-- two-stage QC — the designer's check and the QC manager's check — each line
-- marked Pass or Fail with an optional finding (the measured value) and a
-- remark. The owner's "client information" section is left out (the brief
-- already carries it).
--
-- 1. checklist_items: a stage (DESIGNER / MANAGER; the 19 old lines become
--    LEGACY), a specification standard, an order and an active flag. The old
--    lines stay, inactive, so earlier versions' marks and certificates still
--    read. Designer check: the sheet's six lines plus three technical ones
--    the factory needs (owner answer). QC manager check: the sheet's five.
-- 2. order_checks: outcome (PASS / FAIL), finding, remark. The signature and
--    date on the sheet are the recorded person and time of each mark, of the
--    submission and of the QC decision.
-- 3. mark_check(): one call marks or clears a line. Designer lines: the
--    assigned designer, while in progress. Manager lines: the order's pod
--    lead, in QC review, never the person who designed it. tick_check() stays
--    as a thin wrapper (ticked = Pass) for anything still calling it.
-- 4. Gates: submitting needs every designer line passed; QC passing needs
--    every manager line passed (app.ticks_complete). transition_order and
--    record_qc_decision are 0041's, word for word, except their messages.
-- 5. qc_decide(): the QC manager's decision. Send back writes the revision
--    note from the failed lines (label — finding — remark) plus anything the
--    manager adds, so the designer reads exactly what failed (owner answer).
-- 6. job_checklist() returns the stage, standard, outcome, finding and remark;
--    certificate_data() lists the lines that applied to that version.

-- ------------------------------------------------------------ the lines --

ALTER TABLE public.checklist_items DROP CONSTRAINT IF EXISTS checklist_items_id_check;
ALTER TABLE public.checklist_items
  ADD CONSTRAINT checklist_items_id_check CHECK (id BETWEEN 1 AND 999),
  ADD COLUMN stage    text     NOT NULL DEFAULT 'LEGACY' CHECK (stage IN ('LEGACY', 'DESIGNER', 'MANAGER')),
  ADD COLUMN standard text,
  ADD COLUMN position smallint,
  ADD COLUMN active   boolean  NOT NULL DEFAULT true;

UPDATE public.checklist_items SET active = false, position = id WHERE id BETWEEN 1 AND 19;

INSERT INTO public.checklist_items (id, group_name, label, standard, flag, is_signoff, stage, position, active) VALUES
  (101, 'Designer check', 'Size and all measurements', 'Dimensions and scale match the brief', NULL, false, 'DESIGNER', 101, true),
  (102, 'Designer check', 'Diamond sizes, colours and count', 'Stone count and colour checked', NULL, false, 'DESIGNER', 102, true),
  (103, 'Designer check', 'Setting type', 'Prong, bezel or pavé as briefed', NULL, false, 'DESIGNER', 103, true),
  (104, 'Designer check', 'Metal colour and karat', 'Karat and tone accurate', NULL, false, 'DESIGNER', 104, true),
  (105, 'Designer check', 'Client''s special remarks', 'Custom instructions followed', NULL, false, 'DESIGNER', 105, true),
  (106, 'Designer check', 'Overall design look, every measurement marked', 'CAD and render measurement check', NULL, false, 'DESIGNER', 106, true),
  (107, 'Designer check', 'No open or naked edges', 'All geometry closed', 'CRITICAL', false, 'DESIGNER', 107, true),
  (108, 'Designer check', 'STL mesh', 'Max distance / edge 0.005', NULL, false, 'DESIGNER', 108, true),
  (109, 'Designer check', 'Files exported', '3DM, STL, render image (four views) and technical image', NULL, false, 'DESIGNER', 109, true),
  (201, 'QC manager check', 'Overall design look', 'Final aesthetics and quality', NULL, false, 'MANAGER', 201, true),
  (202, 'QC manager check', 'Diamond sizes, shapes and colours', 'Final diamond inspection', NULL, false, 'MANAGER', 202, true),
  (203, 'QC manager check', 'All measurements', 'Final dimension and weight check', NULL, false, 'MANAGER', 203, true),
  (204, 'QC manager check', 'Setting type, metal colour and karat', 'Final metal and setting check', NULL, false, 'MANAGER', 204, true),
  (205, 'QC manager check', 'Client''s special remarks', 'Final client requirement compliance', NULL, false, 'MANAGER', 205, true);

ALTER TABLE public.checklist_items ALTER COLUMN position SET NOT NULL;

ALTER TABLE public.order_checks
  ADD COLUMN outcome text CHECK (outcome IN ('PASS', 'FAIL')),
  ADD COLUMN finding text CHECK (char_length(finding) <= 300),
  ADD COLUMN remark  text CHECK (char_length(remark) <= 500);

-- -------------------------------------------------------------- gates --

-- Every active line of the stage is marked, and passed. A mark with no
-- outcome is a tick from before 0059, which meant pass.
CREATE OR REPLACE FUNCTION app.ticks_complete(p_order_id text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.checklist_items i
       JOIN public.orders o ON o.id = p_order_id
       LEFT JOIN public.order_checks c
         ON c.order_id = o.id AND c.version = o.work_version AND c.item_id = i.id
       WHERE i.active
         AND i.stage = CASE p_column WHEN 'designer' THEN 'DESIGNER' ELSE 'MANAGER' END
         AND ((CASE p_column WHEN 'designer' THEN c.designer_at ELSE c.qc_at END) IS NULL
              OR coalesce(c.outcome, 'PASS') <> 'PASS'))
$$;

REVOKE ALL ON FUNCTION app.ticks_complete(text, text) FROM PUBLIC;

-- ------------------------------------------------------------ marking --

CREATE OR REPLACE FUNCTION public.mark_check(
  p_order_id text,
  p_item_id  integer,
  p_outcome  text,
  p_finding  text DEFAULT NULL,
  p_remark   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_stage    text;
  v_set      boolean := p_outcome IS NOT NULL;
  v_finding  text := nullif(btrim(coalesce(p_finding, '')), '');
  v_remark   text := nullif(btrim(coalesce(p_remark, '')), '');
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_set AND p_outcome NOT IN ('PASS', 'FAIL') THEN RAISE EXCEPTION 'a line is marked PASS or FAIL'; END IF;
  IF char_length(v_finding) > 300 THEN RAISE EXCEPTION 'a finding is at most 300 characters'; END IF;
  IF char_length(v_remark) > 500 THEN RAISE EXCEPTION 'a remark is at most 500 characters'; END IF;
  IF NOT v_set THEN v_finding := NULL; v_remark := NULL; END IF;

  SELECT stage INTO v_stage FROM public.checklist_items WHERE id = p_item_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such checklist item'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_stage = 'DESIGNER' THEN
    IF NOT app.is_assigned_designer(p_order_id) THEN
      RAISE EXCEPTION 'only the assigned designer marks the designer check';
    END IF;
    IF v_order.status <> 'IN_PROGRESS' THEN
      RAISE EXCEPTION 'the designer check is open only while the job is in progress (is %)', v_order.status;
    END IF;
    INSERT INTO public.order_checks (order_id, version, item_id, designer_by, designer_at, outcome, finding, remark)
    VALUES (p_order_id, v_order.work_version, p_item_id,
            CASE WHEN v_set THEN v_clerk_id END, CASE WHEN v_set THEN now() END, p_outcome, v_finding, v_remark)
    ON CONFLICT (order_id, version, item_id) DO UPDATE
      SET designer_by = EXCLUDED.designer_by, designer_at = EXCLUDED.designer_at,
          outcome = EXCLUDED.outcome, finding = EXCLUDED.finding, remark = EXCLUDED.remark;
  ELSE
    IF NOT app.is_pod_lead_of(v_order.pod_id) THEN
      RAISE EXCEPTION 'only this order''s pod lead marks the QC manager check';
    END IF;
    IF v_order.designer_id IS NOT DISTINCT FROM v_clerk_id THEN
      RAISE EXCEPTION 'independent QC: you cannot review work you produced';
    END IF;
    IF v_order.status <> 'QC_REVIEW' THEN
      RAISE EXCEPTION 'the QC manager check is open only in QC review (is %)', v_order.status;
    END IF;
    INSERT INTO public.order_checks (order_id, version, item_id, qc_by, qc_at, outcome, finding, remark)
    VALUES (p_order_id, v_order.work_version, p_item_id,
            CASE WHEN v_set THEN v_clerk_id END, CASE WHEN v_set THEN now() END, p_outcome, v_finding, v_remark)
    ON CONFLICT (order_id, version, item_id) DO UPDATE
      SET qc_by = EXCLUDED.qc_by, qc_at = EXCLUDED.qc_at,
          outcome = EXCLUDED.outcome, finding = EXCLUDED.finding, remark = EXCLUDED.remark;
  END IF;

  PERFORM audit.log_event(
    CASE WHEN v_set THEN 'CHECK_MARKED' ELSE 'CHECK_CLEARED' END, 'order', p_order_id, v_clerk_id,
    app.current_user_role(),
    jsonb_build_object('item', p_item_id, 'stage', v_stage, 'outcome', p_outcome, 'version', v_order.work_version)
  );
  RETURN jsonb_build_object('order_id', p_order_id, 'item', p_item_id, 'stage', v_stage, 'outcome', p_outcome);
END
$$;

REVOKE ALL ON FUNCTION public.mark_check(text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_check(text, integer, text, text, text) TO authenticated, service_role;

-- 0041's tick, kept for anything still calling it: a tick is a Pass, an
-- untick clears the line. The column must match the line's stage.
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
  v_stage text;
BEGIN
  IF p_column NOT IN ('designer', 'qc') THEN RAISE EXCEPTION 'column must be designer or qc'; END IF;
  SELECT stage INTO v_stage FROM public.checklist_items WHERE id = p_item_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such checklist item'; END IF;
  IF v_stage <> (CASE p_column WHEN 'designer' THEN 'DESIGNER' ELSE 'MANAGER' END) THEN
    RAISE EXCEPTION 'that line belongs to the % check', lower(v_stage);
  END IF;
  RETURN public.mark_check(p_order_id, p_item_id, CASE WHEN p_ticked THEN 'PASS' END);
END
$$;

-- ----------------------------------------------------------- decision --

-- The QC manager's decision. PASS: every manager line passed (and, for CAD,
-- the measurements — 0050's gate). REVISION: the note is the failed lines,
-- then whatever the manager adds; it needs at least one of the two.
CREATE OR REPLACE FUNCTION public.qc_decide(p_order_id text, p_outcome text, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failed text;
  v_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('PASS', 'REVISION') THEN
    RAISE EXCEPTION 'outcome must be PASS or REVISION';
  END IF;
  IF p_outcome = 'PASS' THEN
    RETURN public.record_qc_decision(p_order_id, 'PASS', v_notes);
  END IF;

  SELECT string_agg(
           '- ' || i.label
             || coalesce(' — ' || c.finding, '')
             || coalesce(' — ' || c.remark, ''),
           E'\n' ORDER BY i.position)
    INTO v_failed
  FROM public.order_checks c
  JOIN public.orders o ON o.id = c.order_id AND o.work_version = c.version
  JOIN public.checklist_items i ON i.id = c.item_id AND i.active AND i.stage = 'MANAGER'
  WHERE c.order_id = p_order_id AND c.qc_at IS NOT NULL AND c.outcome = 'FAIL';

  RETURN public.record_qc_decision(
    p_order_id, 'REVISION',
    nullif(concat_ws(E'\n', CASE WHEN v_failed IS NOT NULL THEN 'Failed checks:' || E'\n' || v_failed END, v_notes), ''));
END
$$;

REVOKE ALL ON FUNCTION public.qc_decide(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qc_decide(text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------- the sheet --

-- The checklist for this version, for the designer, the pod lead and admin:
-- the active lines, each with its mark. Times only — never who marked.
DROP FUNCTION IF EXISTS public.job_checklist(text);
CREATE FUNCTION public.job_checklist(p_order_id text)
RETURNS TABLE (
  item_id     smallint,
  group_name  text,
  label       text,
  standard    text,
  flag        text,
  is_signoff  boolean,
  stage       text,
  "position"  smallint,
  outcome     text,
  finding     text,
  remark      text,
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
  SELECT i.id, i.group_name, i.label, i.standard, i.flag, i.is_signoff, i.stage, i.position,
         c.outcome, c.finding, c.remark, c.designer_at, c.qc_at
  FROM public.checklist_items i
  LEFT JOIN public.order_checks c
    ON c.order_id = p_order_id AND c.version = v_version AND c.item_id = i.id
  WHERE i.active
  ORDER BY i.position;
END
$$;

REVOKE ALL ON FUNCTION public.job_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_checklist(text) TO authenticated, service_role;

-- 0041's transition_order, word for word except the checklist message.
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
      RAISE EXCEPTION 'pass every line of the designer check before submitting';
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

-- 0041's record_qc_decision, word for word except the checklist message.
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
    RAISE EXCEPTION 'pass every line of the QC manager check before passing';
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

-- 0050's certificate_data, except the checklist: the lines that applied to
-- that version (the active ones, and any marked then), with stage and outcome.
CREATE OR REPLACE FUNCTION public.certificate_data(p_order_id text, p_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_version integer;
  v_m       public.qc_measurements%ROWTYPE;
BEGIN
  IF NOT app.can_read_certificate(p_order_id) THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  -- The latest version that has measurements, unless one is asked for.
  SELECT coalesce(p_version, max(version)) INTO v_version FROM public.qc_measurements WHERE order_id = p_order_id;
  SELECT * INTO v_m FROM public.qc_measurements WHERE order_id = p_order_id AND version = v_version;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'order_ref', v_order.order_ref,
    'version', v_version,
    'category', v_order.category,
    'service', v_order.service,
    'product', (SELECT s.product::text FROM public.order_specs s WHERE s.order_id = p_order_id),
    'passed_at', (SELECT max(a.created_at) FROM audit.audit_log a
                  WHERE a.entity_type = 'order' AND a.entity_id = p_order_id AND a.action = 'ORDER_STATUS_CHANGED'
                    AND a.payload ->> 'to' = 'CLIENT_PREVIEW'),
    'measurements', jsonb_build_object(
      'min_wall_um', v_m.min_wall_um, 'min_prong_um', v_m.min_prong_um, 'stone_seats', v_m.stone_seats,
      'ring_size', v_m.ring_size, 'inner_diameter_um', v_m.inner_diameter_um,
      'mesh_tolerance_um', v_m.mesh_tolerance_um, 'open_edges', v_m.open_edges, 'recorded_at', v_m.recorded_at),
    'minimums', jsonb_build_object('wall_um', app.setting('min_wall_um'), 'prong_um', app.setting('min_prong_um')),
    'waivers', coalesce((SELECT jsonb_agg(jsonb_build_object('spec', w.spec, 'requested', w.requested, 'note', w.note,
                                                              'at', w.created_at) ORDER BY w.created_at)
                         FROM public.spec_waivers w WHERE w.order_id = p_order_id), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object('item', i.id, 'group', i.group_name, 'label', i.label,
                                                                'signoff', i.is_signoff, 'stage', i.stage,
                                                                'outcome', k.outcome, 'designer_at', k.designer_at,
                                                                'qc_at', k.qc_at) ORDER BY i.position)
                           FROM public.checklist_items i
                           LEFT JOIN public.order_checks k
                             ON k.order_id = p_order_id AND k.version = v_version AND k.item_id = i.id
                           -- A version checked before 0059 lists its 19 old lines.
                           WHERE i.active = (EXISTS (SELECT 1 FROM public.order_checks x
                                                     JOIN public.checklist_items y ON y.id = x.item_id AND y.active
                                                     WHERE x.order_id = p_order_id AND x.version = v_version)
                                             OR NOT EXISTS (SELECT 1 FROM public.order_checks x
                                                            WHERE x.order_id = p_order_id AND x.version = v_version))),
                          '[]'::jsonb),
    'designer_ref', (SELECT d.designer_ref FROM public.designer_profiles d WHERE d.user_id = v_order.designer_id),
    'pod_name', (SELECT p.name FROM public.pods p WHERE p.id = v_order.pod_id),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('slot', f.slot, 'sha256', f.sha256, 'size_bytes', f.size_bytes,
                                                            'file_name', dv.file_name) ORDER BY f.slot)
                       FROM public.deliverable_files f
                       JOIN public.deliverables dv ON dv.file_version_id = f.file_version_id
                       WHERE f.order_id = p_order_id AND f.version = v_version), '[]'::jsonb),
    'issued', EXISTS (SELECT 1 FROM public.certificates c WHERE c.order_id = p_order_id AND c.version = v_version)
  );
END
$$;
