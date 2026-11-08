-- 0066 — One order, one designer; the pod lead can take a job back
-- (owner, 8 Nov 2026: "the Assign button keeps appearing ... one order can be
-- parked with one designer only, assigned only once; the pod lead can clear
-- the order from a designer or withdraw it, it disappears from the designer,
-- and the admins are told").
--
-- 1. assign_designer (0041) refused nothing once an order was ASSIGNED: the
--    same order could be assigned again, each time a new assignment row and
--    a new "assigned" notice. Now it assigns only an order with no designer;
--    a job with one is moved (reassign_job, 0058) or taken back (below).
-- 2. withdraw_job: an admin or the order's pod lead takes an assigned or
--    in-progress job back from its designer (a reason once work has
--    started). The order is waiting for a designer again (PAYMENT_HELD, no
--    designer); the open assignment ends, an open pause closes (0057's
--    trigger), the designer is told and so is every admin. Audited
--    JOB_WITHDRAWN. Pay set at assignment is set again by the next one (0065).
--
-- Forward-only; no table changes.

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

  -- One order, one designer (owner, 8 Nov 2026): once it is with a designer
  -- it is moved (reassign_job) or taken back (withdraw_job), never assigned
  -- again on top.
  IF v_order.status = 'ASSIGNED' OR v_order.designer_id IS NOT NULL THEN
    RAISE EXCEPTION 'this job is already with a designer: move it to another designer or take it back';
  END IF;
  IF v_order.status <> 'PAYMENT_HELD' THEN
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

CREATE OR REPLACE FUNCTION public.withdraw_job(p_order_id text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk  text := app.current_clerk_id();
  v_order  public.orders%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_role   public.role;
  v_admin  record;
BEGIN
  IF v_clerk IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF app.is_pod_lead_of(v_order.pod_id) THEN
    v_role := 'QC';
  ELSIF app.is_admin() THEN
    v_role := 'OPS';
  ELSE
    RAISE EXCEPTION 'only an admin or this order''s pod lead may take a job back';
  END IF;
  IF v_order.designer_id IS NULL OR v_order.status NOT IN ('ASSIGNED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'only a job that is assigned or in progress can be taken back (is %)', v_order.status;
  END IF;
  IF v_order.status <> 'ASSIGNED' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'say why the job is taken back (work has started)';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'keep the reason under 500 characters';
  END IF;

  UPDATE public.job_assignments SET ended_at = now() WHERE order_id = p_order_id AND ended_at IS NULL;
  UPDATE public.orders SET designer_id = NULL, status = 'PAYMENT_HELD' WHERE id = p_order_id;

  PERFORM audit.log_event('JOB_WITHDRAWN', 'order', p_order_id, v_clerk, v_role,
                          jsonb_build_object('from_status', v_order.status) ||
                          CASE WHEN v_reason IS NOT NULL THEN jsonb_build_object('reason', v_reason) ELSE '{}'::jsonb END);
  PERFORM app.notify(v_order.designer_id, v_clerk, 'ASSIGNED', p_order_id, 'A job was taken back from you');
  FOR v_admin IN
    SELECT u.id FROM public.users u
    WHERE u.status = 'ACTIVE' AND u.id <> v_clerk
      AND app.user_has_role(u.id, 'SALES') AND app.user_has_role(u.id, 'OPS') AND app.user_has_role(u.id, 'FINANCE')
  LOOP
    PERFORM app.notify(v_admin.id, v_clerk, 'ESCALATED', p_order_id,
                       'A job was taken back from its designer and is waiting for a designer again');
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'to', 'PAYMENT_HELD');
END
$$;

REVOKE ALL ON FUNCTION public.withdraw_job(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_job(text, text) TO authenticated, service_role;
