-- 0035_order_model.sql
-- The order model DECISIONS v1.0 runs on: categories, price bands, the SLA
-- clock's columns, on-behalf intake, INR payouts locked at quote, the order
-- reference, feature flags and admin settings.
--
-- SCHEMA ONLY for the clock and money: quote_order_v2, the SLA sweep and the
-- payout obligations are Phase 2/3 and write these columns. Nothing here
-- changes what an existing function does, except the brief (upsert_order_spec),
-- which loses four required fields (owner answer Q6) and gains size fields.

-- -------------------------------------------------------------- enums --

CREATE TYPE job_tier       AS ENUM ('standard', 'complex');
CREATE TYPE sla_status     AS ENUM ('pending', 'running', 'met', 'breached', 'breached_credited');
CREATE TYPE order_source   AS ENUM ('portal', 'whatsapp', 'email', 'phone');
CREATE TYPE intake_mode    AS ENUM ('full', 'quick');
CREATE TYPE service_kind   AS ENUM ('cad', 'render', 'cad_render');
CREATE TYPE payment_method AS ENUM ('razorpay', 'manual');

-- --------------------------------------------------------- categories --

-- DECISIONS §3. Rates are admin-editable; a change reaches only orders quoted
-- after it, because the payout is copied onto the order at quote time.
CREATE TABLE job_categories (
  letter              char(1)     PRIMARY KEY CHECK (letter BETWEEN 'A' AND 'L'),
  minutes             integer     NOT NULL CHECK (minutes > 0),
  tier                job_tier    NOT NULL,
  designer_rate_paise integer     NOT NULL CHECK (designer_rate_paise >= 0),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- designer pay = minutes × ₹500 / 60, in paise.
INSERT INTO job_categories (letter, minutes, tier, designer_rate_paise)
SELECT c.letter, c.minutes, c.tier::job_tier, c.minutes * 50000 / 60
FROM (VALUES
  ('A',  15, 'standard'), ('B',  30, 'standard'), ('C',  45, 'standard'),
  ('D',  60, 'standard'), ('E',  90, 'standard'), ('F', 120, 'standard'),
  ('G', 180, 'complex'),  ('H', 240, 'complex'),  ('I', 300, 'complex'),
  ('J', 360, 'complex'),  ('K', 420, 'complex'),  ('L', 480, 'complex')
) AS c(letter, minutes, tier);

-- DECISIONS §4. Named BAND_* on purpose: the "Complex" PRICE band is D–F,
-- which is the STANDARD SLA tier. Calling both "complex" invites the bug.
CREATE TABLE price_bands (
  code           text        PRIMARY KEY,
  label          text        NOT NULL,
  first_category char(1)     NOT NULL REFERENCES job_categories (letter),
  last_category  char(1)     NOT NULL REFERENCES job_categories (letter),
  price_cents    integer     NOT NULL CHECK (price_cents > 0),
  -- true = "from $X, quoted": the price is a floor, admin sets the real one.
  is_from        boolean     NOT NULL DEFAULT false,
  -- the $49 first design: once per account (owner rule, DECISIONS §4)
  first_order_only boolean   NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (first_category <= last_category)
);

INSERT INTO price_bands (code, label, first_category, last_category, price_cents, is_from, first_order_only) VALUES
  ('BAND_STANDARD', 'Standard',              'A', 'C',  5500, false, false),
  ('BAND_COMPLEX',  'Complex',               'D', 'F',  8500, false, false),
  ('BAND_SCULPTED', 'Sculpted / figurative', 'G', 'L', 12000, true,  false),
  ('BAND_FIRST',    'First design',          'A', 'C',  4900, false, true);

-- -------------------------------------------------- flags + settings --

-- DECISIONS §12, enforced in the database: a flag the UI hides but a function
-- still honours is not off.
CREATE TABLE feature_flags (
  key         text        PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  enabled     boolean     NOT NULL,
  description text        NOT NULL,
  updated_by  text        REFERENCES users (id) ON DELETE RESTRICT,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('wallet_checkout',       false, 'Wallet top-ups, credit packs, plans checkout (November)'),
  ('auto_sla_credit',       false, 'Automatic SLA credit from the sweep (November); October is manual'),
  ('rush',                  false, 'Rush delivery (when defined)'),
  ('in_app_payouts',        false, 'Payouts through Razorpay (November); October is export + bank transfer'),
  ('capacity_blocking',     false, 'Block assignment over 480 min/shift (November); October warns only'),
  ('render_brief_one_page', true,  'One-page render brief (N7), quoted by admin'),
  ('public_stats',          false, 'Public performance stats (after 30 days of real data)'),
  ('dental',                false, 'Dental (January 2027, separate brand)');

-- Admin-editable numbers. Integers only: money in paise/cents, lengths in µm,
-- densities in mg/cm³, rates as paise per USD.
CREATE TABLE app_settings (
  key         text        PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  value       integer,
  description text        NOT NULL,
  updated_by  text        REFERENCES users (id) ON DELETE RESTRICT,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('sla_standard_hours',        6,     'First look promise for categories A–F, hours from payment'),
  ('qc_buffer_minutes',         60,    'Designer due = SLA due − this'),
  ('shift_minutes',             480,   'Designer capacity per shift, category minutes'),
  ('payout_warning_pct',        40,    'Warn on quote when designer + QC pay exceeds this % of price'),
  ('usd_inr_paise_per_usd',     8400,  'Fixed USD→INR rate for margin and the payout warning (₹84.00 = $1)'),
  ('revision_rounds',           2,     'Client revision rounds included'),
  ('revision_window_days',      14,    'Days after first look the included rounds stay open'),
  ('claim_window_days',         30,    'Days after delivery a spec claim can be opened'),
  ('min_wall_um',               800,   'Default minimum wall on the spec sheet (µm)'),
  ('min_prong_um',              800,   'Default minimum prong on the spec sheet (µm)'),
  ('density_10k_mg_cm3',        11600, '10K gold density'),
  ('density_14k_mg_cm3',        13100, '14K gold density'),
  ('density_18k_mg_cm3',        15600, '18K gold density'),
  ('density_pt950_mg_cm3',      21400, 'Pt950 density'),
  ('density_ag925_mg_cm3',      10400, 'Ag925 density'),
  ('metal_price_cents_per_gram', NULL, 'Optional metal estimate price per gram (USD cents)');

CREATE OR REPLACE FUNCTION app.flag(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT enabled FROM public.feature_flags WHERE key = p_key), false)
$$;

CREATE OR REPLACE FUNCTION app.setting(p_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT value FROM public.app_settings WHERE key = p_key
$$;

GRANT EXECUTE ON FUNCTION app.flag(text)    TO authenticated, service_role;
REVOKE ALL    ON FUNCTION app.setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.setting(text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_feature_flag(p_key text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before boolean;
BEGIN
  PERFORM app.require_admin();
  SELECT enabled INTO v_before FROM public.feature_flags WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown flag: %', p_key; END IF;
  UPDATE public.feature_flags
    SET enabled = p_enabled, updated_by = app.current_clerk_id(), updated_at = now()
    WHERE key = p_key;
  PERFORM audit.log_event('FEATURE_FLAG_SET', 'feature_flag', p_key, app.current_clerk_id(),
                          app.acting_role('OPS'),
                          jsonb_build_object('from', v_before, 'to', p_enabled));
END
$$;

CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before integer;
BEGIN
  PERFORM app.require_admin();
  SELECT value INTO v_before FROM public.app_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown setting: %', p_key; END IF;
  IF p_value IS NOT NULL AND p_value < 0 THEN RAISE EXCEPTION 'settings are non-negative'; END IF;
  UPDATE public.app_settings
    SET value = p_value, updated_by = app.current_clerk_id(), updated_at = now()
    WHERE key = p_key;
  PERFORM audit.log_event('APP_SETTING_SET', 'app_setting', p_key, app.current_clerk_id(),
                          app.acting_role('OPS'),
                          jsonb_build_object('from', v_before, 'to', p_value));
END
$$;

CREATE OR REPLACE FUNCTION public.set_category_rate(p_letter text, p_rate_paise integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before integer;
BEGIN
  PERFORM app.require_admin();
  IF p_rate_paise IS NULL OR p_rate_paise < 0 THEN RAISE EXCEPTION 'rate must be >= 0'; END IF;
  SELECT designer_rate_paise INTO v_before FROM public.job_categories WHERE letter = p_letter FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown category: %', p_letter; END IF;
  UPDATE public.job_categories
    SET designer_rate_paise = p_rate_paise, updated_at = now()
    WHERE letter = p_letter;
  PERFORM audit.log_event('CATEGORY_RATE_SET', 'job_category', p_letter, app.current_clerk_id(),
                          app.acting_role('FINANCE'),
                          jsonb_build_object('from', v_before, 'to', p_rate_paise));
END
$$;

REVOKE ALL ON FUNCTION public.set_feature_flag(text, boolean)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_app_setting(text, integer)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_category_rate(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, boolean)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, integer)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_category_rate(text, integer) TO authenticated, service_role;

-- ------------------------------------------------------ client codes --

-- The client part of the order reference (owner answer Q3): business-name
-- initials plus a counter per initials — Meera Jewels → MJ1, the next MJ
-- client → MJ2. Kept OUT of client_profiles so a client has a code before
-- they have filled in a profile, and so the code can be shown to staff
-- without opening the identity table. Designers never see it (0036).
CREATE TABLE client_accounts (
  user_id       text        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  code_prefix   text        NOT NULL CHECK (code_prefix ~ '^[A-Z]{2}$'),
  code_n        integer     NOT NULL CHECK (code_n >= 1),
  client_code   text        GENERATED ALWAYS AS (code_prefix || code_n::text) STORED UNIQUE,
  -- The $49 first design is once per account (DECISIONS §4). Set by the quote.
  first_design_order_id text REFERENCES orders (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_prefix, code_n)
);

ALTER TABLE client_profiles ADD COLUMN business_name text
  CHECK (business_name IS NULL OR char_length(btrim(business_name)) BETWEEN 1 AND 120);

-- Two letters from a name: first letters of the first two words, or the first
-- two letters of a single word. 'CL' when there is nothing to work with.
CREATE OR REPLACE FUNCTION app.code_prefix(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_words text[];
BEGIN
  v_words := array_remove(regexp_split_to_array(upper(coalesce(p_name, '')), '[^A-Z]+'), '');
  IF array_length(v_words, 1) >= 2 THEN
    RETURN left(v_words[1], 1) || left(v_words[2], 1);
  ELSIF array_length(v_words, 1) = 1 AND char_length(v_words[1]) >= 2 THEN
    RETURN left(v_words[1], 2);
  END IF;
  RETURN 'CL';
END
$$;

-- The client's code, created on first need. Name source: business name, then
-- legal name, then 'CL'.
CREATE OR REPLACE FUNCTION app.ensure_client_code(p_user_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code   text;
  v_prefix text;
  v_n      integer;
BEGIN
  SELECT client_code INTO v_code FROM public.client_accounts WHERE user_id = p_user_id;
  IF FOUND THEN RETURN v_code; END IF;

  SELECT app.code_prefix(coalesce(cp.business_name, cp.legal_name)) INTO v_prefix
  FROM public.client_profiles cp WHERE cp.user_id = p_user_id;
  v_prefix := coalesce(v_prefix, 'CL');

  -- Serialise per prefix so two new MJ clients cannot both become MJ2.
  PERFORM pg_advisory_xact_lock(hashtext('client_code:' || v_prefix));
  SELECT coalesce(max(code_n), 0) + 1 INTO v_n FROM public.client_accounts WHERE code_prefix = v_prefix;

  INSERT INTO public.client_accounts (user_id, code_prefix, code_n)
  VALUES (p_user_id, v_prefix, v_n)
  RETURNING client_code INTO v_code;
  RETURN v_code;
END
$$;

REVOKE ALL ON FUNCTION app.ensure_client_code(text) FROM PUBLIC;

-- A client fills in their own profile (S2 Create account). The client code is
-- minted here, from the business name, if they have not ordered yet.
CREATE OR REPLACE FUNCTION public.save_client_profile(
  p_business_name text,
  p_legal_name    text,
  p_email         text,
  p_phone         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.current_user_role() IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'only a client has a client profile';
  END IF;

  INSERT INTO public.client_profiles (id, user_id, legal_name, email, phone, business_name)
  VALUES (gen_random_uuid()::text, v_clerk_id, btrim(p_legal_name), btrim(p_email),
          nullif(btrim(p_phone), ''), nullif(btrim(p_business_name), ''))
  ON CONFLICT (user_id) DO UPDATE SET
    legal_name    = EXCLUDED.legal_name,
    email         = EXCLUDED.email,
    phone         = EXCLUDED.phone,
    business_name = EXCLUDED.business_name;

  PERFORM audit.log_event('CLIENT_PROFILE_SAVED', 'user', v_clerk_id, v_clerk_id, 'CLIENT', '{}'::jsonb);
  RETURN jsonb_build_object('client_code', app.ensure_client_code(v_clerk_id));
END
$$;

REVOKE ALL ON FUNCTION public.save_client_profile(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_client_profile(text, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------- orders --

CREATE SEQUENCE order_number_seq START 1;

ALTER TABLE orders
  ADD COLUMN service                service_kind   NOT NULL DEFAULT 'cad',
  ADD COLUMN order_no               bigint         UNIQUE,
  -- MJ1-RN-C-1: client · product · service · running number. Client-facing.
  ADD COLUMN order_ref              text           UNIQUE,
  -- RN-C-1: the same reference without the client. What designers see.
  ADD COLUMN job_code               text           UNIQUE,
  ADD COLUMN category               char(1)        REFERENCES job_categories (letter),
  ADD COLUMN tier                   job_tier,
  ADD COLUMN complex_deadline_hours integer        CHECK (complex_deadline_hours IS NULL OR complex_deadline_hours > 0),
  ADD COLUMN paid_at                timestamptz,
  ADD COLUMN payment_method         payment_method,
  ADD COLUMN sla_started_at         timestamptz,
  ADD COLUMN sla_due_at             timestamptz,
  ADD COLUMN first_look_at          timestamptz,
  ADD COLUMN sla_status             sla_status     NOT NULL DEFAULT 'pending',
  ADD COLUMN source                 order_source   NOT NULL DEFAULT 'portal',
  ADD COLUMN created_on_behalf_by   text           REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN intake_mode            intake_mode    NOT NULL DEFAULT 'full',
  ADD COLUMN client_po              text           CHECK (client_po IS NULL OR char_length(client_po) <= 60),
  -- INR, locked at quote (DECISIONS §5; owner answer Q2). The USD
  -- designer_payout / qc_payout columns of 0004 are the old escrow split.
  ADD COLUMN designer_payout_paise  integer        CHECK (designer_payout_paise IS NULL OR designer_payout_paise >= 0),
  ADD COLUMN qc_payout_paise        integer        CHECK (qc_payout_paise IS NULL OR qc_payout_paise >= 0),
  ADD CONSTRAINT orders_complex_has_deadline
    CHECK (tier IS DISTINCT FROM 'complex' OR complex_deadline_hours IS NOT NULL OR status IN ('DRAFT', 'SUBMITTED'));

CREATE INDEX orders_sla_running_idx ON orders (sla_due_at) WHERE sla_status = 'running';

CREATE OR REPLACE FUNCTION app.product_code(p_product text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE upper(coalesce(p_product, ''))
    WHEN 'RING'     THEN 'RN'
    WHEN 'SIGNET'   THEN 'RN'
    WHEN 'BAND'     THEN 'BD'
    WHEN 'PENDANT'  THEN 'PD'
    WHEN 'EARRING'  THEN 'ER'
    WHEN 'EARRINGS' THEN 'ER'
    WHEN 'BRACELET' THEN 'BR'
    WHEN 'BANGLE'   THEN 'BG'
    WHEN 'NECKLACE' THEN 'NK'
    ELSE 'OT'
  END
$$;

CREATE OR REPLACE FUNCTION app.service_code(p_service service_kind)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_service WHEN 'cad' THEN 'C' WHEN 'render' THEN 'R' ELSE 'CR' END
$$;

-- The reference is minted when the order is first submitted: that is when
-- the product is known, and a DRAFT nobody sent does not burn a number.
CREATE OR REPLACE FUNCTION app.assign_order_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product text;
BEGIN
  IF NEW.order_ref IS NOT NULL OR NEW.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  SELECT s.product::text INTO v_product FROM public.order_specs s WHERE s.order_id = NEW.id;
  v_product := coalesce(v_product, NEW.product_type);

  NEW.order_no := nextval('public.order_number_seq');
  NEW.job_code := app.product_code(v_product) || '-' || app.service_code(NEW.service) || '-' || NEW.order_no::text;
  NEW.order_ref := app.ensure_client_code(NEW.client_id) || '-' || NEW.job_code;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_assign_ref
  BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION app.assign_order_ref();

-- Orders already past DRAFT get references in the order they were placed.
UPDATE orders o
  SET status = o.status
  FROM (SELECT id FROM orders WHERE status <> 'DRAFT' AND order_ref IS NULL ORDER BY created_at, id) s
  WHERE o.id = s.id;

-- ----------------------------------------------------------- the brief --

-- Owner answer Q6: only the DECISIONS §11 minimum is required.
ALTER TABLE order_specs
  ALTER COLUMN karatage DROP NOT NULL,
  ALTER COLUMN purpose  DROP NOT NULL,
  ALTER COLUMN format   DROP NOT NULL,
  ALTER COLUMN finish   DROP NOT NULL,
  -- Size (DECISIONS §11): ring size or circumference; bangle/bracelet inner
  -- size or length. Lengths in µm like the rest of the brief.
  ADD COLUMN ring_size              text    CHECK (ring_size IS NULL OR char_length(btrim(ring_size)) BETWEEN 1 AND 12),
  ADD COLUMN inner_circumference_um integer CHECK (inner_circumference_um IS NULL OR inner_circumference_um BETWEEN 20000 AND 300000),
  ADD COLUMN inner_diameter_um      integer CHECK (inner_diameter_um IS NULL OR inner_diameter_um BETWEEN 5000 AND 100000),
  ADD COLUMN length_um              integer CHECK (length_um IS NULL OR length_um BETWEEN 1000 AND 1000000);

-- What is still missing before a portal order may be submitted (empty = ready).
-- The N1 screen (Phase 5) blocks "Review order" on this; the DB check at
-- submit lands with it.
CREATE OR REPLACE FUNCTION public.brief_missing(p_order_id text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_spec    public.order_specs%ROWTYPE;
  v_missing text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.client_id = app.current_clerk_id())
     AND NOT app.is_admin() THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT * INTO v_spec FROM public.order_specs WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN ARRAY['product', 'reference', 'size', 'metal'];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_reference_images WHERE order_id = p_order_id) THEN
    v_missing := array_append(v_missing, 'reference');
  END IF;
  IF v_spec.product::text IN ('RING', 'BAND')
     AND v_spec.ring_size IS NULL AND v_spec.inner_circumference_um IS NULL AND v_spec.inner_diameter_um IS NULL THEN
    v_missing := array_append(v_missing, 'size');
  ELSIF v_spec.product::text IN ('BANGLE', 'BRACELET')
     AND v_spec.inner_diameter_um IS NULL AND v_spec.inner_circumference_um IS NULL AND v_spec.length_um IS NULL THEN
    v_missing := array_append(v_missing, 'size');
  END IF;
  -- metal is NOT NULL on the table; the centre-stone yes/no and its shape and
  -- size are enforced by order_specs_centre_coherent.
  RETURN v_missing;
END
$$;

REVOKE ALL ON FUNCTION public.brief_missing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brief_missing(text) TO authenticated, service_role;

DROP FUNCTION public.upsert_order_spec(
  text, text, product_kind, metal_colour, text, cad_purpose, output_format, finish_type,
  boolean, stone_shape, integer, integer, integer, integer, boolean, integer, setting_type,
  stone_supply, integer, integer, priority_tier, text, text, text);

CREATE OR REPLACE FUNCTION public.upsert_order_spec(
  p_order_id               text,
  p_reference_name         text,
  p_product                product_kind,
  p_metal                  metal_colour,
  p_karatage               text          DEFAULT NULL,
  p_purpose                cad_purpose   DEFAULT NULL,
  p_format                 output_format DEFAULT NULL,
  p_finish                 finish_type   DEFAULT NULL,
  p_has_centre_stone       boolean       DEFAULT false,
  p_centre_shape           stone_shape   DEFAULT NULL,
  p_centre_length_um       integer       DEFAULT NULL,
  p_centre_width_um        integer       DEFAULT NULL,
  p_centre_depth_um        integer       DEFAULT NULL,
  p_centre_carat_mct       integer       DEFAULT NULL,
  p_centre_certified       boolean       DEFAULT false,
  p_centre_quantity        integer       DEFAULT 0,
  p_centre_setting         setting_type  DEFAULT NULL,
  p_stones_supplied_by     stone_supply  DEFAULT 'NONE',
  p_component_count        integer       DEFAULT 1,
  p_render_views           integer       DEFAULT 0,
  p_priority               priority_tier DEFAULT 'STANDARD',
  p_based_on_order_id      text          DEFAULT NULL,
  p_change_summary         text          DEFAULT NULL,
  p_notes                  text          DEFAULT NULL,
  p_ring_size              text          DEFAULT NULL,
  p_inner_circumference_um integer       DEFAULT NULL,
  p_inner_diameter_um      integer       DEFAULT NULL,
  p_length_um              integer       DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
BEGIN
  IF v_clerk_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such order';
  END IF;

  IF v_order.client_id <> v_clerk_id THEN
    RAISE EXCEPTION 'only the client who owns an order may write its brief';
  END IF;

  IF v_order.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION
      'the brief is fixed once the order has been quoted (order is %). Start a revision instead.',
      v_order.status;
  END IF;

  -- Rush is off until defined (DECISIONS §12). EXPRESS is the same promise
  -- under another name.
  IF coalesce(p_priority, 'STANDARD') <> 'STANDARD' AND NOT app.flag('rush') THEN
    RAISE EXCEPTION 'rush delivery is not available';
  END IF;

  IF p_based_on_order_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.orders
       WHERE id = p_based_on_order_id AND client_id = v_clerk_id
     ) THEN
    RAISE EXCEPTION 'the order this is based on is not one of yours';
  END IF;

  INSERT INTO public.order_specs AS s (
    order_id, reference_name, based_on_order_id, change_summary, product,
    has_centre_stone, centre_shape, centre_length_um, centre_width_um,
    centre_depth_um, centre_carat_mct, centre_certified, centre_quantity,
    centre_setting, stones_supplied_by, metal, karatage, purpose,
    component_count, format, finish, render_views, priority, notes,
    ring_size, inner_circumference_um, inner_diameter_um, length_um
  ) VALUES (
    p_order_id, p_reference_name, p_based_on_order_id, p_change_summary, p_product,
    p_has_centre_stone, p_centre_shape, p_centre_length_um, p_centre_width_um,
    p_centre_depth_um, p_centre_carat_mct, p_centre_certified, p_centre_quantity,
    p_centre_setting, p_stones_supplied_by, p_metal, nullif(btrim(p_karatage), ''), p_purpose,
    p_component_count, p_format, p_finish, p_render_views, coalesce(p_priority, 'STANDARD'), p_notes,
    nullif(btrim(p_ring_size), ''), p_inner_circumference_um, p_inner_diameter_um, p_length_um
  )
  ON CONFLICT (order_id) DO UPDATE SET
    reference_name    = EXCLUDED.reference_name,
    based_on_order_id = EXCLUDED.based_on_order_id,
    change_summary    = EXCLUDED.change_summary,
    product           = EXCLUDED.product,
    has_centre_stone  = EXCLUDED.has_centre_stone,
    centre_shape      = EXCLUDED.centre_shape,
    centre_length_um  = EXCLUDED.centre_length_um,
    centre_width_um   = EXCLUDED.centre_width_um,
    centre_depth_um   = EXCLUDED.centre_depth_um,
    centre_carat_mct  = EXCLUDED.centre_carat_mct,
    centre_certified  = EXCLUDED.centre_certified,
    centre_quantity   = EXCLUDED.centre_quantity,
    centre_setting    = EXCLUDED.centre_setting,
    stones_supplied_by = EXCLUDED.stones_supplied_by,
    metal             = EXCLUDED.metal,
    karatage          = EXCLUDED.karatage,
    purpose           = EXCLUDED.purpose,
    component_count   = EXCLUDED.component_count,
    format            = EXCLUDED.format,
    finish            = EXCLUDED.finish,
    render_views      = EXCLUDED.render_views,
    priority          = EXCLUDED.priority,
    notes             = EXCLUDED.notes,
    ring_size         = EXCLUDED.ring_size,
    inner_circumference_um = EXCLUDED.inner_circumference_um,
    inner_diameter_um = EXCLUDED.inner_diameter_um,
    length_um         = EXCLUDED.length_um,
    updated_at        = now();

  PERFORM audit.log_event(
    'ORDER_SPEC_SAVED', 'order', p_order_id, v_clerk_id, app.current_user_role(),
    jsonb_build_object('product', p_product, 'purpose', p_purpose)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_order_spec(
  text, text, product_kind, metal_colour, text, cad_purpose, output_format, finish_type,
  boolean, stone_shape, integer, integer, integer, integer, boolean, integer, setting_type,
  stone_supply, integer, integer, priority_tier, text, text, text, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_order_spec(
  text, text, product_kind, metal_colour, text, cad_purpose, output_format, finish_type,
  boolean, stone_shape, integer, integer, integer, integer, boolean, integer, setting_type,
  stone_supply, integer, integer, priority_tier, text, text, text, text, integer, integer, integer
) TO authenticated, service_role;
