-- =============================================================================
-- 0072: billing — invoices, other ways to pay, and the client's "I've paid"
-- (owner, 18 Nov 2026; DECISIONS 1.35).
--
--   1. Billing settings (one row, admins): the seller's details for invoices
--      (legal name, CIN, address, GSTIN once issued), the export wording
--      (LUT reference and year), the SAC code, the invoice prefix, and the
--      details clients see for paying by bank transfer, Wise or PayPal.
--   2. Invoices: one per paid order, numbered in sequence within the Indian
--      financial year (TCP/2026-27/0001), with a snapshot of who billed whom
--      for what, so a later change to a profile or a setting never alters an
--      issued invoice. Issued when the payment lands (the webhook, or an
--      admin marking it paid), or the first time anyone opens it.
--   3. Offline payment reports: a client who paid by transfer says so, with a
--      reference; the admins are told, and see it on the order beside
--      "Mark paid". Nothing is marked paid by the client.
--
-- New tables and functions only: checkout, the webhook's confirm_payment,
-- mark_payment_received and the escrow ledger are unchanged.
-- =============================================================================

CREATE TABLE public.billing_settings (
  id             boolean     PRIMARY KEY DEFAULT true CHECK (id),
  legal_name     text        NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 120),
  cin            text        CHECK (cin IS NULL OR char_length(cin) <= 30),
  address        text        NOT NULL CHECK (char_length(btrim(address)) BETWEEN 5 AND 300),
  gstin          text        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  lut_arn        text        CHECK (lut_arn IS NULL OR char_length(lut_arn) BETWEEN 5 AND 40),
  lut_fy         text        CHECK (lut_fy IS NULL OR lut_fy ~ '^[0-9]{4}-[0-9]{2}$'),
  sac_code       text        CHECK (sac_code IS NULL OR sac_code ~ '^[0-9]{4,8}$'),
  invoice_prefix text        NOT NULL DEFAULT 'TCP' CHECK (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  bank_transfer  text        CHECK (bank_transfer IS NULL OR char_length(bank_transfer) <= 1000),
  wise_details   text        CHECK (wise_details IS NULL OR char_length(wise_details) <= 1000),
  paypal_link    text        CHECK (paypal_link IS NULL OR (char_length(paypal_link) <= 300 AND paypal_link ~ '^https://')),
  invoice_note   text        CHECK (invoice_note IS NULL OR char_length(invoice_note) <= 500),
  updated_by     text        REFERENCES public.users (id) ON DELETE RESTRICT,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The company as the website states it (content/claims.ts COMPANY).
INSERT INTO public.billing_settings (legal_name, cin, address, sac_code)
VALUES ('Ichizu Private Limited', 'U74101DL2026PTC471762',
        'B10, Ground Floor, Vivek Vihar, Phase 2, New Delhi 110095, India', '998391');

CREATE TABLE public.invoices (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number         text        NOT NULL UNIQUE,
  fy             text        NOT NULL CHECK (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  seq            integer     NOT NULL CHECK (seq > 0),
  order_id       text        NOT NULL UNIQUE REFERENCES public.orders (id) ON DELETE RESTRICT,
  client_id      text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz NOT NULL,
  amount         integer     NOT NULL CHECK (amount > 0),
  currency       text        NOT NULL CHECK (char_length(currency) = 3),
  payment_method text,
  payment_ref    text,
  description    text        NOT NULL,
  bill_to        jsonb       NOT NULL,
  seller         jsonb       NOT NULL,
  tax            jsonb       NOT NULL,
  issued_by      text        REFERENCES public.users (id) ON DELETE RESTRICT,
  UNIQUE (fy, seq)
);

CREATE INDEX invoices_client_idx ON public.invoices (client_id, issued_at DESC);

CREATE TABLE public.offline_payment_reports (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id    text        NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  client_id   text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  method      text        NOT NULL CHECK (method IN ('BANK_TRANSFER', 'WISE', 'PAYPAL', 'OTHER')),
  reference   text        CHECK (reference IS NULL OR char_length(reference) <= 120),
  note        text        CHECK (note IS NULL OR char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offline_payment_reports_order_idx ON public.offline_payment_reports (order_id, created_at DESC);

-- Locked at once (policies/0053 states the same, for db:apply).
ALTER TABLE public.billing_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.offline_payment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_payment_reports FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings, public.invoices, public.offline_payment_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_settings, public.invoices, public.offline_payment_reports TO service_role;

-- ------------------------------------------------------------- helpers --

-- The Indian financial year a moment falls in (April to March, India time):
-- 2026-04-01 → '2026-27', 2027-03-31 → '2026-27'.
CREATE OR REPLACE FUNCTION app.financial_year(p_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN extract(month FROM p_at AT TIME ZONE 'Asia/Kolkata') >= 4
              THEN to_char(p_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
                   lpad(((extract(year FROM p_at AT TIME ZONE 'Asia/Kolkata')::int + 1) % 100)::text, 2, '0')
              ELSE (extract(year FROM p_at AT TIME ZONE 'Asia/Kolkata')::int - 1)::text || '-' ||
                   lpad((extract(year FROM p_at AT TIME ZONE 'Asia/Kolkata')::int % 100)::text, 2, '0')
         END
$$;

-- Who may see an order's invoice: its client, or finance (admins hold it).
CREATE OR REPLACE FUNCTION app.may_see_invoice(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.has_role('FINANCE')
      OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.client_id = app.current_clerk_id())
$$;

-- ------------------------------------------------------------ settings --

CREATE OR REPLACE FUNCTION public.billing_settings_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.has_role('FINANCE') THEN RAISE EXCEPTION 'only finance may see billing settings'; END IF;
  RETURN (SELECT to_jsonb(b) - 'id' FROM public.billing_settings b);
END
$$;

CREATE OR REPLACE FUNCTION public.billing_settings_save(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  PERFORM app.require_admin();
  UPDATE public.billing_settings SET
    legal_name     = coalesce(nullif(btrim(p ->> 'legal_name'), ''), legal_name),
    cin            = CASE WHEN p ? 'cin' THEN nullif(btrim(coalesce(p ->> 'cin', '')), '') ELSE cin END,
    address        = coalesce(nullif(btrim(p ->> 'address'), ''), address),
    gstin          = CASE WHEN p ? 'gstin' THEN nullif(upper(btrim(coalesce(p ->> 'gstin', ''))), '') ELSE gstin END,
    lut_arn        = CASE WHEN p ? 'lut_arn' THEN nullif(btrim(coalesce(p ->> 'lut_arn', '')), '') ELSE lut_arn END,
    lut_fy         = CASE WHEN p ? 'lut_fy' THEN nullif(btrim(coalesce(p ->> 'lut_fy', '')), '') ELSE lut_fy END,
    sac_code       = CASE WHEN p ? 'sac_code' THEN nullif(btrim(coalesce(p ->> 'sac_code', '')), '') ELSE sac_code END,
    invoice_prefix = coalesce(nullif(upper(btrim(p ->> 'invoice_prefix')), ''), invoice_prefix),
    bank_transfer  = CASE WHEN p ? 'bank_transfer' THEN nullif(btrim(coalesce(p ->> 'bank_transfer', '')), '') ELSE bank_transfer END,
    wise_details   = CASE WHEN p ? 'wise_details' THEN nullif(btrim(coalesce(p ->> 'wise_details', '')), '') ELSE wise_details END,
    paypal_link    = CASE WHEN p ? 'paypal_link' THEN nullif(btrim(coalesce(p ->> 'paypal_link', '')), '') ELSE paypal_link END,
    invoice_note   = CASE WHEN p ? 'invoice_note' THEN nullif(btrim(coalesce(p ->> 'invoice_note', '')), '') ELSE invoice_note END,
    updated_by     = app.current_clerk_id(),
    updated_at     = now();
  PERFORM audit.log_event('BILLING_SETTINGS_SAVED', 'billing_settings', NULL, app.current_clerk_id(),
                          app.acting_role('FINANCE'), '{}'::jsonb);
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_text = CONSTRAINT_NAME;
  RAISE EXCEPTION '%', CASE
    WHEN v_text LIKE '%gstin%' THEN 'the GSTIN is not in the right format (15 characters, e.g. 07ABCDE1234F1Z5)'
    WHEN v_text LIKE '%lut_fy%' THEN 'write the LUT year as 2026-27'
    WHEN v_text LIKE '%paypal%' THEN 'the PayPal link must start with https://'
    WHEN v_text LIKE '%sac%' THEN 'the SAC code is 4 to 8 digits'
    WHEN v_text LIKE '%prefix%' THEN 'the invoice prefix is up to 8 capital letters or digits'
    ELSE 'one of the values is not valid' END;
END
$$;

-- What a client sees for paying outside the card checkout. Signed-in only.
CREATE OR REPLACE FUNCTION public.payment_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN (SELECT jsonb_build_object('bank_transfer', b.bank_transfer, 'wise_details', b.wise_details,
                                    'paypal_link', b.paypal_link)
          FROM public.billing_settings b);
END
$$;

-- --------------------------------------------------- offline payments --

-- The client says they paid outside the checkout. The admins are told, and
-- an admin marks the order paid when the money arrives.
CREATE OR REPLACE FUNCTION public.report_offline_payment(p_order_id text, p_method text, p_reference text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    text := app.current_clerk_id();
  v_order public.orders%ROWTYPE;
  v_admin text;
  v_words text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.client_id IS DISTINCT FROM v_me THEN RAISE EXCEPTION 'no such order'; END IF;
  IF v_order.status <> 'QUOTED' THEN RAISE EXCEPTION 'this order is not waiting for payment'; END IF;
  IF (SELECT count(*) FROM public.offline_payment_reports r WHERE r.order_id = p_order_id) >= 5 THEN
    RAISE EXCEPTION 'already reported: the team will confirm as soon as the money arrives';
  END IF;

  INSERT INTO public.offline_payment_reports (order_id, client_id, method, reference, note)
  VALUES (p_order_id, v_me, p_method, left(nullif(btrim(coalesce(p_reference, '')), ''), 120),
          left(nullif(btrim(coalesce(p_note, '')), ''), 500));

  v_words := CASE p_method WHEN 'BANK_TRANSFER' THEN 'bank transfer' WHEN 'WISE' THEN 'Wise'
                           WHEN 'PAYPAL' THEN 'PayPal' ELSE 'another way' END;
  FOR v_admin IN
    SELECT u.id FROM public.users u
    WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
      AND (u.role = 'FINANCE' OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'FINANCE'))
  LOOP
    PERFORM app.notify(v_admin, v_me, 'PAYMENT_REPORTED', p_order_id,
                       'Client says they paid by ' || v_words ||
                       coalesce(' (ref ' || left(nullif(btrim(coalesce(p_reference, '')), ''), 40) || ')', '') ||
                       '. Check and mark paid.');
  END LOOP;
  PERFORM audit.log_event('OFFLINE_PAYMENT_REPORTED', 'order', p_order_id, v_me, 'CLIENT',
                          jsonb_build_object('method', p_method));
END
$$;

-- What clients reported on an order, for finance beside "Mark paid".
CREATE OR REPLACE FUNCTION public.offline_payment_reports_for(p_order_id text)
RETURNS TABLE (id text, method text, reference text, note text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.has_role('FINANCE') THEN RAISE EXCEPTION 'only finance may see payment reports'; END IF;
  RETURN QUERY
  SELECT r.id, r.method, r.reference, r.note, r.created_at
  FROM public.offline_payment_reports r WHERE r.order_id = p_order_id ORDER BY r.created_at DESC;
END
$$;

-- ------------------------------------------------------------ invoices --

-- The invoice for a paid order: issued on first call, the same one after.
-- Numbered in sequence within the financial year the payment fell in.
CREATE OR REPLACE FUNCTION app.issue_invoice_core(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_inv    text;
  v_set    public.billing_settings%ROWTYPE;
  v_fy     text;
  v_seq    integer;
  v_prof   record;
  v_ver    record;
  v_country text;
  v_export boolean;
  v_title  text;
BEGIN
  SELECT id INTO v_inv FROM public.invoices WHERE order_id = p_order_id;
  IF FOUND THEN RETURN v_inv; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such order'; END IF;
  IF v_order.paid_at IS NULL THEN RAISE EXCEPTION 'this order is not paid yet'; END IF;
  IF v_order.price_total IS NULL OR v_order.price_total <= 0 THEN RAISE EXCEPTION 'this order has no amount'; END IF;

  SELECT * INTO v_set FROM public.billing_settings;
  v_fy := app.financial_year(v_order.paid_at);

  -- One number at a time within a year; a second caller waits, then finds
  -- the invoice this one made.
  PERFORM pg_advisory_xact_lock(hashtext('invoice:' || v_fy));
  SELECT id INTO v_inv FROM public.invoices WHERE order_id = p_order_id;
  IF FOUND THEN RETURN v_inv; END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM public.invoices WHERE fy = v_fy;

  SELECT p.business_name, p.legal_name, p.email, p.phone, p.billing_address INTO v_prof
  FROM public.client_profiles p WHERE p.user_id = v_order.client_id AND p.deleted_at IS NULL;
  SELECT v.address, v.country, v.website INTO v_ver FROM public.client_verifications v WHERE v.user_id = v_order.client_id;
  v_country := coalesce(v_ver.country, '');
  v_export := v_order.currency <> 'INR' AND v_country !~* '^\s*(india|in|ind)\s*$';

  SELECT coalesce(nullif(s.reference_name, ''), initcap(replace(v_order.product_type::text, '_', ' ')))
    INTO v_title FROM public.order_specs s WHERE s.order_id = p_order_id;
  v_title := coalesce(v_title, initcap(replace(v_order.product_type::text, '_', ' ')));

  INSERT INTO public.invoices
    (number, fy, seq, order_id, client_id, paid_at, amount, currency, payment_method, payment_ref,
     description, bill_to, seller, tax, issued_by)
  VALUES (
    v_set.invoice_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0'),
    v_fy, v_seq, p_order_id, v_order.client_id, v_order.paid_at, v_order.price_total, v_order.currency,
    v_order.payment_method::text, v_order.payment_reference,
    'Jewelry CAD design service: ' || v_title || coalesce(' (order ' || v_order.order_ref || ')', ''),
    jsonb_build_object(
      'business', coalesce(nullif(btrim(v_prof.business_name), ''), v_prof.legal_name),
      'contact', v_prof.legal_name,
      'email', v_prof.email,
      'address', coalesce(nullif(btrim(v_prof.billing_address), ''), v_ver.address),
      'country', nullif(v_country, '')),
    jsonb_build_object(
      'legal_name', v_set.legal_name, 'cin', v_set.cin, 'address', v_set.address, 'gstin', v_set.gstin),
    jsonb_build_object(
      'sac', v_set.sac_code,
      'export', v_export,
      'lut_arn', CASE WHEN v_export THEN v_set.lut_arn END,
      'lut_fy', CASE WHEN v_export THEN v_set.lut_fy END,
      'title', CASE WHEN v_set.gstin IS NOT NULL THEN 'Tax invoice' ELSE 'Invoice' END,
      'note', v_set.invoice_note),
    app.current_clerk_id()
  )
  RETURNING id INTO v_inv;

  PERFORM audit.log_event('INVOICE_ISSUED', 'order', p_order_id, app.current_clerk_id(), NULL,
                          jsonb_build_object('invoice_id', v_inv, 'fy', v_fy, 'seq', v_seq));
  RETURN v_inv;
END
$$;

-- Its client or finance asks for the invoice (issued if it is not yet).
CREATE OR REPLACE FUNCTION public.issue_invoice(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.may_see_invoice(p_order_id) THEN RAISE EXCEPTION 'no such order'; END IF;
  RETURN app.issue_invoice_core(p_order_id);
END
$$;

-- The payment webhook issues it the moment the payment lands. Service role
-- only: no signed-in caller reaches this one.
CREATE OR REPLACE FUNCTION public.issue_invoice_for_payment(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN app.issue_invoice_core(p_order_id);
END
$$;

-- Everything the invoice PDF prints, for its client or finance.
CREATE OR REPLACE FUNCTION public.invoice_data(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT app.may_see_invoice(p_order_id) THEN RAISE EXCEPTION 'no such order'; END IF;
  SELECT to_jsonb(i) - 'client_id' - 'issued_by' INTO v FROM public.invoices i WHERE i.order_id = p_order_id;
  IF v IS NULL THEN RAISE EXCEPTION 'no invoice yet'; END IF;
  RETURN v;
END
$$;

-- The caller's own invoices (clients), newest first.
CREATE OR REPLACE FUNCTION public.my_invoices()
RETURNS TABLE (order_id text, number text, issued_at timestamptz, amount integer, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT i.order_id, i.number, i.issued_at, i.amount, i.currency
  FROM public.invoices i WHERE i.client_id = app.current_clerk_id()
  ORDER BY i.issued_at DESC
$$;

-- Every invoice (finance), newest first.
CREATE OR REPLACE FUNCTION public.admin_invoices(p_limit integer DEFAULT 100)
RETURNS TABLE (order_id text, number text, issued_at timestamptz, amount integer, currency text, business text, export boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.has_role('FINANCE') THEN RAISE EXCEPTION 'only finance may see invoices'; END IF;
  RETURN QUERY
  SELECT i.order_id, i.number, i.issued_at, i.amount, i.currency, i.bill_to ->> 'business', (i.tax ->> 'export')::boolean
  FROM public.invoices i ORDER BY i.fy DESC, i.seq DESC LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000);
END
$$;

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION app.financial_year(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.may_see_invoice(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.issue_invoice_core(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invoice_for_payment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_for_payment(text) TO service_role;

REVOKE ALL ON FUNCTION public.billing_settings_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_settings_save(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_offline_payment(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.offline_payment_reports_for(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_invoice(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_data(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_invoices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_invoices(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.billing_settings_get() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_settings_save(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_options() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_offline_payment(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.offline_payment_reports_for(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_data(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_invoices() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_invoices(integer) TO authenticated, service_role;
