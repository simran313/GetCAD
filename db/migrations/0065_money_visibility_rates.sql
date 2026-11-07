-- 0065 — Who sees money, and the new pay rules (owner, 7 Nov 2026).
--
-- 1. A pod lead or a designer never sees what the client pays.
--      Designer: their own pay only (unchanged; visible_orders hid the rest).
--      Pod lead: the designer's pay and the pod's pay, never the price, the
--      split or the client's payments. Until now a pod lead read the price in
--      visible_orders and pod_jobs, could select it from orders directly, and
--      could read the client's payments on escrow_ledger.
--    Columns: the money columns of orders leave the SELECT grant (policies
--    0048), so the only way to them is visible_orders / pod_jobs, which show
--    the price only to the client, admins and Sales / Ops / Finance.
--
-- 2. Designer pay = category minutes × ₹8 a minute (was ₹500 an hour). One
--    standard rate in app_settings; an admin may set a designer's own rate
--    (designer_rates). The pod lead sees the rates of their pod's designers
--    and cannot change them; a designer never sees a rate.
--    The rate is the assigned designer's, so pay is set at quote with the
--    standard rate and set again when a designer is assigned or the job moves
--    to another designer (trigger orders_reprice_on_assign), audited.
--
-- 3. Pod pay = 50 % of the designer's pay, at least ₹300 (both settings).
--    Before, it was worked out from the price (max(₹500, USD × 1000 / 60)),
--    so a pod lead could work the price back from their own pay.
--
-- Forward-only. Orders already quoted keep the pay they were quoted with
-- until a designer is next assigned to them.

-- ------------------------------------------------------------ settings --

INSERT INTO public.app_settings (key, value, description) VALUES
  ('designer_rate_paise_per_minute', 800,   'Standard designer pay per category minute, paise (₹8.00)'),
  ('pod_share_pct',                  50,    'Pod pay as a % of the designer''s pay on the job'),
  ('pod_min_paise',                  30000, 'Least pod pay on a job, paise (₹300)')
ON CONFLICT (key) DO NOTHING;

-- The category table's own rate column follows the standard rate, so nothing
-- that still reads it disagrees with what a job pays. Pay is now minutes × a
-- per-minute rate, so the per-category rate setter (0035, unused by the app)
-- goes: left in place it would change nothing and look as if it did.
UPDATE public.job_categories SET designer_rate_paise = minutes * 800, updated_at = now();
DROP FUNCTION IF EXISTS public.set_category_rate(text, integer);

-- --------------------------------------------------------- designer rates --

-- An admin's rate for one designer; no row = the standard rate. No grants and
-- no policies: read through team_designer_rates(), written by set_designer_rate().
CREATE TABLE public.designer_rates (
  designer_id      text        PRIMARY KEY REFERENCES public.users (id) ON DELETE RESTRICT,
  paise_per_minute integer     NOT NULL CHECK (paise_per_minute BETWEEN 1 AND 100000),
  updated_by       text        REFERENCES public.users (id) ON DELETE RESTRICT,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.designer_rate_paise(p_designer_id text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT r.paise_per_minute FROM public.designer_rates r WHERE r.designer_id = p_designer_id),
    app.setting('designer_rate_paise_per_minute'),
    800
  )
$$;

-- Category minutes × the designer's rate (the standard rate while unassigned).
CREATE OR REPLACE FUNCTION app.designer_pay_paise(p_letter char(1), p_designer_id text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.minutes * app.designer_rate_paise(p_designer_id)
  FROM public.job_categories c
  WHERE c.letter = p_letter
$$;

-- Pod pay from the designer's pay: a share, with a floor.
CREATE OR REPLACE FUNCTION app.pod_pay_paise(p_designer_paise integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(
    coalesce(app.setting('pod_min_paise'), 30000),
    round(coalesce(p_designer_paise, 0) * coalesce(app.setting('pod_share_pct'), 50) / 100.0)::integer
  )
$$;

REVOKE ALL ON FUNCTION app.designer_rate_paise(text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION app.designer_pay_paise(char, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION app.pod_pay_paise(integer)             FROM PUBLIC;

-- Admin: set a designer's own rate, or clear it (NULL) to go back to standard.
CREATE OR REPLACE FUNCTION public.set_designer_rate(p_user_id text, p_paise_per_minute integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_before   integer;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_admin() THEN RAISE EXCEPTION 'only an admin may set a designer''s rate'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.role = 'DESIGNER') THEN
    RAISE EXCEPTION 'not a designer';
  END IF;
  IF p_paise_per_minute IS NOT NULL AND (p_paise_per_minute < 1 OR p_paise_per_minute > 100000) THEN
    RAISE EXCEPTION 'the rate must be between ₹0.01 and ₹1,000 a minute';
  END IF;

  SELECT paise_per_minute INTO v_before FROM public.designer_rates WHERE designer_id = p_user_id;

  IF p_paise_per_minute IS NULL THEN
    DELETE FROM public.designer_rates WHERE designer_id = p_user_id;
  ELSE
    INSERT INTO public.designer_rates (designer_id, paise_per_minute, updated_by, updated_at)
    VALUES (p_user_id, p_paise_per_minute, v_clerk_id, now())
    ON CONFLICT (designer_id) DO UPDATE
      SET paise_per_minute = EXCLUDED.paise_per_minute, updated_by = v_clerk_id, updated_at = now();
  END IF;

  PERFORM audit.log_event(
    'DESIGNER_RATE_SET', 'user', p_user_id, v_clerk_id, app.acting_role('OPS'),
    jsonb_build_object('before_paise_per_minute', v_before, 'after_paise_per_minute', p_paise_per_minute)
  );
END
$$;

-- The rates a viewer may see: an admin every designer's, a pod lead their
-- pod's designers'. A designer (or anyone else) gets no rows.
CREATE OR REPLACE FUNCTION public.team_designer_rates()
RETURNS TABLE (designer_id text, paise_per_minute integer, is_custom boolean, standard_paise_per_minute integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id,
         app.designer_rate_paise(u.id),
         r.designer_id IS NOT NULL,
         coalesce(app.setting('designer_rate_paise_per_minute'), 800)
  FROM public.users u
  LEFT JOIN public.designer_rates r ON r.designer_id = u.id
  LEFT JOIN public.pod_members pm ON pm.user_id = u.id
  WHERE u.role = 'DESIGNER'
    AND (app.is_admin() OR (pm.pod_id IS NOT NULL AND pm.pod_id = ANY (app.current_pod_ids())))
  ORDER BY u.id
$$;

REVOKE ALL ON FUNCTION public.set_designer_rate(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_designer_rates()           FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_designer_rate(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_designer_rates()           TO authenticated, service_role;

-- ------------------------------------------------------------- the quote --

-- 0040's quote_order_v2, word for word except the two pay lines.
CREATE OR REPLACE FUNCTION public.quote_order_v2(
  p_order_id               text,
  p_category               text    DEFAULT NULL,
  p_price_cents            integer DEFAULT NULL,
  p_complex_deadline_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id  text := app.current_clerk_id();
  v_role      public.role;
  v_order     public.orders%ROWTYPE;
  v_cat       public.job_categories%ROWTYPE;
  v_first     boolean;
  v_band      record;
  v_price     integer;
  v_designer  integer;
  v_qc        integer;
  v_fx        integer;
  v_pct       integer;
  v_payout_usd_cents integer;
  v_warning   text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_role := app.acting_role('SALES');
  IF v_role IS DISTINCT FROM 'SALES' THEN
    RAISE EXCEPTION 'only SALES may quote an order';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'can only quote a SUBMITTED order (is %)', v_order.status;
  END IF;

  SELECT * INTO v_cat FROM public.job_categories
  WHERE letter = coalesce(p_category, v_order.category);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set a category (A–L) before quoting';
  END IF;

  IF v_cat.tier = 'complex' AND coalesce(p_complex_deadline_hours, v_order.complex_deadline_hours) IS NULL THEN
    RAISE EXCEPTION 'a complex order (G–L) needs a deadline in hours with the price';
  END IF;

  v_first := app.first_design_available(v_order.client_id, p_order_id)
             AND EXISTS (SELECT 1 FROM app.band_price(v_cat.letter, true));
  SELECT * INTO v_band FROM app.band_price(v_cat.letter, v_first);
  IF v_band IS NULL THEN
    SELECT * INTO v_band FROM app.band_price(v_cat.letter, false);
    v_first := false;
  END IF;

  v_price := coalesce(p_price_cents, v_band.price_cents);
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'the price must be positive';
  END IF;
  -- An override is not the first-design offer, even if it happens to be $49.
  IF p_price_cents IS NOT NULL AND p_price_cents <> v_band.price_cents THEN
    v_first := false;
  END IF;

  -- 0065: minutes × the (assigned, else standard) designer rate; pod pay from it.
  v_designer := app.designer_pay_paise(v_cat.letter, v_order.designer_id);
  v_qc       := app.pod_pay_paise(v_designer);

  -- DECISIONS §4: warn if payouts exceed 40 % of the price, at the admin rate.
  v_fx  := coalesce(app.setting('usd_inr_paise_per_usd'), 8400);
  v_pct := coalesce(app.setting('payout_warning_pct'), 40);
  v_payout_usd_cents := ((v_designer + v_qc)::numeric * 100 / v_fx)::integer;
  IF v_payout_usd_cents * 100 > v_price * v_pct THEN
    v_warning := format('Payouts are %s%% of the price (limit %s%%).',
                        round(v_payout_usd_cents * 100.0 / v_price), v_pct);
  END IF;

  UPDATE public.orders
    SET category               = v_cat.letter,
        tier                   = v_cat.tier,
        complex_deadline_hours = CASE WHEN v_cat.tier = 'complex'
                                      THEN coalesce(p_complex_deadline_hours, v_order.complex_deadline_hours) END,
        price_total            = v_price,
        designer_payout        = 0,
        qc_payout              = 0,
        platform_commission    = v_price,
        designer_payout_paise  = v_designer,
        qc_payout_paise        = v_qc,
        status                 = 'QUOTED'
    WHERE id = p_order_id;

  IF v_first THEN
    PERFORM app.ensure_client_code(v_order.client_id);
    UPDATE public.client_accounts SET first_design_order_id = p_order_id WHERE user_id = v_order.client_id;
  ELSE
    UPDATE public.client_accounts SET first_design_order_id = NULL
    WHERE user_id = v_order.client_id AND first_design_order_id = p_order_id;
  END IF;

  PERFORM audit.log_event(
    'ORDER_QUOTED', 'order', p_order_id, v_clerk_id, v_role,
    jsonb_build_object('from', v_order.status, 'to', 'QUOTED',
                       'price_total', v_price, 'category', v_cat.letter, 'tier', v_cat.tier,
                       'band', v_band.band, 'first_design', v_first,
                       'designer_payout_paise', v_designer, 'qc_payout_paise', v_qc,
                       'warning', v_warning)
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', 'QUOTED', 'price_total', v_price,
                            'category', v_cat.letter, 'tier', v_cat.tier, 'first_design', v_first,
                            'designer_payout_paise', v_designer, 'qc_payout_paise', v_qc,
                            'warning', v_warning);
END
$$;

-- ------------------------------------------------- pay follows the designer --

-- When a job is assigned or moved to another designer, its pay becomes that
-- designer's rate × the category minutes, and the pod's pay follows. Only on
-- a priced job that pays its designer (a free fix order keeps its 0) and has
-- not closed (pay obligations are written on close, 0042).
CREATE OR REPLACE FUNCTION app.reprice_on_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_designer integer;
  v_qc       integer;
BEGIN
  IF NEW.designer_id IS NOT NULL
     AND NEW.designer_id IS DISTINCT FROM OLD.designer_id
     AND NEW.category IS NOT NULL
     AND coalesce(NEW.designer_payout_paise, 0) > 0
     AND NEW.status NOT IN ('CLOSED', 'PAYOUT_RELEASED', 'CANCELLED', 'REFUNDED')
  THEN
    v_designer := app.designer_pay_paise(NEW.category, NEW.designer_id);
    v_qc       := app.pod_pay_paise(v_designer);
    IF v_designer IS DISTINCT FROM NEW.designer_payout_paise OR v_qc IS DISTINCT FROM NEW.qc_payout_paise THEN
      PERFORM audit.log_event(
        'ORDER_PAY_SET', 'order', NEW.id, app.current_clerk_id(), NULL,
        jsonb_build_object('reason', 'designer assigned',
                           'designer_payout_paise', jsonb_build_object('from', NEW.designer_payout_paise, 'to', v_designer),
                           'qc_payout_paise', jsonb_build_object('from', NEW.qc_payout_paise, 'to', v_qc))
      );
      NEW.designer_payout_paise := v_designer;
      NEW.qc_payout_paise       := v_qc;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.reprice_on_assign() FROM PUBLIC;

CREATE TRIGGER orders_reprice_on_assign
  BEFORE UPDATE OF designer_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.reprice_on_assign();

-- ------------------------------------------------------- who sees the price --

-- The client's price and payments: the client, admins, Sales / Ops / Finance.
-- Never a designer, a pod lead or a QC reviewer.
CREATE OR REPLACE FUNCTION app.sees_order_money()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_admin() OR app.has_role('SALES') OR app.has_role('OPS') OR app.has_role('FINANCE')
$$;

-- For one order: its client, or someone who sees order money.
CREATE OR REPLACE FUNCTION app.sees_money_of(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.client_id = app.current_clerk_id())
         OR app.sees_order_money()
$$;

REVOKE ALL ON FUNCTION app.sees_order_money()   FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sees_money_of(text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sees_order_money()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.sees_money_of(text) TO authenticated, service_role;

-- 0040's visible_orders: the price, the split and the dates of payment only to
-- whoever sees order money; the designer's pay to everyone but the client; the
-- pod's pay to everyone but the client and the designer.
CREATE OR REPLACE FUNCTION public.visible_orders(p_order_id text DEFAULT NULL)
RETURNS TABLE (
  id                    text,
  relation              text,
  display_ref           text,
  product_type          text,
  status                public.order_status,
  service               public.service_kind,
  category              char(1),
  tier                  public.job_tier,
  currency              text,
  price_total           integer,
  designer_payout       integer,
  qc_payout             integer,
  platform_commission   integer,
  designer_payout_paise integer,
  qc_payout_paise       integer,
  sla_status            public.sla_status,
  sla_due_at            timestamptz,
  designer_due_at       timestamptz,
  first_look_at         timestamptz,
  source                public.order_source,
  created_at            timestamptz,
  confirmed_at          timestamptz,
  paid_at               timestamptz,
  complex_deadline_hours integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH r AS (
    SELECT o.*, app.order_relation(o.id) AS rel, s.product::text AS spec_product
    FROM public.orders o
    LEFT JOIN public.order_specs s ON s.order_id = o.id
    WHERE (p_order_id IS NULL OR o.id = p_order_id)
      AND o.deleted_at IS NULL
  ), v AS (
    SELECT r.*, (r.rel = 'CLIENT' OR (r.rel <> 'DESIGNER' AND app.sees_order_money())) AS money
    FROM r
  )
  SELECT
    v.id,
    v.rel,
    CASE WHEN v.rel = 'DESIGNER' THEN v.job_code ELSE v.order_ref END,
    CASE WHEN v.rel = 'DESIGNER' THEN coalesce(v.spec_product, 'OTHER') ELSE v.product_type END,
    v.status,
    v.service,
    v.category,
    v.tier,
    CASE WHEN v.money THEN v.currency END,
    CASE WHEN v.money THEN v.price_total END,
    CASE WHEN v.money THEN v.designer_payout END,
    CASE WHEN v.money THEN v.qc_payout END,
    CASE WHEN v.money THEN v.platform_commission END,
    CASE WHEN v.rel = 'CLIENT' THEN NULL ELSE v.designer_payout_paise END,
    CASE WHEN v.rel IN ('CLIENT', 'DESIGNER') THEN NULL ELSE v.qc_payout_paise END,
    v.sla_status,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.sla_due_at END,
    v.sla_due_at - make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60)),
    v.first_look_at,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.source END,
    v.created_at,
    v.confirmed_at,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.paid_at END,
    v.complex_deadline_hours
  FROM v
  WHERE v.rel IS NOT NULL
  ORDER BY v.created_at DESC, v.id
$$;

-- 0048's pod_jobs: the price only to whoever sees order money.
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
         CASE WHEN app.sees_order_money() THEN o.currency END,
         CASE WHEN app.sees_order_money() THEN o.price_total END,
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
