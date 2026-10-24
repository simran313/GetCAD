-- 0047_work_screens.sql
-- Phase 5c: what the designer and pod lead screens read (docs/design D2–D6,
-- P1–P5). Read-only functions; every rule about acting stays where it is
-- (assign_designer, tick_check, add_slot_file, transition_order,
-- record_qc_decision).
--
--   my_work()     — the designer's own jobs, by job code, with the clock:
--                   when they pressed Start work (the timer is category
--                   minutes from there, DECISIONS §6) and when they last
--                   submitted. Never the client, the price or the order ref.
--   pod_jobs()    — the team's view of work in its pods (admin: every pod):
--                   designer, client code, clock and QC progress, for the
--                   QC queue, the team board and the pod's order list.
--   pod_load()    — designers in the caller's pods with their open minutes.
--   my_earnings() — what the caller is owed or was paid (payout_obligations),
--                   with the job it was for.

-- When an order last moved to a status, from the audit log.
CREATE OR REPLACE FUNCTION app.last_moved_to(p_order_id text, p_status text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT max(a.created_at)
  FROM audit.audit_log a
  WHERE a.entity_type = 'order'
    AND a.entity_id = p_order_id
    AND a.action = 'ORDER_STATUS_CHANGED'
    AND a.payload ->> 'to' = p_status
$$;

REVOKE ALL ON FUNCTION app.last_moved_to(text, text) FROM PUBLIC;

-- ---------------------------------------------------------------- my_work --

CREATE OR REPLACE FUNCTION public.my_work(p_order_id text DEFAULT NULL)
RETURNS TABLE (
  order_id         text,
  job_code         text,
  product          text,
  centre_shape     text,
  service          public.service_kind,
  status           public.order_status,
  category         char(1),
  minutes          integer,
  pay_paise        integer,
  work_version     integer,
  assigned_at      timestamptz,
  started_at       timestamptz,
  submitted_at     timestamptz,
  designer_due_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.id,
         o.job_code,
         coalesce(s.product::text, 'OTHER'),
         CASE WHEN s.has_centre_stone THEN s.centre_shape::text END,
         o.service,
         o.status,
         o.category,
         c.minutes,
         o.designer_payout_paise,
         o.work_version,
         (SELECT max(j.assigned_at) FROM public.job_assignments j
           WHERE j.order_id = o.id AND j.designer_id = o.designer_id),
         app.last_moved_to(o.id, 'IN_PROGRESS'),
         app.last_moved_to(o.id, 'QC_REVIEW'),
         o.sla_due_at - make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60))
  FROM public.orders o
  LEFT JOIN public.order_specs s ON s.order_id = o.id
  LEFT JOIN public.job_categories c ON c.letter = o.category
  WHERE o.designer_id = app.current_clerk_id()
    AND app.current_user_role() = 'DESIGNER'
    AND o.deleted_at IS NULL
    AND (p_order_id IS NULL OR o.id = p_order_id)
  ORDER BY o.sla_due_at NULLS LAST, o.created_at DESC
  LIMIT 300
$$;

-- --------------------------------------------------------------- pod_jobs --

CREATE OR REPLACE FUNCTION public.pod_jobs(p_order_id text DEFAULT NULL)
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
  designer_id     text,
  designer_ref    text,
  designer_name   text,
  client_code     text,
  started_at      timestamptz,
  submitted_at    timestamptz,
  qc_ticks        integer,
  designer_ticks  integer,
  sla_due_at      timestamptz,
  designer_due_at timestamptz,
  currency        text,
  price_total     integer,
  qc_payout_paise integer,
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
         o.designer_id,
         d.designer_ref,
         d.legal_name,
         ca.client_code,
         app.last_moved_to(o.id, 'IN_PROGRESS'),
         app.last_moved_to(o.id, 'QC_REVIEW'),
         (SELECT count(*)::integer FROM public.order_checks k
           WHERE k.order_id = o.id AND k.version = o.work_version AND k.qc_at IS NOT NULL),
         (SELECT count(*)::integer FROM public.order_checks k
           WHERE k.order_id = o.id AND k.version = o.work_version AND k.designer_at IS NOT NULL),
         o.sla_due_at,
         o.sla_due_at - make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60)),
         o.currency,
         o.price_total,
         o.qc_payout_paise,
         o.created_at
  FROM public.orders o
  LEFT JOIN public.order_specs s ON s.order_id = o.id
  LEFT JOIN public.job_categories c ON c.letter = o.category
  LEFT JOIN public.pods p ON p.id = o.pod_id
  LEFT JOIN public.designer_profiles d ON d.user_id = o.designer_id AND d.deleted_at IS NULL
  LEFT JOIN public.client_accounts ca ON ca.user_id = o.client_id
  WHERE o.deleted_at IS NULL
    AND o.status <> 'DRAFT'
    AND (app.is_admin() OR o.pod_id = ANY (app.current_pod_ids()))
    AND (p_order_id IS NULL OR o.id = p_order_id)
  ORDER BY o.created_at DESC, o.id
  LIMIT 500
$$;

-- --------------------------------------------------------------- pod_load --

CREATE OR REPLACE FUNCTION public.pod_load()
RETURNS TABLE (
  designer_id   text,
  designer_ref  text,
  name          text,
  pod_id        text,
  pod_name      text,
  open_minutes  integer,
  shift_minutes integer,
  assignable    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.user_id, d.designer_ref, d.legal_name, m.pod_id, p.name,
         app.designer_open_minutes(m.user_id),
         coalesce(app.setting('shift_minutes'), 480)::integer,
         app.designer_is_assignable(m.user_id)
  FROM public.pod_members m
  JOIN public.pods p ON p.id = m.pod_id
  LEFT JOIN public.designer_profiles d ON d.user_id = m.user_id AND d.deleted_at IS NULL
  WHERE m.member_role = 'DESIGNER'
    AND (app.is_admin() OR m.pod_id = ANY (app.current_pod_ids()))
  ORDER BY p.name, d.designer_ref NULLS LAST, m.user_id
$$;

-- ------------------------------------------------------------ my_earnings --

CREATE OR REPLACE FUNCTION public.my_earnings()
RETURNS TABLE (
  obligation_id text,
  order_id      text,
  display_ref   text,
  product       text,
  category      char(1),
  minutes       integer,
  party         text,
  amount_paise  integer,
  status        text,
  created_at    timestamptz,
  exported_at   timestamptz,
  paid_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT b.id, b.order_id,
         CASE WHEN b.party = 'DESIGNER' THEN o.job_code ELSE o.order_ref END,
         coalesce(s.product::text, 'OTHER'),
         o.category, c.minutes, b.party, b.amount_paise, b.status,
         b.created_at, b.exported_at, b.paid_at
  FROM public.payout_obligations b
  JOIN public.orders o ON o.id = b.order_id
  LEFT JOIN public.order_specs s ON s.order_id = o.id
  LEFT JOIN public.job_categories c ON c.letter = o.category
  WHERE b.payee_id = app.current_clerk_id()
    AND b.status <> 'void'
  ORDER BY b.created_at DESC, b.id
  LIMIT 500
$$;

REVOKE ALL ON FUNCTION public.my_work(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_jobs(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_load()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_earnings()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_work(text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_jobs(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_load()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_earnings()  TO authenticated, service_role;
