-- 0058_pod_ops.sql
--
-- Phase 13c (owner brief, 1 Nov 2026): the pod lead runs the workflow and
-- measures it, from recorded data only.
--
-- 1. reassign_job(): move a job to another designer of the pod while it is
--    assigned, in progress or waiting on changes (assign_designer only
--    staffs a job that has not started). A reason is required once work has
--    started. The first designer's open pause closes (0057's trigger); the
--    new designer starts with Start work.
-- 2. Escalations: a pod lead raises a job to the admins with a reason; an
--    admin resolves it with a note. Each is audited and notifies.
-- 3. pod_activity(): the raw, attributed record the reports are built from
--    — every status change and every pause, each with the designer who held
--    the job at that moment (from job_assignments' intervals; the audit log
--    itself carries no designer id, 0036).
-- 4. sweep_job_alerts(): run by the 5-minute sweep. Once per job version, a
--    "due within the hour" reminder to the designer and an "overdue" alert
--    to the designer and the pod lead.

-- ------------------------------------------------------------ reassign --

CREATE OR REPLACE FUNCTION public.reassign_job(
  p_order_id    text,
  p_designer_id text,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk  text := app.current_clerk_id();
  v_order  public.orders%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to     public.order_status;
  v_role   public.role;
BEGIN
  IF v_clerk IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF app.is_pod_lead_of(v_order.pod_id) THEN
    v_role := 'QC';
  ELSIF app.is_admin() THEN
    v_role := 'OPS';
  ELSE
    RAISE EXCEPTION 'only an admin or this order''s pod lead may move it';
  END IF;
  IF v_order.status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'only a job that is assigned, in progress or waiting on changes can be moved (is %)', v_order.status;
  END IF;
  IF p_designer_id IS NULL OR p_designer_id IS NOT DISTINCT FROM v_order.designer_id THEN
    RAISE EXCEPTION 'choose a different designer';
  END IF;
  IF v_order.status <> 'ASSIGNED' AND (v_reason IS NULL OR char_length(v_reason) > 500) THEN
    RAISE EXCEPTION 'say why the job moves (work has started)';
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

  -- In progress goes back to Assigned for the new designer; a job waiting
  -- on changes keeps waiting, now on them.
  v_to := CASE WHEN v_order.status = 'REVISION_REQUESTED' THEN 'REVISION_REQUESTED' ELSE 'ASSIGNED' END;

  UPDATE public.job_assignments SET ended_at = now() WHERE order_id = p_order_id AND ended_at IS NULL;
  INSERT INTO public.job_assignments (order_id, designer_id, assigned_by, override_reason)
  VALUES (p_order_id, p_designer_id, v_clerk, v_reason);
  UPDATE public.orders SET designer_id = p_designer_id, status = v_to WHERE id = p_order_id;

  PERFORM audit.log_event('JOB_REASSIGNED', 'order', p_order_id, v_clerk, v_role,
                          jsonb_build_object('from_status', v_order.status) ||
                          CASE WHEN v_reason IS NOT NULL THEN jsonb_build_object('reason', v_reason) ELSE '{}'::jsonb END);
  IF v_to IS DISTINCT FROM v_order.status THEN
    -- An ordinary status change too: the timeline and the new designer's
    -- notification come from it (0015).
    PERFORM audit.log_event('ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk, v_role,
                            jsonb_build_object('from', v_order.status, 'to', v_to));
  ELSE
    PERFORM app.notify(p_designer_id, v_clerk, 'ASSIGNED', p_order_id, 'A job waiting on changes was moved to you');
  END IF;
  PERFORM app.notify(v_order.designer_id, v_clerk, 'ASSIGNED', p_order_id, 'A job was moved to another designer');

  RETURN jsonb_build_object('order_id', p_order_id, 'to', v_to);
END
$$;

-- ---------------------------------------------------------- escalations --

CREATE TABLE job_escalations (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id    text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  raised_by   text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason      text        NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by text        REFERENCES users (id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolution  text        CHECK (resolution IS NULL OR char_length(resolution) <= 1000),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);

-- One open escalation per job.
CREATE UNIQUE INDEX job_escalations_one_open ON job_escalations (order_id) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.escalate_job(p_order_id text, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk text := app.current_clerk_id();
  v_pod   text;
  v_id    text;
  v_admin record;
BEGIN
  SELECT pod_id INTO v_pod FROM public.orders WHERE id = p_order_id;
  IF v_clerk IS NULL OR NOT (app.is_pod_lead_of(v_pod) OR app.is_admin()) THEN
    RAISE EXCEPTION 'only an admin or this order''s pod lead may escalate it';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'say what needs an admin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_escalations WHERE order_id = p_order_id AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'this job is already escalated';
  END IF;
  INSERT INTO public.job_escalations (order_id, raised_by, reason) VALUES (p_order_id, v_clerk, btrim(p_reason))
  RETURNING id INTO v_id;
  PERFORM audit.log_event('JOB_ESCALATED', 'order', p_order_id, v_clerk, app.current_user_role(),
                          jsonb_build_object('escalation_id', v_id));
  FOR v_admin IN
    SELECT u.id FROM public.users u
    WHERE u.status = 'ACTIVE'
      AND app.user_has_role(u.id, 'SALES') AND app.user_has_role(u.id, 'OPS') AND app.user_has_role(u.id, 'FINANCE')
  LOOP
    PERFORM app.notify(v_admin.id, v_clerk, 'ESCALATED', p_order_id, 'A pod lead escalated a job');
  END LOOP;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.resolve_escalation(p_id text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.job_escalations%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN RAISE EXCEPTION 'only an admin resolves escalations'; END IF;
  SELECT * INTO v_row FROM public.job_escalations WHERE id = p_id AND resolved_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation not found'; END IF;
  UPDATE public.job_escalations
     SET resolved_at = now(), resolved_by = app.current_clerk_id(), resolution = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_id;
  PERFORM audit.log_event('JOB_ESCALATION_RESOLVED', 'order', v_row.order_id, app.current_clerk_id(), app.current_user_role(),
                          jsonb_build_object('escalation_id', p_id));
  PERFORM app.notify(v_row.raised_by, app.current_clerk_id(), 'ESCALATED', v_row.order_id, 'An admin resolved your escalation');
END
$$;

-- Open (and recently resolved) escalations: the pod's for its lead, all for admins.
CREATE OR REPLACE FUNCTION public.job_escalations_list(p_include_resolved boolean DEFAULT false)
RETURNS TABLE (
  id          text,
  order_id    text,
  order_ref   text,
  pod_name    text,
  reason      text,
  created_at  timestamptz,
  resolved_at timestamptz,
  resolution  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id, e.order_id, o.order_ref, p.name, e.reason, e.created_at, e.resolved_at, e.resolution
  FROM public.job_escalations e
  JOIN public.orders o ON o.id = e.order_id
  LEFT JOIN public.pods p ON p.id = o.pod_id
  WHERE app.current_clerk_id() IS NOT NULL
    AND (app.is_admin() OR o.pod_id = ANY (app.current_pod_ids()))
    AND (p_include_resolved OR e.resolved_at IS NULL)
  ORDER BY e.resolved_at IS NULL DESC, e.created_at DESC
  LIMIT 200
$$;

-- ------------------------------------------------------------ activity --

-- Every status change and pause on the pod's jobs since a moment, each with
-- the designer holding the job then. The reports (core/work/metrics) are
-- computed from exactly this. Pod lead: their pods; admin: all.
CREATE OR REPLACE FUNCTION public.pod_activity(p_since timestamptz)
RETURNS TABLE (
  order_id    text,
  designer_id text,
  at          timestamptz,
  kind        text,
  from_status text,
  to_status   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT o.id FROM public.orders o
    WHERE o.deleted_at IS NULL
      AND app.current_clerk_id() IS NOT NULL
      AND (app.is_admin() OR o.pod_id = ANY (app.current_pod_ids()))
  )
  SELECT a.entity_id, ja.designer_id, a.created_at, 'STATUS', a.payload ->> 'from', a.payload ->> 'to'
  FROM audit.audit_log a
  JOIN mine m ON m.id = a.entity_id
  LEFT JOIN LATERAL (
    SELECT j.designer_id FROM public.job_assignments j
    WHERE j.order_id = a.entity_id AND j.assigned_at <= a.created_at
      AND (j.ended_at IS NULL OR j.ended_at > a.created_at)
    ORDER BY j.assigned_at DESC LIMIT 1
  ) ja ON true
  WHERE a.entity_type = 'order' AND a.action = 'ORDER_STATUS_CHANGED' AND a.created_at >= p_since
  UNION ALL
  SELECT jp.order_id, jp.designer_id, jp.paused_at, 'PAUSE', NULL, NULL
  FROM public.job_pauses jp JOIN mine m ON m.id = jp.order_id
  WHERE jp.paused_at >= p_since
  UNION ALL
  SELECT jp.order_id, jp.designer_id, jp.resumed_at, 'RESUME', NULL, NULL
  FROM public.job_pauses jp JOIN mine m ON m.id = jp.order_id
  WHERE jp.resumed_at IS NOT NULL AND jp.resumed_at >= p_since
  ORDER BY 3
  LIMIT 20000
$$;

-- ---------------------------------------------------------------- alerts --

CREATE TABLE job_alerts (
  order_id text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version  integer     NOT NULL,
  kind     text        NOT NULL CHECK (kind IN ('DUE_SOON', 'OVERDUE')),
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version, kind)
);

-- Run by the 5-minute sweep (service role). Returns how many alerts it sent.
CREATE OR REPLACE FUNCTION public.sweep_job_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r    record;
  n    integer := 0;
  v_buffer integer := coalesce(app.setting('qc_buffer_minutes'), 60);
BEGIN
  FOR r IN
    SELECT o.id, o.work_version, o.designer_id, o.pod_lead_id, o.job_code,
           o.sla_due_at - make_interval(mins => v_buffer) AS due
    FROM public.orders o
    WHERE o.deleted_at IS NULL AND o.designer_id IS NOT NULL AND o.sla_due_at IS NOT NULL
      AND o.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED')
      AND o.sla_due_at - make_interval(mins => v_buffer) < now() + interval '1 hour'
  LOOP
    IF r.due < now() THEN
      INSERT INTO public.job_alerts (order_id, version, kind) VALUES (r.id, r.work_version, 'OVERDUE') ON CONFLICT DO NOTHING;
      IF FOUND THEN
        PERFORM app.notify(r.designer_id, NULL, 'OVERDUE', r.id, format('Job %s is past its due time to QC', coalesce(r.job_code, '')));
        PERFORM app.notify(r.pod_lead_id, NULL, 'OVERDUE', r.id, format('Job %s is overdue to QC', coalesce(r.job_code, '')));
        n := n + 1;
      END IF;
    ELSE
      INSERT INTO public.job_alerts (order_id, version, kind) VALUES (r.id, r.work_version, 'DUE_SOON') ON CONFLICT DO NOTHING;
      IF FOUND THEN
        PERFORM app.notify(r.designer_id, NULL, 'DUE_SOON', r.id, format('Job %s is due to QC within the hour', coalesce(r.job_code, '')));
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END
$$;

-- -------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.reassign_job(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escalate_job(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_escalation(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.job_escalations_list(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_activity(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_job_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_job(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_job(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_escalation(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.job_escalations_list(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_activity(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sweep_job_alerts() TO service_role;
