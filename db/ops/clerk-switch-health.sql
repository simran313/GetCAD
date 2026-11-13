-- Read-only health check after the Clerk production switch. Changes nothing.
WITH m AS (
  SELECT created_at AS at, payload FROM audit.audit_log
   WHERE action = 'CLERK_INSTANCE_MIGRATION' ORDER BY seq DESC LIMIT 1
), ids AS (
  SELECT e->>'old_id' AS old_id, e->>'new_id' AS new_id FROM m, jsonb_array_elements(m.payload->'map') e
)
SELECT * FROM (VALUES
 (1, 'Audit log chain intact',
     'true', (SELECT audit.verify_chain()->>'valid')),
 (2, 'Account move recorded once in audit log',
     '1', (SELECT count(*)::text FROM audit.audit_log WHERE action = 'CLERK_INSTANCE_MIGRATION')),
 (3, 'Moved accounts present under new ids',
     '26', (SELECT count(*)::text FROM public.users u JOIN ids ON ids.new_id = u.id)),
 (4, 'Old ids left in users table',
     '0', (SELECT count(*)::text FROM public.users u JOIN ids ON ids.old_id = u.id)),
 (5, 'App triggers switched off (must be none)',
     '0', (SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname IN ('public','app') AND t.tgenabled <> 'O')),
 (6, 'Emails queued by the move itself (±2 min)',
     '0', (SELECT count(*)::text FROM public.email_outbox, m WHERE created_at BETWEEN m.at - interval '2 min' AND m.at + interval '2 min')),
 (7, 'Notifications created by the move itself (±2 min)',
     '0', (SELECT count(*)::text FROM public.notifications, m WHERE created_at BETWEEN m.at - interval '2 min' AND m.at + interval '2 min')),
 (8, 'NEW accounts since the switch (team member got an empty account?)',
     '0', (SELECT count(*)::text FROM public.users, m WHERE users.created_at > m.at)),
 (9, 'Designers with bank/payout details',
     '9', (SELECT count(*)::text FROM public.payout_accounts)),
 (10,'Designer identity documents',
     '33', (SELECT count(*)::text FROM public.designer_documents))
) AS t(n, "check", expected, actual)
ORDER BY n;
