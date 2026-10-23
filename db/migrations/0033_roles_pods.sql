-- 0033_roles_pods.sql
-- Roles a person can HOLD, and the pods the work is organised in.
--
-- WHAT DECISIONS §2 NEEDS THAT THE SCHEMA COULD NOT SAY.
--
--   ADMIN is "Sales + Ops + Finance". `users.role` holds one value, so the only
--   way to make one person an admin was to pick one of the three and lose the
--   other two. `user_roles` adds the extra staff roles a person holds; the
--   primary `users.role` stays exactly as it was, so nothing that reads it
--   changes meaning.
--
--   POD LEAD is "QC + a pod". QC was a pool: every QC user saw every order in
--   review. DECISIONS says a pod lead never sees another pod, so pods become
--   rows and an order belongs to one.
--
-- HOW EXISTING FUNCTIONS LEARN ABOUT EXTRA ROLES. Each money/queue function
-- checks its role with `v_role := app.current_user_role(); IF v_role IS
-- DISTINCT FROM 'SALES' THEN …`. Rather than copy eight long function bodies
-- to change one line each, the DO block at the end rewrites exactly that line
-- to ask `app.acting_role('SALES')` first — "act as SALES if you hold it" — and
-- REFUSES to finish unless every expected rewrite happened. The audit row then
-- records the role actually exercised, not whichever role happens to be
-- primary. tests/db/roles_pods.test.ts proves an admin can quote, release,
-- refund, resolve and triage, and that a plain QC still cannot.

-- ------------------------------------------------------------- roles --

CREATE TABLE user_roles (
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role       role        NOT NULL,
  granted_by text        REFERENCES users (id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  -- Only staff roles stack. A client who is also a designer, or a designer who
  -- is also QC, is exactly the self-review the independence rule (0020) exists
  -- to stop.
  CONSTRAINT user_roles_staff_only CHECK (role IN ('SALES', 'OPS', 'FINANCE', 'QC'))
);

-- Every role the current user holds: their primary role plus any granted ones.
CREATE OR REPLACE FUNCTION app.current_roles()
RETURNS public.role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT s.r), '{}'::public.role[])
  FROM (
    SELECT u.role AS r
    FROM public.users u
    WHERE u.id = app.current_clerk_id() AND u.deleted_at IS NULL
    UNION ALL
    SELECT ur.role
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = app.current_clerk_id() AND u.deleted_at IS NULL
  ) s
$$;

CREATE OR REPLACE FUNCTION app.has_role(p_role public.role)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_role = ANY (app.current_roles())
$$;

-- The role to act as: p_role if the user holds it, otherwise their primary
-- role (so the caller's existing "IS DISTINCT FROM" check refuses as before).
CREATE OR REPLACE FUNCTION app.acting_role(p_role public.role)
RETURNS public.role
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN app.has_role(p_role) THEN p_role ELSE app.current_user_role() END
$$;

-- DECISIONS §2: Admin = Sales + Ops + Finance.
CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT app.has_role('SALES') AND app.has_role('OPS') AND app.has_role('FINANCE')
$$;

-- Same question about someone else (used when validating a grant).
CREATE OR REPLACE FUNCTION app.user_has_role(p_user_id text, p_role public.role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.deleted_at IS NULL
      AND (u.role = p_role
           OR EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = u.id AND ur.role = p_role))
  )
$$;

GRANT EXECUTE ON FUNCTION app.current_roles()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.has_role(public.role)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.acting_role(public.role)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_admin()                      TO authenticated, service_role;
REVOKE ALL ON FUNCTION app.user_has_role(text, public.role) FROM PUBLIC;

-- The last-OPS lockout (0032) must count granted OPS too, or an admin whose
-- primary role is SALES would not count as an administrator.
CREATE OR REPLACE FUNCTION app.other_active_ops(p_excluding text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.users u
  WHERE u.status = 'ACTIVE'
    AND u.deleted_at IS NULL
    AND u.id IS DISTINCT FROM p_excluding
    AND (u.role = 'OPS'
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'OPS'));
$$;

-- Grant an extra staff role. OPS only (0032's rule: a role that can grant
-- itself a promotion is not a permission boundary). Audited with the actor.
CREATE OR REPLACE FUNCTION public.grant_user_role(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   text;
  v_primary public.role;
BEGIN
  PERFORM app.require_ops();
  v_actor := app.current_clerk_id();

  IF p_role NOT IN ('SALES', 'OPS', 'FINANCE', 'QC') THEN
    RAISE EXCEPTION 'only staff roles can be granted: %', p_role;
  END IF;

  SELECT role INTO v_primary FROM public.users WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such user'; END IF;
  IF v_primary IN ('CLIENT', 'DESIGNER') THEN
    RAISE EXCEPTION 'a % account cannot hold staff roles', v_primary;
  END IF;
  IF v_primary = p_role::public.role THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', false);
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (p_user_id, p_role::public.role, v_actor)
  ON CONFLICT (user_id, role) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', false);
  END IF;

  PERFORM audit.log_event(
    'USER_ROLE_GRANTED', 'user', p_user_id, v_actor, app.acting_role('OPS'),
    jsonb_build_object('role', p_role, 'self', v_actor = p_user_id)
  );
  RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', true);
END
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
BEGIN
  PERFORM app.require_ops();
  v_actor := app.current_clerk_id();

  IF p_role = 'OPS'
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND role = 'OPS')
     AND app.other_active_ops(p_user_id) = 0 THEN
    RAISE EXCEPTION 'this is the last active OPS account — promote someone else first';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role::public.role;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', false);
  END IF;

  PERFORM audit.log_event(
    'USER_ROLE_REVOKED', 'user', p_user_id, v_actor, app.acting_role('OPS'),
    jsonb_build_object('role', p_role, 'self', v_actor = p_user_id)
  );
  RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', true);
END
$$;

REVOKE ALL ON FUNCTION public.grant_user_role(text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_role(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_user_role(text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(text, text) TO authenticated, service_role;

-- -------------------------------------------------------------- pods --

CREATE TABLE pods (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       text        NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One pod per person. A designer in two pods would be visible to two pod
-- leads, and "pod lead sees only their pod" stops meaning anything.
CREATE TABLE pod_members (
  pod_id      text        NOT NULL REFERENCES pods (id) ON DELETE RESTRICT,
  user_id     text        NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  member_role text        NOT NULL CHECK (member_role IN ('POD_LEAD', 'DESIGNER')),
  added_by    text        REFERENCES users (id) ON DELETE RESTRICT,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pod_id, user_id)
);

CREATE INDEX pod_members_pod_idx ON pod_members (pod_id, member_role);

-- An order belongs to one pod, run by one pod lead. Set by admin (Spec §7).
ALTER TABLE orders
  ADD COLUMN pod_id      text REFERENCES pods (id)  ON DELETE RESTRICT,
  ADD COLUMN pod_lead_id text REFERENCES users (id) ON DELETE RESTRICT;

CREATE INDEX orders_pod_idx ON orders (pod_id);

-- Pods the current user LEADS. Requires the QC role as well as the membership
-- row, so revoking QC takes the pod's orders away at once.
CREATE OR REPLACE FUNCTION app.current_pod_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(pm.pod_id), '{}'::text[])
  FROM public.pod_members pm
  WHERE pm.user_id = app.current_clerk_id()
    AND pm.member_role = 'POD_LEAD'
    AND app.has_role('QC')
$$;

CREATE OR REPLACE FUNCTION app.is_pod_lead_of(p_pod_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_pod_id IS NOT NULL AND p_pod_id = ANY (app.current_pod_ids())
$$;

GRANT EXECUTE ON FUNCTION app.current_pod_ids()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_pod_lead_of(text)  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'only an admin (SALES + OPS + FINANCE) may do this';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION app.require_admin() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_pod(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
BEGIN
  PERFORM app.require_admin();
  INSERT INTO public.pods (name) VALUES (btrim(p_name)) RETURNING id INTO v_id;
  PERFORM audit.log_event('POD_CREATED', 'pod', v_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('name', btrim(p_name)));
  RETURN v_id;
END
$$;

-- Put a person in a pod (or move them). POD_LEAD must hold QC; DESIGNER must
-- be a designer account.
CREATE OR REPLACE FUNCTION public.set_pod_member(p_pod_id text, p_user_id text, p_member_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from text;
BEGIN
  PERFORM app.require_admin();
  IF p_member_role NOT IN ('POD_LEAD', 'DESIGNER') THEN
    RAISE EXCEPTION 'member_role must be POD_LEAD or DESIGNER';
  END IF;
  PERFORM 1 FROM public.pods WHERE id = p_pod_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such pod'; END IF;

  IF p_member_role = 'POD_LEAD' AND NOT app.user_has_role(p_user_id, 'QC') THEN
    RAISE EXCEPTION 'a pod lead must hold the QC role';
  END IF;
  IF p_member_role = 'DESIGNER'
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND role = 'DESIGNER' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'only a designer account can be a pod designer';
  END IF;

  SELECT pod_id INTO v_from FROM public.pod_members WHERE user_id = p_user_id;
  DELETE FROM public.pod_members WHERE user_id = p_user_id;
  INSERT INTO public.pod_members (pod_id, user_id, member_role, added_by)
  VALUES (p_pod_id, p_user_id, p_member_role, app.current_clerk_id());

  PERFORM audit.log_event('POD_MEMBER_SET', 'pod', p_pod_id, app.current_clerk_id(),
                          app.acting_role('OPS'),
                          jsonb_build_object('user_id', p_user_id, 'member_role', p_member_role,
                                             'moved_from', v_from));
  RETURN jsonb_build_object('pod_id', p_pod_id, 'user_id', p_user_id, 'member_role', p_member_role);
END
$$;

CREATE OR REPLACE FUNCTION public.remove_pod_member(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pod text;
BEGIN
  PERFORM app.require_admin();
  DELETE FROM public.pod_members WHERE user_id = p_user_id RETURNING pod_id INTO v_pod;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'changed', false);
  END IF;
  PERFORM audit.log_event('POD_MEMBER_REMOVED', 'pod', v_pod, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('user_id', p_user_id));
  RETURN jsonb_build_object('user_id', p_user_id, 'changed', true);
END
$$;

-- Admin hands an order to a pod and its lead (A1 "Assign pod lead").
CREATE OR REPLACE FUNCTION public.assign_order_pod(p_order_id text, p_pod_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pod  text;
  v_from text;
BEGIN
  PERFORM app.require_admin();

  SELECT pod_id INTO v_pod FROM public.pod_members
  WHERE user_id = p_pod_lead_id AND member_role = 'POD_LEAD';
  IF NOT FOUND OR NOT app.user_has_role(p_pod_lead_id, 'QC') THEN
    RAISE EXCEPTION 'not a pod lead';
  END IF;

  SELECT pod_lead_id INTO v_from FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  UPDATE public.orders SET pod_id = v_pod, pod_lead_id = p_pod_lead_id WHERE id = p_order_id;

  -- The pod lead's id stays OUT of the payload: the order timeline (0016) is
  -- client-visible, and who runs a pod is staff business.
  PERFORM audit.log_event('ORDER_POD_ASSIGNED', 'order', p_order_id, app.current_clerk_id(),
                          app.acting_role('OPS'), jsonb_build_object('pod_id', v_pod));
  RETURN jsonb_build_object('order_id', p_order_id, 'pod_id', v_pod);
END
$$;

REVOKE ALL ON FUNCTION public.create_pod(text)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_pod_member(text, text, text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_pod_member(text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_order_pod(text, text)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pod(text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_pod_member(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_pod_member(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_order_pod(text, text)     TO authenticated, service_role;

-- ------------------------------------------------- staff names + refs --

-- "Team · {first name}" in client threads (DECISIONS §11). First name only:
-- it is what the client sees, and nothing more about staff belongs there.
CREATE TABLE staff_profiles (
  user_id    text        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  first_name text        NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A staff member sets their own; OPS can set anyone's.
CREATE OR REPLACE FUNCTION public.set_staff_first_name(p_user_id text, p_first_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text := app.current_clerk_id();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_user_id IS DISTINCT FROM v_actor AND NOT app.has_role('OPS') THEN
    RAISE EXCEPTION 'only OPS may set another person''s name';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.role NOT IN ('CLIENT', 'DESIGNER')
  ) THEN
    RAISE EXCEPTION 'only staff accounts have a staff name';
  END IF;

  INSERT INTO public.staff_profiles (user_id, first_name)
  VALUES (p_user_id, btrim(p_first_name))
  ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = now();
END
$$;

REVOKE ALL ON FUNCTION public.set_staff_first_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_first_name(text, text) TO authenticated, service_role;

-- Designer reference (DSG-0142 in the screens). Pod leads and certificates
-- name designers by this, never by legal name (Add. A2).
CREATE SEQUENCE designer_ref_seq START 1;

ALTER TABLE designer_profiles ADD COLUMN designer_ref text UNIQUE;

CREATE OR REPLACE FUNCTION app.set_designer_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.designer_ref IS NULL THEN
    NEW.designer_ref := 'DSG-' || lpad(nextval('public.designer_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER designer_profiles_ref
  BEFORE INSERT ON designer_profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_designer_ref();

UPDATE designer_profiles
  SET designer_ref = 'DSG-' || lpad(nextval('designer_ref_seq')::text, 4, '0')
  WHERE designer_ref IS NULL;

ALTER TABLE designer_profiles ALTER COLUMN designer_ref SET NOT NULL;

-- ------------------------------- teach existing functions extra roles --

DO $$
DECLARE
  -- function name -> number of role checks it must contain
  v_expected jsonb := jsonb_build_object(
    'public.quote_order',       1,
    'public.release_escrow',    1,
    'public.refund_escrow',     1,
    'public.resolve_dispute',   2,
    'public.record_qc_decision',1,
    'app.require_ops',          1
  );
  v_name   text;
  v_def    text;
  v_new    text;
  v_found  integer;
  v_fn     record;
BEGIN
  FOR v_name IN SELECT jsonb_object_keys(v_expected) LOOP
    v_found := 0;
    FOR v_fn IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname || '.' || p.proname = v_name
    LOOP
      v_def := pg_get_functiondef(v_fn.oid);
      v_found := v_found + (SELECT count(*) FROM regexp_matches(
        v_def, 'IF v_role IS DISTINCT FROM ''(SALES|OPS|FINANCE|QC)'' THEN', 'g'));
      v_new := regexp_replace(
        v_def,
        'IF v_role IS DISTINCT FROM ''(SALES|OPS|FINANCE|QC)'' THEN',
        'v_role := app.acting_role(''\1''); IF v_role IS DISTINCT FROM ''\1'' THEN',
        'g');
      EXECUTE v_new;
    END LOOP;
    IF v_found <> (v_expected ->> v_name)::integer THEN
      RAISE EXCEPTION 'role rewrite: expected % check(s) in %, found %',
        v_expected ->> v_name, v_name, v_found;
    END IF;
  END LOOP;

  -- Triage admits OPS or SALES; written as a NOT IN, so rewritten separately.
  SELECT pg_get_functiondef('app.require_triage_staff()'::regprocedure) INTO v_def;
  IF position('IF v_role IS NULL OR v_role NOT IN (''OPS'', ''SALES'') THEN' IN v_def) = 0 THEN
    RAISE EXCEPTION 'role rewrite: app.require_triage_staff no longer has the expected check';
  END IF;
  EXECUTE replace(v_def,
    'IF v_role IS NULL OR v_role NOT IN (''OPS'', ''SALES'') THEN',
    'IF NOT (app.has_role(''OPS'') OR app.has_role(''SALES'')) THEN');
END
$$;
