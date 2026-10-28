-- 0052_chat_live.sql
-- Live chat (Phase 13). When a message or a file lands in a thread, the
-- database sends a signal on that thread's private Realtime channel,
-- "thread:<thread id>". The signal says only "something changed here": no
-- text, no sender, no order data. A chat that is open on that thread reads
-- itself again at once, through the same functions and policies as always.
--
-- Who may hear a thread's signal: exactly who may read the thread
-- (app.can_read_thread, 0036). A designer never hears the client's thread
-- (DECISIONS §11). Nobody may send on these channels from the browser: there
-- is no insert policy, only the database sends.
--
-- Supabase provides realtime.send and realtime.messages. A database without
-- them (the test database, CI) gets the same functions and triggers; the
-- trigger finds no realtime.send and does nothing, and the policy is added
-- when the table exists. A failed signal never stops a message: the chat still
-- checks for news on its own every few seconds.

CREATE OR REPLACE FUNCTION app.can_receive_thread_signal(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_topic IS NOT NULL
     AND p_topic LIKE 'thread:%'
     AND app.can_read_thread(substr(p_topic, length('thread:') + 1))
$$;

REVOKE ALL ON FUNCTION app.can_receive_thread_signal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_receive_thread_signal(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.signal_thread_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.thread_id IS NULL OR to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING '{}'::jsonb, 'changed', 'thread:' || NEW.thread_id, true;
  EXCEPTION WHEN OTHERS THEN
    -- The message is saved either way; the open chat's own check finds it.
    RAISE WARNING 'thread signal not sent: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.signal_thread_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS messages_signal_thread ON public.messages;
CREATE TRIGGER messages_signal_thread
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.signal_thread_change();

DROP TRIGGER IF EXISTS thread_files_signal_thread ON public.thread_files;
CREATE TRIGGER thread_files_signal_thread
  AFTER INSERT ON public.thread_files
  FOR EACH ROW EXECUTE FUNCTION app.signal_thread_change();

-- Receiving: a signed-in person may join a thread's private channel only if
-- they may read the thread. Broadcast only; no presence, no sending.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS thread_signals_receive ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY thread_signals_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (realtime.messages.extension = 'broadcast' AND app.can_receive_thread_signal(realtime.topic()))
    $policy$;
  END IF;
END
$$;
