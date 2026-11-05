-- 0062_master_instructions_certificates.sql
--
-- Owner, 5 Nov 2026:
--
-- 1. Master instructions. A client writes their factory's standing
--    requirements once (shank thickness, prong style, casting allowances...)
--    and every one of their orders shows them to the designer and the pod
--    lead. One row per client; the client writes it from Account, an admin
--    may write it for a client the team looks after (0043). Nobody reads the
--    table directly (policies/0047): the client reads their own, and anyone
--    who may see an order reads that order's client's, through the
--    functions below. The text never carries the client's name: the screen
--    asks them to leave it out, as with the brief's notes.
--
-- 2. Diamond certificates. An optional picture of the centre stone's
--    grading certificate, so the seat is cut to the real stone. Same rules
--    as a reference picture (0029): uploaded through the sanitization gate
--    with metadata stripped (JPEG or PNG only: a PDF cannot be cleaned, so it
--    is not accepted where the designer sees it), opaque key, added by the
--    client who owns the order (or the team on it) while the brief is open.
--    Read by anyone who may see the order.

-- ------------------------------------------------- master instructions --

CREATE TABLE public.client_master_instructions (
  client_id  text        PRIMARY KEY REFERENCES public.users (id) ON DELETE RESTRICT,
  body       text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  updated_by text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Write (or, with an empty text, clear) the master instructions. No client
-- id: the caller's own, and the caller must be a client. With a client id:
-- an admin writing for that client.
CREATE OR REPLACE FUNCTION public.set_master_instructions(p_body text, p_client_id text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     text := app.current_clerk_id();
  v_client text;
  v_body   text := nullif(btrim(coalesce(p_body, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_client_id IS NULL OR p_client_id = v_me THEN
    IF app.current_user_role() <> 'CLIENT' THEN
      RAISE EXCEPTION 'master instructions belong to a client account';
    END IF;
    v_client := v_me;
  ELSE
    IF NOT app.is_admin() THEN
      RAISE EXCEPTION 'only an admin may write a client''s master instructions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_client_id AND u.role = 'CLIENT') THEN
      RAISE EXCEPTION 'no such client';
    END IF;
    v_client := p_client_id;
  END IF;

  IF v_body IS NOT NULL AND char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'master instructions are limited to 4000 characters';
  END IF;

  IF v_body IS NULL THEN
    DELETE FROM public.client_master_instructions WHERE client_id = v_client;
  ELSE
    INSERT INTO public.client_master_instructions (client_id, body, updated_by, updated_at)
    VALUES (v_client, v_body, v_me, now())
    ON CONFLICT (client_id) DO UPDATE
      SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  END IF;
  RETURN v_body;
END;
$$;

-- An admin writes them from an order's page, for that order's client (the
-- client's id never leaves the database).
CREATE OR REPLACE FUNCTION public.set_order_master_instructions(p_order_id text, p_body text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client text;
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'only an admin may write a client''s master instructions';
  END IF;
  SELECT o.client_id INTO v_client FROM public.orders o WHERE o.id = p_order_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'no such order'; END IF;
  RETURN public.set_master_instructions(p_body, v_client);
END;
$$;

-- The caller's own (a client), or NULL.
CREATE OR REPLACE FUNCTION public.my_master_instructions()
RETURNS TABLE (body text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.body, m.updated_at
  FROM public.client_master_instructions m
  WHERE m.client_id = app.current_clerk_id()
$$;

-- The instructions of the client who placed this order, for anyone who may
-- see the order (app.order_relation: the client, the assigned designer, the
-- pod lead, admins, the staff whose queue it is in). Nothing else about the
-- client comes back.
CREATE OR REPLACE FUNCTION public.order_master_instructions(p_order_id text)
RETURNS TABLE (body text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.body, m.updated_at
  FROM public.orders o
  JOIN public.client_master_instructions m ON m.client_id = o.client_id
  WHERE o.id = p_order_id
    AND app.current_clerk_id() IS NOT NULL
    AND app.order_relation(p_order_id) IS NOT NULL
$$;

-- ------------------------------------------------ diamond certificates --

CREATE TABLE public.order_stone_certificates (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     text        NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  object_key   text        NOT NULL UNIQUE,
  content_type text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  size_bytes   integer     NOT NULL CHECK (size_bytes > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_stone_certificates_order_idx ON public.order_stone_certificates (order_id);

CREATE OR REPLACE FUNCTION public.add_stone_certificate(
  p_order_id     text,
  p_object_key   text,
  p_content_type text,
  p_size_bytes   integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    text := app.current_clerk_id();
  v_order public.orders%ROWTYPE;
  v_id    text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such order'; END IF;
  IF v_order.client_id <> v_me AND NOT app.team_on_order(p_order_id) THEN
    RAISE EXCEPTION 'only the client who owns an order may add a certificate to it';
  END IF;
  IF v_order.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'certificates are fixed once the order has been quoted (order is %)', v_order.status;
  END IF;
  IF (SELECT count(*) FROM public.order_stone_certificates c WHERE c.order_id = p_order_id) >= 5 THEN
    RAISE EXCEPTION 'up to 5 certificates per order';
  END IF;
  IF p_object_key IS NULL OR p_object_key NOT LIKE p_order_id || '/certs/%' THEN
    RAISE EXCEPTION 'the file is not stored under this order';
  END IF;

  INSERT INTO public.order_stone_certificates (order_id, object_key, content_type, size_bytes)
  VALUES (p_order_id, p_object_key, p_content_type, p_size_bytes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Remove one; returns the object key so the caller deletes the bytes after
-- the row (the reference-picture order, 0029).
CREATE OR REPLACE FUNCTION public.remove_stone_certificate(p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    text := app.current_clerk_id();
  v_cert  public.order_stone_certificates%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_cert FROM public.order_stone_certificates WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such certificate'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_cert.order_id;
  IF v_order.client_id <> v_me AND NOT app.team_on_order(v_order.id) THEN
    RAISE EXCEPTION 'only the client who owns an order may remove its certificate';
  END IF;
  IF v_order.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'certificates are fixed once the order has been quoted (order is %)', v_order.status;
  END IF;
  DELETE FROM public.order_stone_certificates WHERE id = p_id;
  RETURN v_cert.object_key;
END;
$$;

-- An order's certificates, for anyone who may see the order.
CREATE OR REPLACE FUNCTION public.order_stone_certificates_for(p_order_id text)
RETURNS TABLE (id text, object_key text, content_type text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.object_key, c.content_type, c.created_at
  FROM public.order_stone_certificates c
  WHERE c.order_id = p_order_id
    AND app.current_clerk_id() IS NOT NULL
    AND app.order_relation(p_order_id) IS NOT NULL
  ORDER BY c.created_at, c.id
$$;

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.set_master_instructions(text, text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_master_instructions(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_master_instructions()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_master_instructions(text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_stone_certificate(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_stone_certificate(text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_stone_certificates_for(text)     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_master_instructions(text, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_master_instructions(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_master_instructions()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_master_instructions(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_stone_certificate(text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_stone_certificate(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_stone_certificates_for(text)     TO authenticated, service_role;
