-- 0049_attribution.sql
-- Phase 6: where clients come from, in our own database (owner answer Q16:
-- no third-party analytics).
--
--   marketing_attribution — one row per account: the answer to "How did you
--     hear about us?" (required at sign-up, S3) and the first-touch cookie
--     (utm tags, referring site, landing page). First answer kept.
--   marketing_events — the funnel: brief_started, brief_submitted,
--     payment_completed, first_look_viewed, approved (and, from Phase 7,
--     preview_link_created, spec_claim_opened). The order-driven ones are
--     written by triggers, so they cannot be skipped or double-counted by
--     the app.
--   start_brief_lead() — the /jewelry-cad form: the visitor's email and the
--     piece become a lead for the team, with no email sent from here.
--
-- Nothing here is readable by anyone but an admin (attribution_report).

CREATE TABLE marketing_attribution (
  user_id     text        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  heard_about text        NOT NULL CHECK (heard_about IN
                ('google', 'instagram', 'facebook', 'linkedin', 'referral', 'trade_show', 'email', 'other')),
  first_touch jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing_events (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event      text        NOT NULL CHECK (event IN
               ('brief_started', 'brief_submitted', 'payment_completed', 'first_look_viewed',
                'approved', 'preview_link_created', 'spec_claim_opened')),
  user_id    text        REFERENCES users (id) ON DELETE RESTRICT,
  order_id   text        REFERENCES orders (id) ON DELETE RESTRICT,
  visitor_id text        CHECK (visitor_id IS NULL OR char_length(visitor_id) <= 64),
  props      jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) <= 2048),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_events_event_idx ON marketing_events (event, created_at DESC);

REVOKE ALL ON marketing_attribution, marketing_events FROM PUBLIC, anon, authenticated;

-- Only the keys the cookie may carry, as short text.
CREATE OR REPLACE FUNCTION app.clean_first_touch(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(k, left(v, 200)), '{}'::jsonb)
  FROM jsonb_each_text(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS e(k, v)
  WHERE k IN ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing_path', 'at')
$$;

CREATE OR REPLACE FUNCTION public.save_attribution(p_heard_about text, p_first_touch jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_heard_about IS NULL OR btrim(p_heard_about) = '' THEN
    RAISE EXCEPTION 'tell us how you heard about us';
  END IF;
  INSERT INTO public.marketing_attribution (user_id, heard_about, first_touch)
  VALUES (v_clerk_id, btrim(p_heard_about), app.clean_first_touch(p_first_touch))
  ON CONFLICT (user_id) DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION public.has_attribution()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketing_attribution WHERE user_id = app.current_clerk_id())
$$;

-- An event from the app: a signed-in person (their own order only), or an
-- anonymous visitor by a random visitor id (no order).
CREATE OR REPLACE FUNCTION public.record_marketing_event(
  p_event      text,
  p_order_id   text DEFAULT NULL,
  p_visitor_id text DEFAULT NULL,
  p_props      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    text := p_order_id;
BEGIN
  IF p_event NOT IN ('brief_started', 'first_look_viewed', 'preview_link_created', 'spec_claim_opened') THEN
    RAISE EXCEPTION 'this event is recorded by the database, not the app';
  END IF;
  IF v_order IS NOT NULL AND (v_clerk_id IS NULL OR app.order_relation(v_order) IS NULL) THEN
    v_order := NULL;
  END IF;
  INSERT INTO public.marketing_events (event, user_id, order_id, visitor_id, props)
  VALUES (p_event, v_clerk_id, v_order, left(p_visitor_id, 64),
          CASE WHEN jsonb_typeof(p_props) = 'object' AND pg_column_size(p_props) <= 1024 THEN p_props ELSE '{}'::jsonb END);
END
$$;

-- The order-driven funnel, written where it happens.
CREATE OR REPLACE FUNCTION app.marketing_order_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SUBMITTED', 'APPROVED') THEN
    INSERT INTO public.marketing_events (event, user_id, order_id, props)
    VALUES (CASE NEW.status WHEN 'SUBMITTED' THEN 'brief_submitted' ELSE 'approved' END,
            NEW.client_id, NEW.id, jsonb_build_object('source', NEW.source));
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_marketing_events
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION app.marketing_order_events();

CREATE OR REPLACE FUNCTION app.marketing_payment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'HOLD' THEN
    INSERT INTO public.marketing_events (event, user_id, order_id, props)
    SELECT 'payment_completed', o.client_id, o.id,
           jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency)
    FROM public.orders o WHERE o.id = NEW.order_id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER escrow_marketing_payment
  AFTER INSERT ON escrow_ledger
  FOR EACH ROW
  EXECUTE FUNCTION app.marketing_payment_event();

-- /jewelry-cad: a lead the team prices within the hour.
CREATE OR REPLACE FUNCTION public.start_brief_lead(p_email text, p_product text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    text;
  v_email text := btrim(coalesce(p_email, ''));
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;
  IF p_product IS NULL OR btrim(p_product) = '' OR char_length(p_product) > 40 THEN
    RAISE EXCEPTION 'choose the type of piece';
  END IF;
  INSERT INTO public.marketing_leads (name, email, role, message)
  VALUES (v_email, v_email, 'BUSINESS',
          left('Started a brief on /jewelry-cad: ' || btrim(p_product)
               || coalesce(' — ' || nullif(btrim(p_note), ''), ''), 5000))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Admin: where clients come from, and the funnel over the last 30 days.
CREATE OR REPLACE FUNCTION public.attribution_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN jsonb_build_object(
    'heard_about', coalesce((SELECT jsonb_object_agg(heard_about, n) FROM
                    (SELECT heard_about, count(*) AS n FROM public.marketing_attribution GROUP BY 1) a), '{}'::jsonb),
    'sources', coalesce((SELECT jsonb_object_agg(src, n) FROM
                    (SELECT coalesce(first_touch ->> 'utm_source', first_touch ->> 'referrer', 'direct') AS src, count(*) AS n
                     FROM public.marketing_attribution GROUP BY 1) s), '{}'::jsonb),
    'events_30d', coalesce((SELECT jsonb_object_agg(event, n) FROM
                    (SELECT event, count(*) AS n FROM public.marketing_events
                     WHERE created_at > now() - interval '30 days' GROUP BY 1) e), '{}'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.save_attribution(text, jsonb)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_attribution()                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_marketing_event(text, text, text, jsonb)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_brief_lead(text, text, text)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attribution_report()                             FROM PUBLIC;
REVOKE ALL ON FUNCTION app.marketing_order_events()                            FROM PUBLIC;
REVOKE ALL ON FUNCTION app.marketing_payment_event()                           FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_attribution(text, jsonb)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_attribution()                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_marketing_event(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_brief_lead(text, text, text)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attribution_report()                            TO authenticated, service_role;
