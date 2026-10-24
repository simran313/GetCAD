-- 0048_admin_screens.sql
-- Phase 5d: the admin workspace (docs/design A1–A10) and automatic pod routing.
--
-- POD ROUTING (owner answer, October 2026). A portal order used to join no
-- pod until an admin ran assign_order_pod() by hand, so the pod lead never
-- saw it and no designer could be assigned. Now, when an order is paid
-- (PAYMENT_HELD) or confirmed and has no pod, it joins the only pod — if
-- there is exactly one pod with a pod lead. With several pods it waits in
-- the admin queue under "Choose a pod". Orders already in that state are
-- routed once, below.
--
-- ACCOUNT MANAGERS (A9). One named team member per client. No business-check
-- gate: new clients are never held back from a price (owner answer).
--
-- READS. pod_jobs() gains the queue's fields (clock state, confirmation,
-- payment, source, open dispute, pod lead) and is open to the admin roles
-- (Sales, Ops, Finance) as well as admins and pod leads; designer names
-- stay with admins and the order's own pod lead. pods_overview(),
-- admin_clients(), money_ledger(), and list_platform_users() with each
-- account's reference.

-- ------------------------------------------------------------ pod routing --

-- The pod and lead an order joins automatically, or nothing when there is
-- not exactly one pod with a lead.
CREATE OR REPLACE FUNCTION app.only_pod()
RETURNS TABLE (pod_id text, lead_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH leads AS (
    SELECT m.pod_id, m.user_id
    FROM public.pod_members m
    WHERE m.member_role = 'POD_LEAD' AND app.user_has_role(m.user_id, 'QC')
  )
  SELECT l.pod_id, l.user_id FROM leads l
  WHERE (SELECT count(DISTINCT pod_id) FROM leads) = 1
  ORDER BY l.user_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.only_pod() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.orders_auto_pod()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pod  text;
  v_lead text;
BEGIN
  IF NEW.pod_id IS NULL
     AND (NEW.status = 'PAYMENT_HELD' OR NEW.confirmed_at IS NOT NULL) THEN
    SELECT p.pod_id, p.lead_id INTO v_pod, v_lead FROM app.only_pod() p;
    IF v_pod IS NOT NULL THEN
      NEW.pod_id := v_pod;
      NEW.pod_lead_id := v_lead;
      PERFORM audit.log_event('ORDER_POD_ASSIGNED', 'order', NEW.id, NULL, NULL,
                              jsonb_build_object('pod_id', v_pod, 'automatic', true));
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_auto_pod
  BEFORE UPDATE OF status, confirmed_at ON orders
  FOR EACH ROW
  WHEN (NEW.pod_id IS NULL)
  EXECUTE FUNCTION app.orders_auto_pod();

-- Route what is already waiting, once (a no-op unless there is one pod).
-- Written directly rather than by touching confirmed_at, so no other
-- trigger on the order runs again.
DO $$
DECLARE
  v_pod  text;
  v_lead text;
  v_id   text;
BEGIN
  SELECT p.pod_id, p.lead_id INTO v_pod, v_lead FROM app.only_pod() p;
  IF v_pod IS NULL THEN RETURN; END IF;
  FOR v_id IN
    SELECT o.id FROM public.orders o
    WHERE o.pod_id IS NULL AND o.deleted_at IS NULL
      AND (o.confirmed_at IS NOT NULL
           OR o.status IN ('PAYMENT_HELD', 'ASSIGNED', 'IN_PROGRESS', 'DESIGNER_SUBMITTED', 'QC_REVIEW',
                           'REVISION_REQUESTED', 'CLIENT_PREVIEW'))
  LOOP
    UPDATE public.orders SET pod_id = v_pod, pod_lead_id = v_lead WHERE id = v_id;
    PERFORM audit.log_event('ORDER_POD_ASSIGNED', 'order', v_id, NULL, NULL,
                            jsonb_build_object('pod_id', v_pod, 'automatic', true));
  END LOOP;
END
$$;

-- ------------------------------------------------------- account managers --

CREATE TABLE client_managers (
  client_id  text        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  manager_id text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  set_by     text        REFERENCES users (id) ON DELETE RESTRICT,
  set_at     timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON client_managers FROM PUBLIC, anon, authenticated;

-- Admin only. A null manager clears it. The manager must be on the team.
CREATE OR REPLACE FUNCTION public.set_account_manager(p_client_id text, p_manager_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manager text := nullif(btrim(coalesce(p_manager_id, '')), '');
BEGIN
  PERFORM app.require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_client_id AND role = 'CLIENT') THEN
    RAISE EXCEPTION 'not a client account';
  END IF;
  IF v_manager IS NULL THEN
    DELETE FROM public.client_managers WHERE client_id = p_client_id;
  ELSE
    IF NOT (app.user_has_role(v_manager, 'OPS') OR app.user_has_role(v_manager, 'SALES')
            OR app.user_has_role(v_manager, 'FINANCE') OR app.user_has_role(v_manager, 'QC')) THEN
      RAISE EXCEPTION 'an account manager must be on the team';
    END IF;
    INSERT INTO public.client_managers (client_id, manager_id, set_by)
    VALUES (p_client_id, v_manager, app.current_clerk_id())
    ON CONFLICT (client_id) DO UPDATE
      SET manager_id = EXCLUDED.manager_id, set_by = EXCLUDED.set_by, set_at = now();
  END IF;
  PERFORM audit.log_event('ACCOUNT_MANAGER_SET', 'user', p_client_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('manager_id', v_manager));
  RETURN jsonb_build_object('client_id', p_client_id, 'manager_id', v_manager);
END
$$;

-- A9: every client by code, never by name, with their orders and manager.
CREATE OR REPLACE FUNCTION public.admin_clients()
RETURNS TABLE (
  client_id      text,
  client_code    text,
  joined_at      timestamptz,
  orders         integer,
  open_orders    integer,
  paid_cents     bigint,
  last_order_at  timestamptz,
  manager_id     text,
  manager_name   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT u.id, ca.client_code, u.created_at,
         count(o.id)::integer,
         count(o.id) FILTER (WHERE o.status NOT IN ('DRAFT', 'CLOSED', 'PAYOUT_RELEASED', 'CANCELLED', 'REFUNDED'))::integer,
         coalesce(sum(o.price_total) FILTER (WHERE o.paid_at IS NOT NULL AND o.currency = 'USD'), 0)::bigint,
         max(o.created_at),
         cm.manager_id, sp.first_name
  FROM public.users u
  LEFT JOIN public.client_accounts ca ON ca.user_id = u.id
  LEFT JOIN public.orders o ON o.client_id = u.id AND o.deleted_at IS NULL
  LEFT JOIN public.client_managers cm ON cm.client_id = u.id
  LEFT JOIN public.staff_profiles sp ON sp.user_id = cm.manager_id
  WHERE u.role = 'CLIENT' AND u.deleted_at IS NULL
  GROUP BY u.id, ca.client_code, u.created_at, cm.manager_id, sp.first_name
  ORDER BY max(o.created_at) DESC NULLS LAST, u.created_at DESC
  LIMIT 500;
END
$$;

-- ------------------------------------------------------------------ pods --

-- A4: pods with their lead and size, for the pods screen and "Choose a pod".
CREATE OR REPLACE FUNCTION public.pods_overview()
RETURNS TABLE (
  pod_id      text,
  name        text,
  lead_id     text,
  lead_name   text,
  designers   integer,
  open_orders integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT p.id, p.name,
         (SELECT m.user_id FROM public.pod_members m WHERE m.pod_id = p.id AND m.member_role = 'POD_LEAD' LIMIT 1),
         (SELECT sp.first_name FROM public.pod_members m JOIN public.staff_profiles sp ON sp.user_id = m.user_id
           WHERE m.pod_id = p.id AND m.member_role = 'POD_LEAD' LIMIT 1),
         (SELECT count(*)::integer FROM public.pod_members m WHERE m.pod_id = p.id AND m.member_role = 'DESIGNER'),
         (SELECT count(*)::integer FROM public.orders o
           WHERE o.pod_id = p.id AND o.deleted_at IS NULL
             AND o.status NOT IN ('DRAFT', 'CLOSED', 'PAYOUT_RELEASED', 'CANCELLED', 'REFUNDED'))
  FROM public.pods p
  ORDER BY p.created_at, p.name;
END
$$;

-- ----------------------------------------------------- pod_jobs, widened --

DROP FUNCTION public.pod_jobs(text);

CREATE FUNCTION public.pod_jobs(p_order_id text DEFAULT NULL)
RETURNS TABLE (
  order_id        text,
  order_ref       text,
  title           text,
  product         text,
  service         public.service_kind,
  status          public.order_status,
  category        char(1),
  minutes         integer,
  work_version    integer,
  pod_id          text,
  pod_name        text,
  pod_lead_name   text,
  designer_id     text,
  designer_ref    text,
  designer_name   text,
  client_code     text,
  started_at      timestamptz,
  submitted_at    timestamptz,
  qc_ticks        integer,
  designer_ticks  integer,
  sla_status      public.sla_status,
  sla_due_at      timestamptz,
  designer_due_at timestamptz,
  first_look_at   timestamptz,
  confirmed_at    timestamptz,
  paid_at         timestamptz,
  source          public.order_source,
  dispute_reason  text,
  currency        text,
  price_total     integer,
  qc_payout_paise integer,
  designer_payout_paise integer,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.id,
         o.order_ref,
         coalesce(nullif(btrim(s.reference_name), ''), initcap(replace(coalesce(s.product::text, o.product_type), '_', ' '))),
         coalesce(s.product::text, o.product_type),
         o.service,
         o.status,
         o.category,
         c.minutes,
         o.work_version,
         o.pod_id,
         p.name,
         lp.first_name,
         o.designer_id,
         d.designer_ref,
         CASE WHEN app.is_admin() OR o.pod_id = ANY (app.current_pod_ids()) THEN d.legal_name END,
         ca.client_code,
         app.last_moved_to(o.id, 'IN_PROGRESS'),
         app.last_moved_to(o.id, 'QC_REVIEW'),
         (SELECT count(*)::integer FROM public.order_checks k
           WHERE k.order_id = o.id AND k.version = o.work_version AND k.qc_at IS NOT NULL),
         (SELECT count(*)::integer FROM public.order_checks k
           WHERE k.order_id = o.id AND k.version = o.work_version AND k.designer_at IS NOT NULL),
         o.sla_status,
         o.sla_due_at,
         o.sla_due_at - make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60)),
         o.first_look_at,
         o.confirmed_at,
         o.paid_at,
         o.source,
         (SELECT dp.reason FROM public.disputes dp WHERE dp.order_id = o.id AND dp.status = 'OPEN'
           ORDER BY dp.created_at DESC LIMIT 1),
         o.currency,
         o.price_total,
         o.qc_payout_paise,
         o.designer_payout_paise,
         o.created_at
  FROM public.orders o
  LEFT JOIN public.order_specs s ON s.order_id = o.id
  LEFT JOIN public.job_categories c ON c.letter = o.category
  LEFT JOIN public.pods p ON p.id = o.pod_id
  LEFT JOIN public.staff_profiles lp ON lp.user_id = o.pod_lead_id
  LEFT JOIN public.designer_profiles d ON d.user_id = o.designer_id AND d.deleted_at IS NULL
  LEFT JOIN public.client_accounts ca ON ca.user_id = o.client_id
  WHERE o.deleted_at IS NULL
    AND o.status <> 'DRAFT'
    AND (app.is_admin()
         OR app.has_role('OPS') OR app.has_role('SALES') OR app.has_role('FINANCE')
         OR o.pod_id = ANY (app.current_pod_ids()))
    AND (p_order_id IS NULL OR o.id = p_order_id)
  ORDER BY o.created_at DESC, o.id
  LIMIT 1000
$$;

-- ------------------------------------------------------------- the money --

-- A8: every movement of client money, newest first, by reference.
CREATE OR REPLACE FUNCTION public.money_ledger(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id          text,
  order_id    text,
  order_ref   text,
  client_code text,
  kind        text,
  amount      integer,
  currency    text,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app.is_admin() OR app.has_role('FINANCE')) THEN
    RAISE EXCEPTION 'only an admin or finance may read the money ledger';
  END IF;
  RETURN QUERY
  SELECT e.id, e.order_id, o.order_ref, ca.client_code, e.kind::text, e.amount, e.currency, e.created_at
  FROM public.escrow_ledger e
  JOIN public.orders o ON o.id = e.order_id
  LEFT JOIN public.client_accounts ca ON ca.user_id = o.client_id
  ORDER BY e.created_at DESC, e.id
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 1000);
END
$$;

-- --------------------------------------- list_platform_users + reference --

DROP FUNCTION public.list_platform_users(text, text, integer);

CREATE FUNCTION public.list_platform_users(
  p_search text DEFAULT NULL,
  p_role   text DEFAULT NULL,
  p_limit  integer DEFAULT 200
)
RETURNS TABLE (
  id                 text,
  role               public.role,
  status             public.user_status,
  created_at         timestamptz,
  orders_as_client   integer,
  orders_as_designer integer,
  reference          text,
  reviews            integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_ops();

  IF p_role IS NOT NULL AND p_role NOT IN ('CLIENT','DESIGNER','OPS','SALES','FINANCE','QC') THEN
    RAISE EXCEPTION 'unknown role filter: %', p_role;
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.role,
         u.status,
         u.created_at,
         (SELECT count(*)::integer FROM public.orders o WHERE o.client_id   = u.id),
         (SELECT count(*)::integer FROM public.orders o WHERE o.designer_id = u.id),
         coalesce(ca.client_code, d.designer_ref),
         (SELECT count(*)::integer FROM public.orders o WHERE o.qc_reviewer_id = u.id)
  FROM public.users u
  LEFT JOIN public.client_accounts ca ON ca.user_id = u.id
  LEFT JOIN public.designer_profiles d ON d.user_id = u.id
  WHERE (p_search IS NULL OR btrim(p_search) = ''
         OR u.id ILIKE '%' || btrim(p_search) || '%'
         OR ca.client_code ILIKE '%' || btrim(p_search) || '%'
         OR d.designer_ref ILIKE '%' || btrim(p_search) || '%')
    AND (p_role IS NULL OR u.role = p_role::public.role)
  ORDER BY u.created_at DESC
  LIMIT greatest(coalesce(p_limit, 200), 1);
END
$$;

REVOKE ALL ON FUNCTION app.orders_auto_pod()                          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_account_manager(text, text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clients()                         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pods_overview()                         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_jobs(text)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.money_ledger(integer)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_platform_users(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_account_manager(text, text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_clients()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pods_overview()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_jobs(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.money_ledger(integer)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_platform_users(text, text, integer) TO authenticated, service_role;
