-- 0061_designers_by_team.sql
--
-- Owner, 4 Nov 2026: the team adds its own designers. An admin enters each
-- designer's name and email (the sign-in account is opened by the server,
-- as for clients in 0043), records their bank details, and keeps their
-- identity documents (PAN card, Aadhaar, bank proof) in the portal. Admins
-- see all of it; a pod lead sees the designers placed in their pod, never
-- their documents or bank details.
--
-- 1. designer_profiles.phone (optional, for WhatsApp).
-- 2. register_designer(): an admin opens a designer (DESIGNER, PENDING:
--    they still sign the agreement themselves on first sign-in, 0009).
-- 3. admin_designers(): every designer, with pod, bank status and the
--    number of documents on file.
-- 4. set_payout_account_for(): an admin records a designer's bank details
--    (the designer's own form, 0023, stays as it is).
-- 5. payout_account_full(): an admin reads them in full; every read is
--    written to the audit log as an identity read.
-- 6. designer_documents + add / list / open / remove: the files live in the
--    private designer-documents bucket; the table holds where, no policy
--    lets anyone read it directly (policies/0046), and every open is audited.

-- --------------------------------------------------------------- phone --

ALTER TABLE public.designer_profiles
  ADD COLUMN phone text CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 6 AND 30);

-- ------------------------------------------------------------ register --

CREATE OR REPLACE FUNCTION public.register_designer(
  p_user_id    text,
  p_legal_name text,
  p_email      text,
  p_phone      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role    public.role;
  v_name    text := btrim(regexp_replace(coalesce(p_legal_name, ''), '\s+', ' ', 'g'));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_created boolean;
BEGIN
  PERFORM app.require_admin();
  IF p_user_id IS NULL OR p_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'not a sign-in account id';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'the designer''s name is required';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
  IF FOUND AND v_role <> 'DESIGNER' THEN
    RAISE EXCEPTION 'that email belongs to a client or team account, not a designer';
  END IF;

  INSERT INTO public.users (id, role, status)
  VALUES (p_user_id, 'DESIGNER', 'PENDING')
  ON CONFLICT (id) DO NOTHING;

  -- A designer already on file keeps their profile; a missing phone is filled in.
  INSERT INTO public.designer_profiles (id, user_id, legal_name, email, country, phone)
  VALUES (gen_random_uuid()::text, p_user_id, v_name, v_email, 'IN', nullif(btrim(coalesce(p_phone, '')), ''))
  ON CONFLICT (user_id) DO NOTHING
  RETURNING true INTO v_created;
  IF NOT coalesce(v_created, false) AND nullif(btrim(coalesce(p_phone, '')), '') IS NOT NULL THEN
    UPDATE public.designer_profiles SET phone = btrim(p_phone) WHERE user_id = p_user_id AND phone IS NULL;
  END IF;

  PERFORM audit.log_event('DESIGNER_REGISTERED_BY_TEAM', 'user', p_user_id, app.current_clerk_id(),
                          app.acting_role('OPS'),
                          jsonb_build_object('profile_created', coalesce(v_created, false)));
  RETURN jsonb_build_object('user_id', p_user_id, 'new', coalesce(v_created, false));
END
$$;

-- ------------------------------------------------------------ documents --

CREATE TABLE public.designer_documents (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  kind        text        NOT NULL CHECK (kind IN ('PAN_CARD', 'AADHAAR', 'BANK_PROOF', 'PHOTO', 'OTHER')),
  object_key  text        NOT NULL UNIQUE,
  file_name   text        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime        text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes  integer     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX designer_documents_user_idx ON public.designer_documents (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- The private bucket the files live in, where storage exists (Supabase);
-- the local test database has no storage schema.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('designer-documents', 'designer-documents', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- Only designers and pod leads (QC) are paid, so only they have documents here.
CREATE OR REPLACE FUNCTION app.is_payee_account(p_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND role IN ('DESIGNER', 'QC') AND deleted_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.add_designer_document(
  p_user_id    text,
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
  v_id text;
BEGIN
  PERFORM app.require_admin();
  IF NOT app.is_payee_account(p_user_id) THEN
    RAISE EXCEPTION 'documents are kept for designers and pod leads only';
  END IF;
  IF p_object_key IS NULL OR p_object_key NOT LIKE 'designers/' || p_user_id || '/%' THEN
    RAISE EXCEPTION 'the file is not in this designer''s folder';
  END IF;

  INSERT INTO public.designer_documents (user_id, kind, object_key, file_name, mime, size_bytes, uploaded_by)
  VALUES (p_user_id, p_kind, p_object_key, left(btrim(p_file_name), 200), p_mime, p_size_bytes, app.current_clerk_id())
  RETURNING id INTO v_id;

  PERFORM audit.log_event('DESIGNER_DOCUMENT_ADDED', 'user', p_user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('document_id', v_id, 'kind', p_kind));
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.designer_documents_for(p_user_id text)
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
  FROM public.designer_documents d
  WHERE d.user_id = p_user_id AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC;
END
$$;

-- Where one document's file is, for the download route. Every open is an
-- identity read in the audit log.
CREATE OR REPLACE FUNCTION public.designer_document_open(p_id text)
RETURNS TABLE (object_key text, file_name text, mime text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc public.designer_documents%ROWTYPE;
BEGIN
  PERFORM app.require_admin();
  SELECT * INTO v_doc FROM public.designer_documents WHERE designer_documents.id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such document'; END IF;

  PERFORM audit.log_event('DESIGNER_DOCUMENT_OPENED', 'user', v_doc.user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('document_id', p_id, 'kind', v_doc.kind), true);
  RETURN QUERY SELECT v_doc.object_key, v_doc.file_name, v_doc.mime;
END
$$;

-- Removes the record and returns the file's key, which the server deletes:
-- a superseded identity document is a liability, not a record worth keeping.
CREATE OR REPLACE FUNCTION public.remove_designer_document(p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc public.designer_documents%ROWTYPE;
BEGIN
  PERFORM app.require_admin();
  UPDATE public.designer_documents SET deleted_at = now()
  WHERE designer_documents.id = p_id AND deleted_at IS NULL
  RETURNING * INTO v_doc;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such document'; END IF;

  PERFORM audit.log_event('DESIGNER_DOCUMENT_REMOVED', 'user', v_doc.user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('document_id', p_id, 'kind', v_doc.kind));
  RETURN v_doc.object_key;
END
$$;

-- ---------------------------------------------------------- bank details --

CREATE OR REPLACE FUNCTION public.set_payout_account_for(
  p_user_id          text,
  p_beneficiary_name text,
  p_pan              text,
  p_account_number   text,
  p_ifsc             text,
  p_account_type     text,
  p_verified         boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name     text := btrim(regexp_replace(coalesce(p_beneficiary_name, ''), '\s+', ' ', 'g'));
  v_pan      text := upper(regexp_replace(coalesce(p_pan, ''),  '\s', '', 'g'));
  v_ifsc     text := upper(regexp_replace(coalesce(p_ifsc, ''), '\s', '', 'g'));
  v_acct     text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
  v_status   text := CASE WHEN coalesce(p_verified, false) THEN 'VERIFIED' ELSE 'PENDING_VERIFICATION' END;
  v_replaced boolean;
BEGIN
  PERFORM app.require_admin();
  IF NOT app.is_payee_account(p_user_id) THEN
    RAISE EXCEPTION 'only a designer or pod lead has a payout account';
  END IF;

  -- The same checks as the designer's own form (0023), so both say the same.
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'beneficiary name is required';
  END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    RAISE EXCEPTION 'PAN must be five letters, four digits, then one letter';
  END IF;
  IF v_acct !~ '^[0-9]{9,18}$' THEN
    RAISE EXCEPTION 'account number must be 9 to 18 digits';
  END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'IFSC must be four letters, a zero, then six characters';
  END IF;
  IF p_account_type IS NULL OR p_account_type NOT IN ('SAVINGS', 'CURRENT') THEN
    RAISE EXCEPTION 'account type must be SAVINGS or CURRENT';
  END IF;

  PERFORM 1 FROM public.payout_accounts WHERE user_id = p_user_id FOR UPDATE;
  v_replaced := FOUND;

  INSERT INTO public.payout_accounts (user_id, beneficiary_name, pan, account_number, ifsc, account_type, status)
  VALUES (p_user_id, v_name, v_pan, v_acct, v_ifsc, p_account_type, v_status)
  ON CONFLICT (user_id) DO UPDATE
    SET beneficiary_name = EXCLUDED.beneficiary_name,
        pan              = EXCLUDED.pan,
        account_number   = EXCLUDED.account_number,
        ifsc             = EXCLUDED.ifsc,
        account_type     = EXCLUDED.account_type,
        status           = EXCLUDED.status,
        rejection_reason = NULL,
        -- The processor's handles belong to the old beneficiary.
        processor_account_ref      = NULL,
        processor_fund_account_ref = NULL,
        updated_at       = now();

  -- Fragments only: an audit log that leaks what it audits is a liability.
  PERFORM audit.log_event('PAYOUT_ACCOUNT_SET_BY_TEAM', 'payout_account', p_user_id, app.current_clerk_id(),
                          app.acting_role('OPS'),
                          jsonb_build_object('account_last4', right(v_acct, 4), 'pan_last4', right(v_pan, 4),
                                             'ifsc', v_ifsc, 'account_type', p_account_type,
                                             'status', v_status, 'replaced', v_replaced));
  RETURN jsonb_build_object('status', v_status, 'account_last4', right(v_acct, 4));
END
$$;

CREATE OR REPLACE FUNCTION public.payout_account_full(p_user_id text)
RETURNS TABLE (beneficiary_name text, pan text, account_number text, ifsc text, account_type text,
               status text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  PERFORM audit.log_event('PAYOUT_ACCOUNT_READ', 'payout_account', p_user_id, app.current_clerk_id(),
                          app.acting_role('OPS'), '{}'::jsonb, true);
  RETURN QUERY
  SELECT a.beneficiary_name, a.pan, a.account_number, a.ifsc, a.account_type, a.status, a.updated_at
  FROM public.payout_accounts a WHERE a.user_id = p_user_id;
END
$$;

-- ---------------------------------------------------------------- list --

CREATE OR REPLACE FUNCTION public.admin_designers()
RETURNS TABLE (
  user_id          text,
  legal_name       text,
  email            text,
  phone            text,
  status           text,
  agreement_signed boolean,
  designer_ref     text,
  pod_id           text,
  pod_name         text,
  payout_status    text,
  account_last4    text,
  documents        integer,
  created_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_admin();
  RETURN QUERY
  SELECT u.id, dp.legal_name, dp.email, dp.phone, u.status::text,
         dp.agreement_accepted_at IS NOT NULL, dp.designer_ref,
         pm.pod_id, p.name, a.status, a.account_last4,
         (SELECT count(*)::integer FROM public.designer_documents d WHERE d.user_id = u.id AND d.deleted_at IS NULL),
         dp.created_at
  FROM public.users u
  JOIN public.designer_profiles dp ON dp.user_id = u.id AND dp.deleted_at IS NULL
  LEFT JOIN public.pod_members pm ON pm.user_id = u.id
  LEFT JOIN public.pods p ON p.id = pm.pod_id
  LEFT JOIN public.payout_accounts a ON a.user_id = u.id
  WHERE u.role = 'DESIGNER' AND u.deleted_at IS NULL
  ORDER BY dp.legal_name;
END
$$;

-- --------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.register_designer(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_designer_document(text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.designer_documents_for(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.designer_document_open(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_designer_document(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_payout_account_for(text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payout_account_full(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_designers() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_payee_account(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_designer(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_designer_document(text, text, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.designer_documents_for(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.designer_document_open(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_designer_document(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_payout_account_for(text, text, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payout_account_full(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_designers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_payee_account(text) TO authenticated, service_role;
