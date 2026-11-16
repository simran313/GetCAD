-- =============================================================================
-- 0068: client verification (KYC) before the portal opens (owner, 16 Nov 2026;
-- DECISIONS 1.30).
--
-- Until now anyone who signed in became an ACTIVE client at once (0007,
-- "placeholder policy") and could see every client screen: the brief, the
-- tools, the pricing flow. A competitor with a Gmail address could walk the
-- whole product. From here:
--
--   1. A self sign-up is a CLIENT with status PENDING (ensure_self).
--   2. The client tells us about the business (submit_client_verification)
--      and uploads at least one proof of registration
--      (add_client_verification_document; private bucket, admins only).
--   3. An admin approves (approve_client: status ACTIVE, everything unlocks)
--      or declines with a reason (reject_client_verification: the client
--      sees the reason and may submit again). Every step is in the audit log;
--      admins are told the moment a business is submitted.
--   4. The database refuses a new order from a client who is not ACTIVE,
--      unless the team places it for them (orders_require_verified_client).
--
-- Accounts the team opens (register_client) are approved; promoting a pending
-- sign-up to a team role activates it. Existing clients with an order, or
-- opened by the team, stay ACTIVE; every other self sign-up becomes PENDING
-- and sees the verification screen on their next visit.
-- =============================================================================

-- ------------------------------------------------------------- tables --

CREATE TABLE public.client_verifications (
  user_id         text        PRIMARY KEY REFERENCES public.users (id) ON DELETE RESTRICT,
  business_type   text        NOT NULL CHECK (business_type IN
                                ('RETAIL_JEWELER', 'MANUFACTURER', 'BRAND_WHOLESALER', 'DESIGN_STUDIO', 'OTHER')),
  country         text        NOT NULL CHECK (char_length(btrim(country)) BETWEEN 2 AND 60),
  address         text        NOT NULL CHECK (char_length(btrim(address)) BETWEEN 5 AND 400),
  website         text        NOT NULL CHECK (char_length(btrim(website)) BETWEEN 4 AND 300),
  role_title      text        CHECK (role_title IS NULL OR char_length(role_title) <= 80),
  state           text        NOT NULL CHECK (state IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      text        REFERENCES public.users (id) ON DELETE RESTRICT,
  decision_reason text        CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 500)
);

CREATE TABLE public.client_verification_documents (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  kind        text        NOT NULL CHECK (kind IN
                            ('EIN_LETTER', 'STATE_REGISTRATION', 'SALES_TAX_PERMIT', 'BUSINESS_LICENSE',
                             'FOREIGN_REGISTRATION', 'OTHER')),
  object_key  text        NOT NULL UNIQUE,
  file_name   text        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime        text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes  integer     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX client_verification_documents_user_idx
  ON public.client_verification_documents (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Locked at once, in the same run as the CREATE (Supabase grants new tables
-- to the API roles by default). policies/0049 states the same, for db:apply.
ALTER TABLE public.client_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_verifications FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.client_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_verifications TO service_role;
ALTER TABLE public.client_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_verification_documents FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.client_verification_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_verification_documents TO service_role;

-- The private bucket the proofs live in, where storage exists (Supabase); the
-- local test database has no storage schema.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('client-verification', 'client-verification', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- ------------------------------------------------------------ helpers --

-- Admins (OPS, primary or granted) who should hear about a new submission.
CREATE OR REPLACE FUNCTION app.notify_admins(p_kind text, p_summary text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin text;
BEGIN
  FOR v_admin IN
    SELECT u.id FROM public.users u
    WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
      AND (u.role = 'OPS' OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'OPS'))
  LOOP
    PERFORM app.notify(v_admin, app.current_clerk_id(), p_kind, NULL, p_summary);
  END LOOP;
END
$$;

-- The calling client's own account, refusing anyone else.
CREATE OR REPLACE FUNCTION app.require_client()
RETURNS public.users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = app.current_clerk_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_user.role <> 'CLIENT' THEN RAISE EXCEPTION 'only a client account is verified'; END IF;
  RETURN v_user;
END
$$;

-- ---------------------------------------------------- the client's side --

-- What the verification screen needs: where the account stands, what was
-- submitted, why it was declined, how many proofs are on file.
CREATE OR REPLACE FUNCTION public.my_client_verification()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE := app.require_client();
  v_ver  public.client_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_ver FROM public.client_verifications WHERE user_id = v_user.id;
  RETURN jsonb_build_object(
    'account_status', v_user.status,
    'has_profile', EXISTS (SELECT 1 FROM public.client_profiles WHERE user_id = v_user.id AND deleted_at IS NULL),
    'state', v_ver.state,
    'business_type', v_ver.business_type,
    'country', v_ver.country,
    'address', v_ver.address,
    'website', v_ver.website,
    'role_title', v_ver.role_title,
    'submitted_at', v_ver.submitted_at,
    'decision_reason', CASE WHEN v_ver.state = 'REJECTED' THEN v_ver.decision_reason END,
    'documents', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'file_name', d.file_name)
                                ORDER BY d.created_at), '[]'::jsonb)
      FROM public.client_verification_documents d
      WHERE d.user_id = v_user.id AND d.deleted_at IS NULL
    )
  );
END
$$;

-- A proof the server has just stored in the client's own folder.
CREATE OR REPLACE FUNCTION public.add_client_verification_document(
  p_kind       text,
  p_object_key text,
  p_file_name  text,
  p_mime       text,
  p_size_bytes integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE := app.require_client();
  v_id   text;
BEGIN
  IF v_user.status <> 'PENDING' THEN RAISE EXCEPTION 'this account is already verified'; END IF;
  IF p_object_key IS NULL OR p_object_key NOT LIKE 'clients/' || v_user.id || '/%' THEN
    RAISE EXCEPTION 'the file is not in this account''s folder';
  END IF;
  IF (SELECT count(*) FROM public.client_verification_documents
      WHERE user_id = v_user.id AND deleted_at IS NULL) >= 5 THEN
    RAISE EXCEPTION 'five documents at most: remove one first';
  END IF;

  INSERT INTO public.client_verification_documents (user_id, kind, object_key, file_name, mime, size_bytes)
  VALUES (v_user.id, p_kind, p_object_key, left(btrim(p_file_name), 200), p_mime, p_size_bytes)
  RETURNING id INTO v_id;

  PERFORM audit.log_event('CLIENT_VERIFICATION_DOCUMENT_ADDED', 'user', v_user.id, v_user.id, 'CLIENT',
                          jsonb_build_object('document_id', v_id, 'kind', p_kind));
  RETURN v_id;
END
$$;

-- Removes one of the client's own proofs before approval; returns the file's
-- key, which the server deletes.
CREATE OR REPLACE FUNCTION public.remove_my_verification_document(p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE := app.require_client();
  v_doc  public.client_verification_documents%ROWTYPE;
BEGIN
  IF v_user.status <> 'PENDING' THEN RAISE EXCEPTION 'this account is already verified'; END IF;
  UPDATE public.client_verification_documents SET deleted_at = now()
  WHERE id = p_id AND user_id = v_user.id AND deleted_at IS NULL
  RETURNING * INTO v_doc;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such document'; END IF;

  PERFORM audit.log_event('CLIENT_VERIFICATION_DOCUMENT_REMOVED', 'user', v_user.id, v_user.id, 'CLIENT',
                          jsonb_build_object('document_id', p_id, 'kind', v_doc.kind));
  RETURN v_doc.object_key;
END
$$;

-- Send the business for review: profile on file, at least one proof.
CREATE OR REPLACE FUNCTION public.submit_client_verification(
  p_business_type text,
  p_country       text,
  p_address       text,
  p_website       text,
  p_role_title    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user     public.users%ROWTYPE := app.require_client();
  v_business text;
  v_email    text;
  v_name     text;
BEGIN
  IF v_user.status <> 'PENDING' THEN RAISE EXCEPTION 'this account is already verified'; END IF;

  SELECT coalesce(nullif(btrim(business_name), ''), legal_name), email, legal_name
    INTO v_business, v_email, v_name
  FROM public.client_profiles WHERE user_id = v_user.id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'add your business name and contact first'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.client_verification_documents WHERE user_id = v_user.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'upload at least one proof that the business is registered';
  END IF;

  INSERT INTO public.client_verifications
    (user_id, business_type, country, address, website, role_title, state, submitted_at,
     decided_at, decided_by, decision_reason)
  VALUES
    (v_user.id, p_business_type, btrim(p_country), btrim(p_address), btrim(p_website),
     nullif(btrim(coalesce(p_role_title, '')), ''), 'SUBMITTED', now(), NULL, NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    business_type = EXCLUDED.business_type,
    country = EXCLUDED.country,
    address = EXCLUDED.address,
    website = EXCLUDED.website,
    role_title = EXCLUDED.role_title,
    state = 'SUBMITTED',
    submitted_at = now(),
    decided_at = NULL,
    decided_by = NULL,
    decision_reason = NULL;

  PERFORM audit.log_event('CLIENT_VERIFICATION_SUBMITTED', 'user', v_user.id, v_user.id, 'CLIENT',
                          jsonb_build_object('business_type', p_business_type, 'country', btrim(p_country)));
  PERFORM app.notify_admins('CLIENT_VERIFICATION', 'New business to verify: ' || left(v_business, 80));
  PERFORM app.enqueue_email('CLIENT_VERIFICATION_RECEIVED', v_email, jsonb_build_object('name', v_name),
                            'email:client-verification-received:' || v_user.id || ':' || extract(epoch FROM now())::bigint);
  RETURN jsonb_build_object('state', 'SUBMITTED');
END
$$;

-- --------------------------------------------------------- the admin side --

-- Every client account still waiting: signed up but not submitted, submitted,
-- or declined (and so able to submit again). Admins only.
CREATE OR REPLACE FUNCTION public.admin_client_verifications()
RETURNS TABLE (
  user_id         text,
  created_at      timestamptz,
  business_name   text,
  contact_name    text,
  email           text,
  phone           text,
  state           text,
  business_type   text,
  country         text,
  address         text,
  website         text,
  role_title      text,
  submitted_at    timestamptz,
  decision_reason text,
  documents       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT u.id, u.created_at, p.business_name, p.legal_name, p.email, p.phone,
         coalesce(v.state, 'NOT_SUBMITTED'), v.business_type, v.country, v.address, v.website, v.role_title,
         v.submitted_at, v.decision_reason,
         (SELECT count(*)::integer FROM public.client_verification_documents d
          WHERE d.user_id = u.id AND d.deleted_at IS NULL)
  FROM public.users u
  LEFT JOIN public.client_profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
  LEFT JOIN public.client_verifications v ON v.user_id = u.id
  WHERE u.role = 'CLIENT' AND u.status = 'PENDING' AND u.deleted_at IS NULL
  ORDER BY (v.state = 'SUBMITTED') DESC NULLS LAST, coalesce(v.submitted_at, u.created_at) DESC;
END
$$;

CREATE OR REPLACE FUNCTION public.client_verification_documents_for(p_user_id text)
RETURNS TABLE (id text, kind text, file_name text, mime text, size_bytes integer, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT d.id, d.kind, d.file_name, d.mime, d.size_bytes, d.created_at
  FROM public.client_verification_documents d
  WHERE d.user_id = p_user_id AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC;
END
$$;

-- Where one proof's file is, for the download route. Every open is an
-- identity read in the audit log.
CREATE OR REPLACE FUNCTION public.client_verification_document_open(p_id text)
RETURNS TABLE (object_key text, file_name text, mime text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc public.client_verification_documents%ROWTYPE;
BEGIN
  PERFORM app.require_admin();
  SELECT * INTO v_doc FROM public.client_verification_documents d WHERE d.id = p_id AND d.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such document'; END IF;

  PERFORM audit.log_event('CLIENT_VERIFICATION_DOCUMENT_OPENED', 'user', v_doc.user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('document_id', p_id, 'kind', v_doc.kind), true);
  RETURN QUERY SELECT v_doc.object_key, v_doc.file_name, v_doc.mime;
END
$$;

-- Approve: the account becomes ACTIVE and every client screen unlocks.
CREATE OR REPLACE FUNCTION public.approve_client(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  public.users%ROWTYPE;
  v_email text;
  v_name  text;
BEGIN
  PERFORM app.require_admin();
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such account'; END IF;
  IF v_user.role <> 'CLIENT' THEN RAISE EXCEPTION 'only a client account is verified'; END IF;
  IF v_user.status <> 'PENDING' THEN RAISE EXCEPTION 'this account is not waiting for approval'; END IF;

  UPDATE public.users SET status = 'ACTIVE' WHERE id = p_user_id;
  UPDATE public.client_verifications
     SET state = 'APPROVED', decided_at = now(), decided_by = app.current_clerk_id(), decision_reason = NULL
   WHERE user_id = p_user_id;

  PERFORM audit.log_event('CLIENT_APPROVED', 'user', p_user_id, app.current_clerk_id(), app.acting_role('OPS'),
                          jsonb_build_object('submitted', FOUND));
  PERFORM app.notify(p_user_id, app.current_clerk_id(), 'ACCOUNT', NULL,
                     'Your business is verified. Every feature is now unlocked.');

  SELECT email, legal_name INTO v_email, v_name FROM public.client_profiles WHERE user_id = p_user_id AND deleted_at IS NULL;
  PERFORM app.enqueue_email('CLIENT_APPROVED', v_email, jsonb_build_object('name', v_name),
                            'email:client-approved:' || p_user_id);
  RETURN jsonb_build_object('user_id', p_user_id, 'status', 'ACTIVE');
END
$$;

-- Decline with a reason the client sees; they may submit again.
CREATE OR REPLACE FUNCTION public.reject_client_verification(p_user_id text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  public.users%ROWTYPE;
  v_email text;
  v_name  text;
BEGIN
  PERFORM app.require_admin();
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'say why, so the client knows what to send';
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_user.role <> 'CLIENT' OR v_user.status <> 'PENDING' THEN
    RAISE EXCEPTION 'this account is not waiting for approval';
  END IF;

  UPDATE public.client_verifications
     SET state = 'REJECTED', decided_at = now(), decided_by = app.current_clerk_id(),
         decision_reason = left(btrim(p_reason), 500)
   WHERE user_id = p_user_id AND state = 'SUBMITTED';
  IF NOT FOUND THEN RAISE EXCEPTION 'nothing has been submitted to decline'; END IF;

  PERFORM audit.log_event('CLIENT_VERIFICATION_REJECTED', 'user', p_user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), '{}'::jsonb);
  PERFORM app.notify(p_user_id, app.current_clerk_id(), 'ACCOUNT', NULL,
                     'We could not verify your business yet. See what to send.');

  SELECT email, legal_name INTO v_email, v_name FROM public.client_profiles WHERE user_id = p_user_id AND deleted_at IS NULL;
  PERFORM app.enqueue_email('CLIENT_VERIFICATION_DECLINED', v_email,
                            jsonb_build_object('name', v_name, 'reason', left(btrim(p_reason), 500)),
                            'email:client-declined:' || p_user_id || ':' || extract(epoch FROM now())::bigint);
  RETURN jsonb_build_object('user_id', p_user_id, 'state', 'REJECTED');
END
$$;

-- ------------------------------------------------------------- the gate --

-- No new order from a client who is not ACTIVE (pending or suspended), unless
-- the team places it for them. Covers every path that inserts an order.
CREATE OR REPLACE FUNCTION app.orders_require_verified_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_on_behalf_by IS NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.client_id AND u.role = 'CLIENT' AND u.status <> 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'your business is not verified yet: orders open once we approve your account';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_require_verified_client
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.orders_require_verified_client();

-- ------------------------------------------------------ sign-up and roles --

-- A self sign-up starts PENDING (was ACTIVE, 0007's flagged placeholder).
CREATE OR REPLACE FUNCTION public.ensure_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text;
  v_created  boolean := false;
BEGIN
  v_clerk_id := app.current_clerk_id();
  IF v_clerk_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated: no Clerk identity on this request';
  END IF;

  INSERT INTO public.users (id, role, status)
  VALUES (v_clerk_id, 'CLIENT', 'PENDING')
  ON CONFLICT (id) DO NOTHING;

  IF FOUND THEN
    v_created := true;
    PERFORM audit.log_event(
      'USER_CREATED',
      'user',
      v_clerk_id,
      v_clerk_id,
      'CLIENT'::public.role,
      jsonb_build_object('role', 'CLIENT', 'status', 'PENDING', 'via', 'self_onboarding')
    );
  END IF;

  RETURN jsonb_build_object('created', v_created, 'user_id', v_clerk_id);
END
$$;

-- A client the team opens is approved: the team vouches for them. A pending
-- self sign-up the team opens again is approved too.
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
  v_status   public.user_status;
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

  SELECT role, status INTO v_role, v_status FROM public.users WHERE id = p_user_id;
  IF FOUND AND v_role <> 'CLIENT' THEN
    RAISE EXCEPTION 'that email belongs to a team or designer account, not a client';
  END IF;

  INSERT INTO public.users (id, role, status)
  VALUES (p_user_id, 'CLIENT', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'
    WHERE public.users.role = 'CLIENT' AND public.users.status = 'PENDING';

  -- A client who already filled in their profile keeps it.
  INSERT INTO public.client_profiles (id, user_id, legal_name, email, phone, business_name)
  VALUES (gen_random_uuid()::text, p_user_id,
          coalesce(nullif(btrim(p_contact_name), ''), btrim(p_business_name)),
          btrim(p_email), nullif(btrim(p_phone), ''), btrim(p_business_name))
  ON CONFLICT (user_id) DO NOTHING
  RETURNING true INTO v_created;

  PERFORM audit.log_event('CLIENT_REGISTERED_BY_TEAM', 'user', p_user_id, v_clerk_id,
                          app.current_user_role(),
                          jsonb_build_object('profile_created', coalesce(v_created, false),
                                             'approved_pending', v_status IS NOT DISTINCT FROM 'PENDING'));

  RETURN jsonb_build_object('user_id', p_user_id,
                            'client_code', app.ensure_client_code(p_user_id),
                            'new', coalesce(v_created, false));
END
$$;

-- Promoting a pending sign-up to a team role makes it ACTIVE: a new admin or
-- pod lead signs up first and is promoted, and must not stay locked out. A
-- designer keeps PENDING until they sign the agreement (0009).
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  text;
  v_before public.users%ROWTYPE;
BEGIN
  PERFORM app.require_ops();
  v_actor := app.current_clerk_id();

  IF p_role NOT IN ('CLIENT','DESIGNER','OPS','SALES','FINANCE','QC') THEN
    RAISE EXCEPTION 'unknown role: %', p_role;
  END IF;

  SELECT * INTO v_before FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such user';
  END IF;

  IF v_before.role = 'OPS' AND p_role <> 'OPS' AND app.other_active_ops(p_user_id) = 0 THEN
    RAISE EXCEPTION 'this is the last active OPS account — promote someone else first';
  END IF;

  IF v_before.role = p_role::public.role THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', false);
  END IF;

  UPDATE public.users
     SET role = p_role::public.role,
         status = CASE WHEN v_before.role = 'CLIENT' AND v_before.status = 'PENDING'
                            AND p_role IN ('OPS','SALES','FINANCE','QC')
                       THEN 'ACTIVE'::public.user_status ELSE status END
   WHERE id = p_user_id;

  PERFORM audit.log_event(
    'USER_ROLE_CHANGED', 'user', p_user_id, v_actor, app.current_user_role(),
    jsonb_build_object('from', v_before.role, 'to', p_role, 'self', v_actor = p_user_id)
  );

  RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', true);
END
$$;

-- The welcome email says "your account is ready, send a brief": true only for
-- a verified client. A pending sign-up hears from us when they submit
-- (CLIENT_VERIFICATION_RECEIVED) and when they are approved (CLIENT_APPROVED,
-- which is their welcome).
CREATE OR REPLACE FUNCTION app.welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND status = 'PENDING') THEN RETURN NEW; END IF;
  PERFORM app.enqueue_email('WELCOME', NEW.email, jsonb_build_object('name', NEW.legal_name), 'email:welcome:' || NEW.user_id);
  RETURN NEW;
END
$$;

-- --------------------------------------------------------------- emails --

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK (template IN (
  'DESIGNER_APPLICATION_RECEIVED',
  'CONTACT_RECEIVED',
  'DESIGNER_APPLICATION_ACCEPTED',
  'DESIGNER_APPLICATION_REJECTED',
  'PAYOUT_SENT',
  'ORDER_PLACED_FOR_YOU',
  'WELCOME',
  'ORDER_RECEIVED',
  'QUOTE_READY',
  'QUOTE_REMINDER',
  'PAYMENT_RECEIVED',
  'ORDER_CONFIRMED',
  'FIRST_LOOK_READY',
  'REVISION_RECEIVED',
  'REVISED_DESIGN_READY',
  'PREVIEW_REMINDER',
  'DESIGN_APPROVED',
  'FILES_DELIVERED',
  'PROBLEM_RECEIVED',
  'ORDER_REFUNDED',
  'ORDER_CANCELLED',
  'ORDER_DELAYED',
  'CREDIT_DECIDED',
  'NEW_MESSAGE',
  'FEEDBACK_REQUEST',
  'CLIENT_VERIFICATION_RECEIVED',
  'CLIENT_APPROVED',
  'CLIENT_VERIFICATION_DECLINED'
));

-- ------------------------------------------------------------- backfill --

-- Existing clients: those with an order, or opened by the team, stay ACTIVE;
-- every other self sign-up is asked to verify on their next visit.
DO $$
DECLARE
  v_id text;
BEGIN
  FOR v_id IN
    SELECT u.id FROM public.users u
    WHERE u.role = 'CLIENT' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.client_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM audit.audit_log a
                      WHERE a.action = 'CLIENT_REGISTERED_BY_TEAM' AND a.entity_id = u.id)
  LOOP
    UPDATE public.users SET status = 'PENDING' WHERE id = v_id;
    PERFORM audit.log_event('CLIENT_VERIFICATION_REQUIRED', 'user', v_id, NULL, NULL,
                            jsonb_build_object('via', 'migration_0068'));
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION app.notify_admins(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.require_client() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.orders_require_verified_client() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.my_client_verification() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_client_verification_document(text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_my_verification_document(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_client_verification(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_client_verifications() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_verification_documents_for(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_verification_document_open(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_client(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_client_verification(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_client_verification() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_client_verification_document(text, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_my_verification_document(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_client_verification(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_client_verifications() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_verification_documents_for(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_verification_document_open(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_client(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_client_verification(text, text) TO authenticated, service_role;
