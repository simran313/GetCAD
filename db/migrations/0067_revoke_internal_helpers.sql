-- =============================================================================
-- 0067: close internal helper functions to direct callers (security register
-- SEC-06 and SEC-11, docs/security/09-security-audit.md).
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC, which includes
-- the `anon` (signed-out) and `authenticated` (signed-in) roles. Several
-- internal `app` helpers were never revoked, including two that WRITE:
--   app.enqueue_email  queues an email to any address
--   app.notify         creates an in-app notification for any user
-- and two that report on ANY user:
--   app.payout_account_status, app.designer_is_assignable.
-- They are meant to be called only from inside other SECURITY DEFINER
-- functions and triggers, which run as the function owner and keep their
-- access after this. Nothing in the application calls them directly
-- (checked: no RLS policy, no invoker function and no app code uses them),
-- and the `app` schema is not part of the public Data API. This removes the
-- door anyway, so it stays shut if the API settings ever change.
--
-- app.client_in_my_pods is used inside an RLS policy, so signed-in users keep
-- it (granted explicitly below); only `anon` and PUBLIC lose it.
--
-- The client brief functions refuse signed-out callers themselves
-- ("not authenticated"); revoking `anon` is defence in depth. Signed-in
-- clients keep them through their explicit grants (re-stated below).
--
-- tests/db/function_grants.test.ts fails if a writing function becomes
-- callable by `anon` again outside the five deliberate website entry points.
-- =============================================================================

-- Internal helpers: owner (and the functions/triggers that run as the owner) only.
REVOKE EXECUTE ON FUNCTION app.enqueue_email(text, text, jsonb, text)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.notify(text, text, text, text, text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.payout_account_status(text)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.designer_is_assignable(text)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.current_agreement(text)                       FROM PUBLIC, anon, authenticated;

-- Used by an RLS policy: signed-in users keep it, signed-out callers do not.
REVOKE EXECUTE ON FUNCTION app.client_in_my_pods(text)                       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.client_in_my_pods(text)                       TO authenticated, service_role;

-- Client brief functions: signed-in only (they already refuse anyone else).
REVOKE EXECUTE ON FUNCTION public.add_reference_image(text, text, text, integer)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_reference_image(text)                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_order_accents(text, stone_shape[], integer[], integer[], setting_type[])    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_primary_reference(text)                                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_reference_pins(text, integer[], integer[], text[])                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_reference_image(text, text, text, integer)                                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_reference_image(text)                                                   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_order_accents(text, stone_shape[], integer[], integer[], setting_type[])    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_primary_reference(text)                                                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_reference_pins(text, integer[], integer[], text[])                         TO authenticated;
