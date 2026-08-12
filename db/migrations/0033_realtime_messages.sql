-- 0033_realtime_messages.sql
-- Live order conversation: stream new messages to participants in real time.
--
-- The order screen is now a conversation, and a conversation that only updates
-- on a manual refresh is not one. Supabase Realtime delivers INSERTs on the
-- messages table over a websocket; the browser uses each event purely as a
-- TRIGGER to re-fetch from the server, never rendering the socket payload
-- directly. So the SAME RLS that governs the page governs what a socket may
-- see — a non-participant's subscription receives nothing, because the row is
-- filtered by the identical order-scoped SELECT policy (0013) that guards the
-- page. Realtime here adds liveness, not a new way to read data.
--
-- Two requirements for postgres_changes to fire:
--   1. the table must belong to the `supabase_realtime` publication, and
--   2. it needs a replica identity rich enough to describe the change.

ALTER TABLE messages REPLICA IDENTITY FULL;

-- The publication exists on every Supabase project, but create it defensively
-- so this migration also runs against a bare Postgres used in tests.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
