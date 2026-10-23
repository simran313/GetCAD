-- 0038_identity_lookup.sql
-- Let an admin see who an account belongs to, on the record.
--
-- 0032 kept the Access screen to opaque ids on purpose. In practice an id is
-- unrecognisable, and DECISIONS §2 gives the admin (Sales + Ops + Finance)
-- everything, client identity included. The owner asked for email addresses
-- on that screen.
--
-- The email lives in Clerk, not here, so the database cannot hand it out.
-- What it can do is decide WHO may look and write down that they did: the
-- page calls this first, and fetches from Clerk only if it succeeds. Every
-- lookup is an identity-piercing read in the audit log (is_identity_read,
-- which 0006 reserved for exactly this), naming the accounts that were shown.
--
-- Admin only — not OPS alone. A plain OPS account still administers roles by
-- id, as before.

CREATE OR REPLACE FUNCTION public.record_identity_lookup(p_user_ids text[], p_purpose text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids text[];
BEGIN
  PERFORM app.require_admin();

  IF p_purpose IS NULL OR char_length(btrim(p_purpose)) = 0 THEN
    RAISE EXCEPTION 'an identity lookup needs a purpose';
  END IF;

  -- Only ids that are real accounts are recorded (and therefore looked up).
  SELECT coalesce(array_agg(DISTINCT u.id ORDER BY u.id), '{}')
    INTO v_ids
  FROM public.users u
  WHERE u.id = ANY (coalesce(p_user_ids, '{}'));

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM audit.log_event(
    'IDENTITY_VIEWED', 'user', NULL, app.current_clerk_id(), app.acting_role('OPS'),
    jsonb_build_object('purpose', btrim(p_purpose), 'user_ids', to_jsonb(v_ids), 'count', array_length(v_ids, 1)),
    true
  );
  RETURN array_length(v_ids, 1);
END
$$;

REVOKE ALL ON FUNCTION public.record_identity_lookup(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_identity_lookup(text[], text) TO authenticated, service_role;
