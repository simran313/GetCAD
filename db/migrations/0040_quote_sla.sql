-- 0040_quote_sla.sql
-- Phase 2: the quote, order confirmation and the 6-hour clock (DECISIONS
-- §4–§6, v1.1).
--
-- THE CLOCK (v1.1). It starts when the order is both PAID and CONFIRMED, at
-- whichever happens last. Confirmed = admin or the pod lead pressed "Confirm
-- order" once the brief is complete; paid = a HOLD on the escrow ledger, from
-- the card checkout or from admin marking a manual / Wise / PayPal payment.
-- Neither event alone starts it, so an incomplete brief never runs the clock
-- and nobody works on an unpaid order.
--
-- MET = the order reaches CLIENT_PREVIEW (first look) at or before the due
-- time. MISSED, standard tier = one PENDING credit for the amount paid, which
-- an admin decides (owner answer Q4). Complex tier = flagged, no credit.
--
-- MONEY. quote_order_v2 sets the USD price and locks designer and QC pay in
-- paise (owner answer Q2). The old USD split columns are set to "all
-- platform" so the escrow release of 0012/0023 still balances; staff pay is
-- the payout_obligations table (0037), written from Phase 3.

-- ------------------------------------------------------------ columns --

ALTER TABLE orders
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by text REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN payment_reference text CHECK (payment_reference IS NULL OR char_length(payment_reference) <= 120);

-- ----------------------------------------------------------- pricing --

-- QC / pod lead pay (DECISIONS §5): max(₹500, nearest ₹50 of USD × 1000 / 60).
-- USD × 1000 / 60 = cents / 6 rupees. Returned in paise.
CREATE OR REPLACE FUNCTION app.qc_pay_paise(p_price_cents integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT greatest(500, (round(p_price_cents::numeric / 6 / 50) * 50)::integer) * 100
$$;

-- The band price for a category, and whether the $49 first design applies.
CREATE OR REPLACE FUNCTION app.band_price(p_letter char(1), p_first_design boolean)
RETURNS TABLE (price_cents integer, band text, is_from boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT b.price_cents, b.code, b.is_from
  FROM public.price_bands b
  WHERE p_letter BETWEEN b.first_category AND b.last_category
    AND b.first_order_only = p_first_design
  ORDER BY b.price_cents
  LIMIT 1
$$;

-- The $49 first design: once per account, only before any other order was
-- paid or used it (DECISIONS §4).
CREATE OR REPLACE FUNCTION app.first_design_available(p_client_id text, p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.client_accounts a
           WHERE a.user_id = p_client_id
             AND a.first_design_order_id IS NOT NULL
             AND a.first_design_order_id <> p_order_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.orders o
           WHERE o.client_id = p_client_id AND o.id <> p_order_id AND o.paid_at IS NOT NULL)
$$;

REVOKE ALL ON FUNCTION app.first_design_available(text, text) FROM PUBLIC;

-- Category before quote: admin, or the pod lead of the order's pod.
CREATE OR REPLACE FUNCTION public.set_order_category(p_order_id text, p_letter text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_tier  public.job_tier;
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (app.is_admin() OR app.is_pod_lead_of(v_order.pod_id)) THEN
    RAISE EXCEPTION 'only an admin or this order''s pod lead may set its category';
  END IF;
  IF v_order.status NOT IN ('SUBMITTED', 'QUOTED') THEN
    RAISE EXCEPTION 'the category is fixed once the order is paid (order is %)', v_order.status;
  END IF;
  SELECT tier INTO v_tier FROM public.job_categories WHERE letter = p_letter;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown category: %', p_letter; END IF;

  UPDATE public.orders SET category = p_letter, tier = v_tier WHERE id = p_order_id;
  PERFORM audit.log_event('ORDER_CATEGORY_SET', 'order', p_order_id, app.current_clerk_id(),
                          app.current_user_role(), jsonb_build_object('category', p_letter, 'tier', v_tier));
  RETURN jsonb_build_object('order_id', p_order_id, 'category', p_letter, 'tier', v_tier);
END
$$;

-- The quote (A3). SALES (admin). Price defaults to the band; an override is
-- allowed. Pay is locked here and never recalculated (DECISIONS §5).
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

  v_designer := v_cat.designer_rate_paise;
  v_qc       := app.qc_pay_paise(v_price);

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

-- -------------------------------------------------------------- clock --

-- Start the clock if, and only if, the order is now both paid and confirmed.
-- Idempotent: a running, met or breached clock is never restarted.
CREATE OR REPLACE FUNCTION app.maybe_start_sla(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_start timestamptz;
  v_due   timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.sla_status <> 'pending'
     OR v_order.paid_at IS NULL OR v_order.confirmed_at IS NULL THEN
    RETURN false;
  END IF;

  v_start := greatest(v_order.paid_at, v_order.confirmed_at);
  v_due := v_start + CASE
    WHEN v_order.tier = 'complex' AND v_order.complex_deadline_hours IS NOT NULL
      THEN make_interval(hours => v_order.complex_deadline_hours)
    ELSE make_interval(hours => coalesce(app.setting('sla_standard_hours'), 6))
  END;

  UPDATE public.orders
    SET sla_started_at = v_start, sla_due_at = v_due, sla_status = 'running'
    WHERE id = p_order_id;
  INSERT INTO public.sla_events (order_id, kind, at, detail)
  VALUES (p_order_id, 'started', v_start, jsonb_build_object('due_at', v_due));
  PERFORM audit.log_event('SLA_STARTED', 'order', p_order_id, NULL, NULL,
                          jsonb_build_object('started_at', v_start, 'due_at', v_due));

  PERFORM app.notify(v_order.client_id, NULL, 'SLA', p_order_id,
                     'Your order is confirmed and paid — the first-look clock has started.');
  PERFORM app.notify(v_order.pod_lead_id, NULL, 'SLA', p_order_id,
                     'An order in your pod is confirmed and paid — the clock is running.');
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION app.maybe_start_sla(text) FROM PUBLIC;

-- Paid = a HOLD landed on the ledger, from any route (card webhook, admin
-- marking a manual payment, the legacy hold_escrow).
CREATE OR REPLACE FUNCTION app.on_hold_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.orders
    SET paid_at = coalesce(paid_at, NEW.created_at),
        payment_method = coalesce(payment_method, 'razorpay')
    WHERE id = NEW.order_id;
  PERFORM app.maybe_start_sla(NEW.order_id);
  RETURN NEW;
END
$$;

CREATE TRIGGER escrow_ledger_hold_paid
  AFTER INSERT ON escrow_ledger
  FOR EACH ROW WHEN (NEW.kind = 'HOLD')
  EXECUTE FUNCTION app.on_hold_recorded();

-- Orders paid before this migration: their HOLD is already on the ledger, so
-- record when. No clock starts here — none of them has been confirmed yet.
UPDATE orders o
  SET paid_at = h.first_hold,
      payment_method = coalesce(o.payment_method, 'razorpay')
  FROM (SELECT order_id, min(created_at) AS first_hold
        FROM escrow_ledger WHERE kind = 'HOLD' GROUP BY order_id) h
  WHERE h.order_id = o.id AND o.paid_at IS NULL;

-- Admin or the pod lead confirms the brief is complete (v1.1).
CREATE OR REPLACE FUNCTION public.confirm_order(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_started  boolean;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (app.is_admin() OR app.is_pod_lead_of(v_order.pod_id)) THEN
    RAISE EXCEPTION 'only an admin or this order''s pod lead may confirm it';
  END IF;
  IF v_order.status NOT IN ('SUBMITTED', 'QUOTED', 'PAYMENT_HELD', 'ASSIGNED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'cannot confirm an order that is %', v_order.status;
  END IF;
  IF v_order.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'confirmed', true, 'changed', false);
  END IF;

  UPDATE public.orders SET confirmed_at = now(), confirmed_by = v_clerk_id WHERE id = p_order_id;
  PERFORM audit.log_event('ORDER_CONFIRMED', 'order', p_order_id, v_clerk_id,
                          app.current_user_role(), '{}'::jsonb);
  v_started := app.maybe_start_sla(p_order_id);
  RETURN jsonb_build_object('order_id', p_order_id, 'confirmed', true, 'changed', true,
                            'clock_started', v_started);
END
$$;

-- Admin records a payment that did not come through the card checkout:
-- Wise or bank transfer, PayPal, a manual invoice (DECISIONS §13).
CREATE OR REPLACE FUNCTION public.mark_payment_received(
  p_order_id  text,
  p_method    text,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_role     public.role;
  v_order    public.orders%ROWTYPE;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_role := app.acting_role('FINANCE');
  IF v_role IS DISTINCT FROM 'FINANCE' THEN
    RAISE EXCEPTION 'only FINANCE may mark a payment received';
  END IF;
  IF p_method NOT IN ('manual', 'wise', 'paypal', 'bank') THEN
    RAISE EXCEPTION 'method must be manual, wise, paypal or bank';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'QUOTED' THEN
    RAISE EXCEPTION 'order is not awaiting payment (is %)', v_order.status;
  END IF;
  IF v_order.price_total <= 0 THEN
    RAISE EXCEPTION 'order has no price to pay';
  END IF;

  UPDATE public.orders
    SET payment_method = p_method::public.payment_method,
        payment_reference = nullif(btrim(p_reference), '')
    WHERE id = p_order_id;

  INSERT INTO public.escrow_ledger (order_id, kind, party, amount, currency, created_by, payee_id, external_ref)
  VALUES (p_order_id, 'HOLD', 'CLIENT', v_order.price_total, v_order.currency, v_clerk_id,
          v_order.client_id, nullif(btrim(p_reference), ''));

  UPDATE public.orders SET status = 'PAYMENT_HELD' WHERE id = p_order_id;

  PERFORM audit.log_event(
    'ESCROW_HELD', 'order', p_order_id, v_clerk_id, v_role,
    jsonb_build_object('from', 'QUOTED', 'to', 'PAYMENT_HELD', 'amount', v_order.price_total,
                       'method', p_method, 'reference', nullif(btrim(p_reference), ''))
  );
  RETURN jsonb_build_object('order_id', p_order_id, 'status', 'PAYMENT_HELD', 'method', p_method);
END
$$;

-- First look = CLIENT_PREVIEW. Met if on time; the sweep handles late.
CREATE OR REPLACE FUNCTION app.on_first_look()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'CLIENT_PREVIEW' AND OLD.status IS DISTINCT FROM 'CLIENT_PREVIEW'
     AND NEW.first_look_at IS NULL THEN
    NEW.first_look_at := now();
    IF NEW.sla_status = 'running' AND NEW.first_look_at <= NEW.sla_due_at THEN
      NEW.sla_status := 'met';
      INSERT INTO public.sla_events (order_id, kind) VALUES (NEW.id, 'met');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_first_look
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION app.on_first_look();

-- -------------------------------------------------------------- sweep --

-- Every minute (pg_cron, below). Flags each overdue order exactly once and,
-- for the standard tier, creates one pending credit for the amount paid.
CREATE OR REPLACE FUNCTION public.sla_sweep(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_paid   integer;
  v_auto   boolean := app.flag('auto_sla_credit');
  v_count  integer := 0;
BEGIN
  FOR v_order IN
    SELECT * FROM public.orders
    WHERE sla_status = 'running' AND first_look_at IS NULL AND sla_due_at < p_now
    ORDER BY sla_due_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders SET sla_status = 'breached' WHERE id = v_order.id;
    INSERT INTO public.sla_events (order_id, kind, at, detail)
    VALUES (v_order.id, 'breached', p_now, jsonb_build_object('due_at', v_order.sla_due_at));
    PERFORM audit.log_event('SLA_BREACHED', 'order', v_order.id, NULL, NULL,
                            jsonb_build_object('due_at', v_order.sla_due_at, 'tier', v_order.tier));
    PERFORM app.notify(v_order.pod_lead_id, NULL, 'SLA', v_order.id,
                       'The first-look deadline on an order in your pod has passed.');

    IF coalesce(v_order.tier, 'standard') = 'standard' THEN
      SELECT coalesce(sum(amount) FILTER (WHERE kind = 'HOLD'), 0)::integer INTO v_paid
      FROM public.escrow_ledger WHERE order_id = v_order.id;
      IF v_paid > 0 THEN
        INSERT INTO public.client_credits
          (client_id, order_id, kind, amount_cents, currency, status, decided_at, decided_amount_cents, decision_reason)
        VALUES
          (v_order.client_id, v_order.id, 'sla_credit', v_paid, v_order.currency,
           CASE WHEN v_auto THEN 'apply_next' ELSE 'pending' END,
           CASE WHEN v_auto THEN p_now END,
           CASE WHEN v_auto THEN v_paid END,
           CASE WHEN v_auto THEN 'automatic SLA credit' END)
        ON CONFLICT (order_id, kind) DO NOTHING;
        INSERT INTO public.sla_events (order_id, kind, at) VALUES (v_order.id, 'credit_pending', p_now);
      END IF;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.sla_sweep(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_sweep(timestamptz) TO service_role;

-- Admin decides a pending credit (owner answer Q4). Once only.
CREATE OR REPLACE FUNCTION public.decide_sla_credit(
  p_credit_id    text,
  p_decision     text,
  p_amount_cents integer DEFAULT NULL,
  p_reason       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_credit public.client_credits%ROWTYPE;
  v_amount integer;
BEGIN
  PERFORM app.require_admin();
  IF p_decision NOT IN ('apply_next', 'refunded', 'partial', 'rejected') THEN
    RAISE EXCEPTION 'decision must be apply_next, refunded, partial or rejected';
  END IF;

  SELECT * INTO v_credit FROM public.client_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit not found'; END IF;
  IF v_credit.status <> 'pending' THEN
    RAISE EXCEPTION 'this credit was already decided (%)', v_credit.status;
  END IF;

  IF p_decision IN ('partial', 'rejected') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'a % decision needs a reason', p_decision;
  END IF;
  v_amount := CASE p_decision
    WHEN 'rejected' THEN 0
    WHEN 'partial'  THEN p_amount_cents
    ELSE v_credit.amount_cents
  END;
  IF p_decision = 'partial' AND (v_amount IS NULL OR v_amount <= 0 OR v_amount >= v_credit.amount_cents) THEN
    RAISE EXCEPTION 'a partial credit must be more than 0 and less than %', v_credit.amount_cents;
  END IF;

  UPDATE public.client_credits
    SET status = p_decision, decided_amount_cents = v_amount,
        decision_reason = nullif(btrim(p_reason), ''),
        decided_by = app.current_clerk_id(), decided_at = now()
    WHERE id = p_credit_id;

  IF p_decision <> 'rejected' THEN
    UPDATE public.orders SET sla_status = 'breached_credited'
    WHERE id = v_credit.order_id;
  END IF;
  INSERT INTO public.sla_events (order_id, kind, detail)
  VALUES (v_credit.order_id, 'credit_decided', jsonb_build_object('decision', p_decision, 'amount_cents', v_amount));
  PERFORM audit.log_event('SLA_CREDIT_DECIDED', 'order', v_credit.order_id, app.current_clerk_id(),
                          app.acting_role('FINANCE'),
                          jsonb_build_object('credit_id', p_credit_id, 'decision', p_decision,
                                             'amount_cents', v_amount, 'reason', nullif(btrim(p_reason), '')));
  IF p_decision <> 'rejected' THEN
    PERFORM app.notify(v_credit.client_id, NULL, 'CREDIT', v_credit.order_id,
                       'We missed the first-look deadline on your order — a credit has been issued.');
  END IF;

  RETURN jsonb_build_object('credit_id', p_credit_id, 'decision', p_decision, 'amount_cents', v_amount);
END
$$;

REVOKE ALL ON FUNCTION public.set_order_category(text, text)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quote_order_v2(text, text, integer, integer)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order(text)                              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_payment_received(text, text, text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_sla_credit(text, text, integer, text)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_category(text, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quote_order_v2(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_order(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_received(text, text, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_sla_credit(text, text, integer, text) TO authenticated, service_role;

-- Pending credits for the admin queue, with the order reference (clients and
-- designers never call this; require_admin refuses them).
CREATE OR REPLACE FUNCTION public.pending_sla_credits()
RETURNS TABLE (
  credit_id    text,
  order_id     text,
  order_ref    text,
  client_code  text,
  amount_cents integer,
  currency     text,
  due_at       timestamptz,
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT c.id, c.order_id, o.order_ref, a.client_code, c.amount_cents, c.currency, o.sla_due_at, c.created_at
  FROM public.client_credits c
  JOIN public.orders o ON o.id = c.order_id
  LEFT JOIN public.client_accounts a ON a.user_id = c.client_id
  WHERE c.status = 'pending'
  ORDER BY c.created_at;
END
$$;

REVOKE ALL ON FUNCTION public.pending_sla_credits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_sla_credits() TO authenticated, service_role;

-- ------------------------------------------------------ visible_orders --

-- Same as 0036, plus the confirmation and payment facts the order screen
-- shows. Return type changes, so the function is dropped and recreated.
DROP FUNCTION public.visible_orders(text);

CREATE FUNCTION public.visible_orders(p_order_id text DEFAULT NULL)
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
  WITH v AS (
    SELECT o.*, app.order_relation(o.id) AS rel, s.product::text AS spec_product
    FROM public.orders o
    LEFT JOIN public.order_specs s ON s.order_id = o.id
    WHERE (p_order_id IS NULL OR o.id = p_order_id)
      AND o.deleted_at IS NULL
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
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.currency END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.price_total END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.designer_payout END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.qc_payout END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.platform_commission END,
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

REVOKE ALL ON FUNCTION public.visible_orders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visible_orders(text) TO authenticated, service_role;

-- ------------------------------------------------------------ schedule --

-- Every minute via pg_cron (owner answer Q8), when the extension is enabled.
-- Local and CI Postgres have no pg_cron: the tests call sla_sweep() directly.
-- If pg_cron is enabled after this migration ran, run the same cron.schedule
-- statement once in the SQL editor (docs/PHASE-2-ROLLOUT.md).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('sla-sweep', '* * * * *', 'SELECT public.sla_sweep()');
  END IF;
END
$$;
