-- 0043_on_behalf_orders.sql
-- Phase 4a: orders the team places for a client from an email, a WhatsApp
-- chat or a phone call (DECISIONS §11, Spec A10/P6), and client accounts the
-- team opens for clients who have never signed up (owner answer, Phase 4).
--
-- THE TEAM. Admins, and pod leads (QC + a POD_LEAD membership). A pod lead
-- places orders into their own pod; an admin into any pod, or none yet.
--
-- FLOW. create_order_on_behalf() opens a DRAFT (intake_mode 'quick', source
-- email / whatsapp / phone, received_at), add_order_screenshot() attaches the
-- request as it arrived, submit_order_on_behalf() submits it — refused without
-- at least one screenshot — mints the reference, and (if asked) emails the
-- client and tells them in the app. The clock is unchanged: it starts when the
-- order is paid AND confirmed (DECISIONS §6).
--
-- SCREENSHOTS show the client's name, number or email. They are for the
-- client and the team only (owner answer): designers have no row, no
-- function and no URL that reaches them. The pod lead gives the designer
-- clean reference pictures through the brief instead.
--
-- THE BRIEF. On these orders the team may write the brief and its reference
-- pictures (the client still can too), under the same freeze: until quoted.
--
-- NEW CLIENTS. The server opens the Clerk account (email, no password; the
-- client signs in with an emailed code), then register_client() records the
-- user as a CLIENT with a profile and a client code. An existing account is
-- never overwritten.

-- ------------------------------------------------------------- the team --

CREATE OR REPLACE FUNCTION app.is_team()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_admin() OR cardinality(app.current_pod_ids()) > 0
$$;

REVOKE ALL ON FUNCTION app.is_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_team() TO authenticated, service_role;

-- For the server, before it opens a sign-in account for a new client: is the
-- caller on the team? (The database checks again in register_client.)
CREATE OR REPLACE FUNCTION public.i_am_team()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.current_clerk_id() IS NOT NULL AND app.is_team()
$$;

REVOKE ALL ON FUNCTION public.i_am_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.i_am_team() TO authenticated, service_role;

-- The team member is staff on this order: an admin, or its pod's lead.
CREATE OR REPLACE FUNCTION app.team_on_order(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (app.is_admin() OR app.is_pod_lead_of(o.pod_id))
  )
$$;

REVOKE ALL ON FUNCTION app.team_on_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.team_on_order(text) TO authenticated, service_role;

-- Who may see the request screenshots: the client and the team on the order
-- (policies/0034). Not a designer, whatever else is true.
CREATE OR REPLACE FUNCTION app.can_see_screenshots(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(app.order_relation(p_order_id) IN ('CLIENT', 'ADMIN', 'POD_LEAD'), false)
$$;

REVOKE ALL ON FUNCTION app.can_see_screenshots(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_see_screenshots(text) TO authenticated, service_role;

-- The team may write the brief of an order it took in (quick intake).
CREATE OR REPLACE FUNCTION app.team_writes_brief(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.intake_mode = 'quick'
  ) AND app.team_on_order(p_order_id)
$$;

REVOKE ALL ON FUNCTION app.team_writes_brief(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.team_writes_brief(text) TO authenticated, service_role;

-- The six brief writers (0028, 0029, 0035) admit the team on quick-intake
-- orders. Each owner check is widened in place; the quote freeze and every
-- other rule in them stay as they are. A pattern that is not found stops the
-- migration rather than leaving a function half-changed.
DO $$
DECLARE
  r     record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.upsert_order_spec',
       'IF v_order.client_id <> v_clerk_id THEN',
       'IF v_order.client_id <> v_clerk_id AND NOT app.team_writes_brief(v_order.id) THEN'),
      ('public.set_order_accents',
       'IF v_client <> v_clerk_id THEN',
       'IF v_client <> v_clerk_id AND NOT app.team_writes_brief(p_order_id) THEN'),
      ('public.add_reference_image',
       'IF v_client <> v_clerk_id THEN',
       'IF v_client <> v_clerk_id AND NOT app.team_writes_brief(p_order_id) THEN'),
      ('public.set_reference_pins',
       'IF v_client <> v_clerk_id THEN',
       'IF v_client <> v_clerk_id AND NOT app.team_writes_brief(v_order) THEN'),
      ('public.set_primary_reference',
       'IF v_client <> v_clerk_id THEN',
       'IF v_client <> v_clerk_id AND NOT app.team_writes_brief(v_order) THEN'),
      ('public.remove_reference_image',
       'IF v_client <> v_clerk_id THEN',
       'IF v_client <> v_clerk_id AND NOT app.team_writes_brief(v_order) THEN')
    ) AS t(fn, old_text, new_text)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.oid = to_regproc(r.fn);
    IF v_def IS NULL THEN
      RAISE EXCEPTION '0043: function % not found', r.fn;
    END IF;
    v_new := replace(v_def, r.old_text, r.new_text);
    IF v_new = v_def THEN
      RAISE EXCEPTION '0043: owner check not found in %', r.fn;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$$;

-- ---------------------------------------------------------- new clients --

CREATE OR REPLACE FUNCTION public.register_client(
  p_user_id       text,
  p_business_name text,
  p_contact_name  text,
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
  v_role     public.role;
  v_created  boolean := false;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_team() THEN
    RAISE EXCEPTION 'only an admin or a pod lead may open a client account';
  END IF;
  IF p_user_id IS NULL OR p_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'not a sign-in account id';
  END IF;
  IF p_business_name IS NULL OR btrim(p_business_name) = '' THEN
    RAISE EXCEPTION 'the business name is required';
  END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
  IF FOUND AND v_role <> 'CLIENT' THEN
    RAISE EXCEPTION 'that email belongs to a team or designer account, not a client';
  END IF;

  INSERT INTO public.users (id, role, status)
  VALUES (p_user_id, 'CLIENT', 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  -- A client who already filled in their profile keeps it.
  INSERT INTO public.client_profiles (id, user_id, legal_name, email, phone, business_name)
  VALUES (gen_random_uuid()::text, p_user_id,
          coalesce(nullif(btrim(p_contact_name), ''), btrim(p_business_name)),
          btrim(p_email), nullif(btrim(p_phone), ''), btrim(p_business_name))
  ON CONFLICT (user_id) DO NOTHING
  RETURNING true INTO v_created;

  PERFORM audit.log_event('CLIENT_REGISTERED_BY_TEAM', 'user', p_user_id, v_clerk_id,
                          app.current_user_role(),
                          jsonb_build_object('profile_created', coalesce(v_created, false)));

  RETURN jsonb_build_object('user_id', p_user_id,
                            'client_code', app.ensure_client_code(p_user_id),
                            'new', coalesce(v_created, false));
END
$$;

-- Find a client to place an order for. Identity read: audited with the query.
CREATE OR REPLACE FUNCTION public.find_clients(p_query text)
RETURNS TABLE (
  user_id       text,
  client_code   text,
  business_name text,
  contact_name  text,
  email         text,
  phone         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q text := btrim(coalesce(p_query, ''));
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_team() THEN
    RAISE EXCEPTION 'only an admin or a pod lead may look up clients';
  END IF;
  IF char_length(v_q) < 2 THEN
    RAISE EXCEPTION 'type at least 2 characters';
  END IF;

  PERFORM audit.log_event('CLIENT_LOOKUP', 'user', NULL, app.current_clerk_id(), app.current_user_role(),
                          jsonb_build_object('query', left(v_q, 80)), true);

  RETURN QUERY
  SELECT u.id, ca.client_code, cp.business_name, cp.legal_name, cp.email, cp.phone
  FROM public.users u
  JOIN public.client_profiles cp ON cp.user_id = u.id AND cp.deleted_at IS NULL
  LEFT JOIN public.client_accounts ca ON ca.user_id = u.id
  WHERE u.role = 'CLIENT'
    AND (cp.business_name ILIKE '%' || v_q || '%'
         OR cp.legal_name ILIKE '%' || v_q || '%'
         OR cp.email ILIKE '%' || v_q || '%'
         OR cp.phone ILIKE '%' || v_q || '%'
         OR ca.client_code ILIKE v_q)
  ORDER BY cp.business_name NULLS LAST, cp.legal_name
  LIMIT 20;
END
$$;

-- The client's contact details on one order, for the team's "send on
-- WhatsApp" and email buttons. Never for a designer. Not audited per read:
-- the team on the order already talks to this client in its thread, and the
-- order page re-reads every 20 seconds; searching for a client (find_clients)
-- is what is logged.
CREATE OR REPLACE FUNCTION public.order_client_contact(p_order_id text)
RETURNS TABLE (business_name text, contact_name text, email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.team_on_order(p_order_id) THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;
  RETURN QUERY
  SELECT cp.business_name, cp.legal_name, cp.email, cp.phone
  FROM public.orders o
  JOIN public.client_profiles cp ON cp.user_id = o.client_id
  WHERE o.id = p_order_id;
END
$$;

-- ---------------------------------------------------- on-behalf orders --

ALTER TABLE orders ADD COLUMN received_at timestamptz;

CREATE OR REPLACE FUNCTION public.create_order_on_behalf(
  p_id          text,
  p_client_id   text,
  p_source      public.order_source,
  p_product     public.product_kind,
  p_service     public.service_kind DEFAULT 'cad',
  p_received_at timestamptz         DEFAULT NULL,
  p_note        text                DEFAULT NULL,
  p_pod_id      text                DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_pod      text := p_pod_id;
  v_lead     text;
  v_thread   text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_team() THEN
    RAISE EXCEPTION 'only an admin or a pod lead may place an order for a client';
  END IF;
  IF p_source IS NULL OR p_source = 'portal' THEN
    RAISE EXCEPTION 'say where the order came from: email, WhatsApp or phone';
  END IF;
  IF p_received_at IS NOT NULL AND p_received_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'the order cannot have been received in the future';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 4000 THEN
    RAISE EXCEPTION 'keep the note under 4000 characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_client_id AND role = 'CLIENT') THEN
    RAISE EXCEPTION 'client not found';
  END IF;

  -- A pod lead places into a pod they lead; an admin into any pod, or none.
  IF NOT app.is_admin() THEN
    IF v_pod IS NULL THEN
      v_pod := (app.current_pod_ids())[1];
    ELSIF NOT app.is_pod_lead_of(v_pod) THEN
      RAISE EXCEPTION 'you can only place orders into a pod you lead';
    END IF;
  ELSIF v_pod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pods WHERE id = v_pod) THEN
    RAISE EXCEPTION 'pod not found';
  END IF;
  IF v_pod IS NOT NULL THEN
    SELECT pm.user_id INTO v_lead
    FROM public.pod_members pm
    WHERE pm.pod_id = v_pod AND pm.member_role = 'POD_LEAD'
    ORDER BY (pm.user_id = v_clerk_id) DESC, pm.added_at
    LIMIT 1;
  END IF;

  INSERT INTO public.orders
    (id, client_id, product_type, status, currency, service, source, intake_mode,
     created_on_behalf_by, received_at, pod_id, pod_lead_id,
     price_total, designer_payout, qc_payout, platform_commission)
  VALUES
    (p_id, p_client_id, p_product::text, 'DRAFT', 'USD', p_service, p_source, 'quick',
     v_clerk_id, coalesce(p_received_at, now()), v_pod, v_lead,
     0, 0, 0, 0);

  PERFORM audit.log_event(
    'ORDER_CREATED', 'order', p_id, v_clerk_id, app.current_user_role(),
    jsonb_build_object('product_type', p_product, 'currency', 'USD',
                       'on_behalf', true, 'source', p_source)
  );

  -- What the team understood, where the client and the team both read it.
  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    SELECT id INTO v_thread FROM public.message_threads WHERE order_id = p_id AND kind = 'client_team';
    PERFORM public.post_thread_message(v_thread, btrim(p_note));
  END IF;

  RETURN jsonb_build_object('order_id', p_id, 'pod_id', v_pod);
END
$$;

CREATE OR REPLACE FUNCTION public.add_order_screenshot(
  p_order_id     text,
  p_object_key   text,
  p_content_type text,
  p_size_bytes   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_pos      integer;
  v_id       text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT app.team_on_order(p_order_id) THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;
  IF v_order.source = 'portal' THEN
    RAISE EXCEPTION 'screenshots belong to orders the team placed';
  END IF;

  SELECT coalesce(max(position), 0) + 1 INTO v_pos FROM public.order_screenshots WHERE order_id = p_order_id;
  IF v_pos > 20 THEN
    RAISE EXCEPTION 'at most 20 screenshots per order';
  END IF;

  INSERT INTO public.order_screenshots (order_id, object_key, content_type, size_bytes, position, added_by)
  VALUES (p_order_id, p_object_key, p_content_type, p_size_bytes, v_pos, v_clerk_id)
  RETURNING id INTO v_id;

  PERFORM audit.log_event('SCREENSHOT_ADDED', 'order', p_order_id, v_clerk_id, app.current_user_role(),
                          jsonb_build_object('screenshot_id', v_id, 'position', v_pos));
  RETURN jsonb_build_object('id', v_id, 'position', v_pos);
END
$$;

CREATE OR REPLACE FUNCTION public.submit_order_on_behalf(p_order_id text, p_notify boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_ref      text;
  v_email    text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT app.team_on_order(p_order_id) THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;
  IF v_order.intake_mode <> 'quick' OR v_order.source = 'portal' THEN
    RAISE EXCEPTION 'not an order the team placed';
  END IF;
  IF v_order.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'this order was already submitted (is %)', v_order.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_screenshots WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'add at least one screenshot of the request before submitting';
  END IF;

  UPDATE public.orders SET status = 'SUBMITTED' WHERE id = p_order_id
  RETURNING order_ref INTO v_ref;

  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, app.current_user_role(),
    jsonb_build_object('from', 'DRAFT', 'to', 'SUBMITTED', 'on_behalf', true)
  );

  IF p_notify THEN
    PERFORM app.notify(v_order.client_id, v_clerk_id, 'PLACED', p_order_id,
                       'The team placed an order for you.');
    SELECT email INTO v_email FROM public.client_profiles WHERE user_id = v_order.client_id;
    PERFORM app.enqueue_email(
      'ORDER_PLACED_FOR_YOU', v_email,
      jsonb_build_object('order_ref', v_ref, 'order_id', p_order_id, 'channel', v_order.source),
      'email:order_placed:' || p_order_id
    );
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'order_ref', v_ref, 'notified', p_notify);
END
$$;

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK (template IN (
  'DESIGNER_APPLICATION_RECEIVED',
  'CONTACT_RECEIVED',
  'DESIGNER_APPLICATION_ACCEPTED',
  'DESIGNER_APPLICATION_REJECTED',
  'PAYOUT_SENT',
  'ORDER_PLACED_FOR_YOU'
));

-- --------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.register_client(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_clients(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_client_contact(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_on_behalf(text, text, public.order_source, public.product_kind,
  public.service_kind, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_order_screenshot(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_order_on_behalf(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_client(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_clients(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_client_contact(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_on_behalf(text, text, public.order_source, public.product_kind,
  public.service_kind, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_order_screenshot(text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_order_on_behalf(text, boolean) TO authenticated, service_role;
