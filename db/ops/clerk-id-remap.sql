-- =============================================================================
-- One-off: move every account from the Clerk DEVELOPMENT instance's user ids to
-- the PRODUCTION instance's user ids (docs/CLERK-PRODUCTION.md).
--
-- WHY. users.id is the Clerk user id (the JWT "sub"; app.current_clerk_id()).
-- A Clerk production instance is a separate user store: the same person gets
-- a new id there. Without this, every designer, pod lead and admin would sign
-- in to an empty account, and their profile, bank and identity documents,
-- roles, pods, jobs and chats would belong to an id nobody can sign in as.
--
-- WHAT IT DOES, in ONE statement (all or nothing):
--   1. Takes the old id -> new id list (the MAP block below; made by
--      scripts/clerk-copy-users.mjs). Entries whose old id has no row in
--      users are dropped and listed (e.g. test accounts that never onboarded).
--   2. Refuses, changing nothing, if a new id already has a users row, if an
--      id appears twice, or if an id is not a Clerk user id.
--   3. Rewrites every text column in the public and app schemas whose value is
--      an old id (63 foreign keys to users, plus the plain text columns such as
--      messages.sender_id and orders.designer_id), with triggers and foreign-
--      key checks paused for this statement only, so no state-machine,
--      email, repricing or notification trigger fires on what is a pure rename.
--   4. Leaves audit.audit_log exactly as it is: each entry's hash covers its
--      actor id, so rewriting it would break audit.verify_chain(). History
--      keeps the old ids; the mapping itself is appended as one audit entry
--      (CLERK_INSTANCE_MIGRATION), so old ids stay traceable.
--   5. Checks afterwards: no old id left in any text column, no row pointing
--      at a missing user, audit chain still valid. Any failure undoes all.
--
-- HOW TO RUN (Supabase -> SQL Editor; PRODUCTION only in the switch window):
--   a. Paste the generated file (.clerk-migration/clerk-id-remap.ready.sql)
--      as is: dry_run is true, so it ends with an error that starts
--      "DRY RUN OK" and lists what it would change. Nothing is changed.
--   b. Change dry_run to false and run again. It ends with "REMAP DONE".
-- Never run it twice with the same list: the second run refuses (the new ids
-- exist by then), which is the intended guard.
-- =============================================================================
DO $remap$
DECLARE
  dry_run constant boolean := true;   -- <-- set to false to apply

  r          record;
  n          bigint;
  total      bigint := 0;
  changed    jsonb  := '{}'::jsonb;
  skipped    jsonb;
  bad        text;
  chain      jsonb;
BEGIN
  CREATE TEMP TABLE clerk_id_map (old_id text NOT NULL, new_id text NOT NULL, email text) ON COMMIT DROP;

  INSERT INTO clerk_id_map (old_id, new_id, email) VALUES
  -- MAP:BEGIN
    ('user_REPLACE_OLD', 'user_REPLACE_NEW', 'replace@example.com')
  -- MAP:END
  ;

  -- ---- 1. validate the list ------------------------------------------------
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT old_id AS x FROM clerk_id_map GROUP BY old_id HAVING count(*) > 1
    UNION ALL SELECT new_id FROM clerk_id_map GROUP BY new_id HAVING count(*) > 1) d;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'An id appears twice in the list: %. Nothing was changed.', bad; END IF;

  SELECT string_agg(old_id || ' -> ' || new_id, ', ') INTO bad FROM clerk_id_map
   WHERE old_id !~ '^user_[A-Za-z0-9]+$' OR new_id !~ '^user_[A-Za-z0-9]+$' OR old_id = new_id;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Not a pair of Clerk user ids: %. Nothing was changed.', bad; END IF;

  SELECT string_agg(m.new_id || coalesce(' (' || m.email || ')', ''), ', ') INTO bad
    FROM clerk_id_map m JOIN public.users u ON u.id = m.new_id;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'These production ids already have an account here: %. Was the remap already run, or did someone finish onboarding on production first? Nothing was changed.', bad;
  END IF;

  SELECT coalesce(jsonb_agg(coalesce(email, old_id) ORDER BY email), '[]'::jsonb) INTO skipped
    FROM clerk_id_map m WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.old_id);
  DELETE FROM clerk_id_map m WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.old_id);
  IF NOT EXISTS (SELECT 1 FROM clerk_id_map) THEN
    RAISE EXCEPTION 'None of the old ids has an account here. Wrong list, or wrong database? Nothing was changed.';
  END IF;

  -- ---- 2. rewrite, with triggers and FK checks paused for this transaction --
  PERFORM set_config('session_replication_role', 'replica', true);
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS col
      FROM information_schema.columns c
      JOIN information_schema.tables tb USING (table_schema, table_name)
     WHERE tb.table_type = 'BASE TABLE'
       AND c.table_schema IN ('public', 'app')
       AND c.data_type IN ('text', 'character varying')
       AND c.is_generated = 'NEVER'   -- generated columns recompute themselves
     ORDER BY 1, 2, 3
  LOOP
    EXECUTE format('UPDATE %I.%I t SET %I = m.new_id FROM pg_temp.clerk_id_map m WHERE t.%I = m.old_id',
                   r.s, r.t, r.col, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      changed := changed || jsonb_build_object(r.t || '.' || r.col, n);
      total := total + n;
    END IF;
  END LOOP;
  PERFORM set_config('session_replication_role', 'origin', true);

  -- ---- 3. check -------------------------------------------------------------
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS col
      FROM information_schema.columns c
      JOIN information_schema.tables tb USING (table_schema, table_name)
     WHERE tb.table_type = 'BASE TABLE' AND c.table_schema IN ('public', 'app')
       AND c.data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I t JOIN pg_temp.clerk_id_map m ON t.%I = m.old_id', r.s, r.t, r.col) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Old id still in %.%.% (% rows). Nothing was changed.', r.s, r.t, r.col, n; END IF;
  END LOOP;

  FOR r IN
    SELECT con.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f' AND con.confrelid = 'public.users'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.%I)',
                   r.tbl, r.col, r.col) INTO n;
    IF n > 0 THEN RAISE EXCEPTION '% rows of %.% point at no user. Nothing was changed.', n, r.tbl, r.col; END IF;
  END LOOP;

  PERFORM audit.log_event(
    'CLERK_INSTANCE_MIGRATION', 'users', NULL, NULL, NULL,
    jsonb_build_object(
      'map', (SELECT jsonb_agg(jsonb_build_object('old_id', old_id, 'new_id', new_id) ORDER BY old_id) FROM clerk_id_map),
      'rows_changed', changed,
      'skipped_not_in_database', skipped));

  chain := audit.verify_chain();
  IF NOT coalesce((chain ->> 'valid')::boolean, false) THEN
    RAISE EXCEPTION 'Audit chain check failed: %. Nothing was changed.', chain;
  END IF;

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK, nothing was changed. Would move % accounts (% rows). Skipped, not in this database: %. Rows per column: %',
      (SELECT count(*) FROM clerk_id_map), total, skipped, changed;
  END IF;

  RAISE NOTICE 'REMAP DONE: moved % accounts (% rows). Skipped: %. Rows per column: %',
    (SELECT count(*) FROM clerk_id_map), total, skipped, changed;
END
$remap$;
