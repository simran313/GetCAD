-- 0053_chat_receipts.sql
-- Chat like a messenger (Phase 14): a sent message is shown at once and its
-- status follows it, from the clock (on its way) to one tick (saved) to two
-- ticks (the other side has read it). Three pieces:
--
-- 1. A send is safe to repeat. The browser names each message it sends
--    (client_ref); send_chat_message saves a message once per name, so a
--    Retry after a lost answer returns the first message instead of posting
--    it twice.
-- 2. Reads are recorded per thread and per person (thread_reads), with the
--    party the reader belongs to in that thread (CLIENT, TEAM or DESIGNER),
--    as post_thread_message decides it.
-- 3. thread_read_state tells the viewer how far the OTHER side has read each
--    thread: one time per thread, never who read it (DECISIONS §11). A new
--    read sends the thread's live signal (0052) and moves the order's
--    activity stamp, so the sender's two ticks appear with or without
--    Realtime.

-- ---------------------------------------------------------- 1. sending --

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_client_ref_uidx
  ON public.messages (thread_id, sender_id, client_ref)
  WHERE client_ref IS NOT NULL;

-- The reference send_chat_message is posting under, if any.
CREATE OR REPLACE FUNCTION app.messages_take_client_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_ref IS NULL THEN
    NEW.client_ref := nullif(current_setting('app.client_ref', true), '');
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.messages_take_client_ref() FROM PUBLIC;

DROP TRIGGER IF EXISTS messages_take_client_ref ON public.messages;
CREATE TRIGGER messages_take_client_ref
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.messages_take_client_ref();

CREATE OR REPLACE FUNCTION public.send_chat_message(p_thread_id text, p_body text, p_client_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_found    public.messages%ROWTYPE;
  v_posted   jsonb;
  v_id       text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_client_ref IS NULL OR p_client_ref !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'message reference is missing or malformed';
  END IF;

  -- Two copies of the same send arriving together wait for each other here.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_thread_id || ':' || v_clerk_id || ':' || p_client_ref, 0));

  SELECT * INTO v_found FROM public.messages
  WHERE thread_id = p_thread_id AND sender_id = v_clerk_id AND client_ref = p_client_ref;
  IF FOUND THEN
    RETURN jsonb_build_object('message_id', v_found.id, 'created_at', v_found.created_at, 'repeat', true);
  END IF;

  -- Every rule of posting (who may, which thread, the alias) stays in one
  -- place. Messages are append-only, so the reference rides into the insert
  -- (messages_take_client_ref) for this transaction only.
  PERFORM set_config('app.client_ref', p_client_ref, true);
  v_posted := public.post_thread_message(p_thread_id, p_body);
  PERFORM set_config('app.client_ref', '', true);
  v_id := v_posted ->> 'message_id';

  RETURN jsonb_build_object(
    'message_id', v_id,
    'created_at', (SELECT created_at FROM public.messages WHERE id = v_id),
    'repeat', false
  );
END
$$;

REVOKE ALL ON FUNCTION public.send_chat_message(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_message(text, text, text) TO authenticated, service_role;

-- The thread as the viewer reads it, now with the viewer's own reference on
-- their own messages (so the browser can swap its copy for the saved one).
-- Same rows and rules as 0036.
DROP FUNCTION IF EXISTS public.order_messages(text);
CREATE FUNCTION public.order_messages(p_order_id text)
RETURNS TABLE (
  id           text,
  thread_id    text,
  thread_kind  text,
  sender_party text,
  sender_alias text,
  is_mine      boolean,
  body         text,
  created_at   timestamptz,
  client_ref   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id, m.thread_id, t.kind, m.sender_party, m.sender_alias,
         m.sender_id = app.current_clerk_id(), m.body, m.created_at,
         CASE WHEN m.sender_id = app.current_clerk_id() THEN m.client_ref END
  FROM public.messages m
  JOIN public.message_threads t ON t.id = m.thread_id
  WHERE m.order_id = p_order_id
    AND app.can_read_thread(m.thread_id)
  ORDER BY m.created_at, m.id
$$;

REVOKE ALL ON FUNCTION public.order_messages(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_messages(text) TO authenticated, service_role;

-- ------------------------------------------------------------ 2. reads --

-- The viewer's party in a thread: as posted (thread_participants), or as
-- post_thread_message would decide it for a first post.
CREATE OR REPLACE FUNCTION app.thread_party(p_thread_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT p.party FROM public.thread_participants p
      WHERE p.thread_id = p_thread_id AND p.user_id = app.current_clerk_id()),
    (SELECT CASE
              WHEN o.client_id = app.current_clerk_id() THEN 'CLIENT'
              WHEN o.designer_id = app.current_clerk_id() AND app.current_user_role() = 'DESIGNER' THEN 'DESIGNER'
              ELSE 'TEAM'
            END
       FROM public.message_threads t JOIN public.orders o ON o.id = t.order_id
      WHERE t.id = p_thread_id)
  )
$$;

REVOKE ALL ON FUNCTION app.thread_party(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.thread_party(text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.thread_reads (
  thread_id text        NOT NULL REFERENCES public.message_threads (id) ON DELETE RESTRICT,
  user_id   text        NOT NULL,
  party     text        NOT NULL CHECK (party IN ('CLIENT', 'TEAM', 'DESIGNER')),
  read_at   timestamptz NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

-- The viewer has seen the thread as it is now. Only when there is something
-- newer from someone else than their last read, so an open chat does not
-- write (or signal) on every refresh.
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_last     timestamptz;
  v_newest   timestamptz;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.can_read_thread(p_thread_id) THEN RAISE EXCEPTION 'thread not found'; END IF;

  SELECT read_at INTO v_last FROM public.thread_reads WHERE thread_id = p_thread_id AND user_id = v_clerk_id;
  SELECT max(created_at) INTO v_newest FROM public.messages
  WHERE thread_id = p_thread_id AND sender_id IS DISTINCT FROM v_clerk_id;
  IF v_newest IS NULL OR (v_last IS NOT NULL AND v_last >= v_newest) THEN
    RETURN v_last;
  END IF;

  INSERT INTO public.thread_reads (thread_id, user_id, party, read_at)
  VALUES (p_thread_id, v_clerk_id, app.thread_party(p_thread_id), now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET read_at = greatest(public.thread_reads.read_at, excluded.read_at);
  RETURN now();
END
$$;

REVOKE ALL ON FUNCTION public.mark_thread_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(text) TO authenticated, service_role;

-- How far the other side has read each thread the viewer may read on this
-- order: one time per thread. The client hears "the team"; the team hears
-- the client (or, in the designer thread, the designer); never a name.
CREATE OR REPLACE FUNCTION public.thread_read_state(p_order_id text)
RETURNS TABLE (thread_id text, others_read_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id,
         (SELECT max(r.read_at) FROM public.thread_reads r
           WHERE r.thread_id = t.id AND r.party <> app.thread_party(t.id))
  FROM public.message_threads t
  WHERE t.order_id = p_order_id
    AND app.current_clerk_id() IS NOT NULL
    AND app.can_read_thread(t.id)
$$;

REVOKE ALL ON FUNCTION public.thread_read_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.thread_read_state(text) TO authenticated, service_role;

-- A read reaches the sender: the thread's live signal (0052) ...
DROP TRIGGER IF EXISTS thread_reads_signal_thread ON public.thread_reads;
CREATE TRIGGER thread_reads_signal_thread
  AFTER INSERT OR UPDATE ON public.thread_reads
  FOR EACH ROW EXECUTE FUNCTION app.signal_thread_change();

-- ... and the order's activity stamp, which an open page checks when
-- Realtime is off. Same as 0045, plus the latest read by the other side of
-- any thread the viewer may read (a number that only grows, like the seq).
CREATE OR REPLACE FUNCTION public.order_activity_stamp(p_order_id text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq  bigint;
  v_read bigint;
BEGIN
  IF app.current_clerk_id() IS NULL OR app.order_relation(p_order_id) IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(max(a.seq), 0) INTO v_seq
  FROM audit.audit_log a
  WHERE a.entity_type = 'order'
    AND a.entity_id = p_order_id
    AND NOT a.is_identity_read
    AND (a.action NOT IN ('MESSAGE_POSTED', 'THREAD_FILE_ADDED')
         OR app.can_read_thread(a.payload ->> 'thread_id'));
  SELECT coalesce((extract(epoch FROM max(s.others_read_at)) * 1000)::bigint, 0) INTO v_read
  FROM public.thread_read_state(p_order_id) s;
  RETURN v_seq + v_read;
END
$$;
