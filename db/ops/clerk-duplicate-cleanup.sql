-- One-off: remove the empty CLIENT account that /welcome created under an OLD
-- (development) id in the minutes between the account move and the redeploy.
-- Removes only accounts that: have an old id from the move, were created after
-- the move, are CLIENT, and have nothing pointing at them (foreign keys would
-- refuse otherwise). Records the removal in the audit log. All or nothing.
DO $cleanup$
DECLARE
  dry_run constant boolean := true;   -- <-- set to false to apply
  m_at    timestamptz;
  victims text[];
  n       int;
BEGIN
  SELECT created_at INTO m_at FROM audit.audit_log
   WHERE action = 'CLERK_INSTANCE_MIGRATION' ORDER BY seq DESC LIMIT 1;
  IF m_at IS NULL THEN RAISE EXCEPTION 'No account move found in the audit log. Nothing was changed.'; END IF;

  SELECT array_agg(u.id) INTO victims
    FROM public.users u
    JOIN audit.audit_log a ON a.action = 'CLERK_INSTANCE_MIGRATION'
    JOIN LATERAL jsonb_array_elements(a.payload->'map') e ON e->>'old_id' = u.id
   WHERE u.created_at > m_at AND u.role = 'CLIENT';
  n := coalesce(array_length(victims, 1), 0);
  IF n = 0 THEN RAISE EXCEPTION 'No duplicate account found (already removed?). Nothing was changed.'; END IF;
  IF n > 1 THEN RAISE EXCEPTION 'Found % duplicate accounts, expected 1. Nothing was changed; send this message to Claude.', n; END IF;

  DELETE FROM public.users WHERE id = ANY (victims);
  PERFORM audit.log_event('DUPLICATE_ACCOUNT_REMOVED', 'user', victims[1], NULL, NULL,
    jsonb_build_object('reason', 'empty CLIENT row created by /welcome under a development Clerk id after the account move'));

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK, nothing was changed. Would remove % empty duplicate account.', n;
  END IF;
  RAISE NOTICE 'DONE: removed % empty duplicate account.', n;
END
$cleanup$;
