-- 0045_thread_attachments.sql
-- Phase 4b: files in the order's conversations, and a cheap "has anything
-- changed?" stamp so the order page refreshes within seconds of a change.
--
-- ATTACHMENTS. A file is posted with a message, in one thread, by someone who
-- may post there (post_thread_message's rules: never a designer in the client
-- thread, never in the frozen legacy thread). It is readable exactly where
-- the thread is readable (app.can_read_thread). In the team <-> designer
-- thread only formats the upload gate can clean are accepted (PNG, JPEG,
-- STEP, STL, 3DM), so nothing with a client's name in its metadata reaches a
-- designer that way; the server cleans them before they are stored. Files
-- are named by the server: the original name never leaves the uploader.
--
-- STAMP. order_activity_stamp() is the newest audit entry on the order that
-- the caller could see the effect of: every status change, tick, upload and
-- quote, and messages only in threads the caller may read.

CREATE TABLE thread_files (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id    text        NOT NULL REFERENCES message_threads (id) ON DELETE RESTRICT,
  message_id   text        NOT NULL REFERENCES messages (id) ON DELETE RESTRICT,
  order_id     text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  object_key   text        NOT NULL UNIQUE,
  content_type text        NOT NULL,
  size_bytes   integer     NOT NULL CHECK (size_bytes > 0),
  file_name    text        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 120),
  added_by     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX thread_files_order_idx ON thread_files (order_id, created_at);

-- Reads go through thread_attachments() / thread_file_for_download() only.
REVOKE ALL ON thread_files FROM PUBLIC, anon, authenticated;

-- What the designer thread accepts: formats the upload gate cleans.
CREATE OR REPLACE FUNCTION app.cleanable_type(p_content_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_content_type IN ('image/png', 'image/jpeg', 'model/step', 'model/stl', 'model/x-3dm')
$$;

CREATE OR REPLACE FUNCTION public.post_thread_file(
  p_thread_id    text,
  p_object_key   text,
  p_content_type text,
  p_size_bytes   integer,
  p_extension    text,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_thread   public.message_threads%ROWTYPE;
  v_ext      text := lower(btrim(coalesce(p_extension, '')));
  v_n        integer;
  v_name     text;
  v_msg      jsonb;
  v_id       text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_thread FROM public.message_threads WHERE id = p_thread_id;
  IF NOT FOUND OR NOT app.can_read_thread(p_thread_id) THEN
    RAISE EXCEPTION 'thread not found';
  END IF;
  IF v_ext !~ '^[a-z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'unsupported file extension';
  END IF;
  IF v_thread.kind = 'internal' AND NOT app.cleanable_type(p_content_type) THEN
    RAISE EXCEPTION 'the designer thread takes PNG, JPEG, STEP, STL or 3DM files only';
  END IF;

  -- The message carries the post rules (designers never in the client
  -- thread, nobody in legacy) and the notification.
  v_msg := public.post_thread_message(
    p_thread_id,
    coalesce(nullif(btrim(p_note), ''), 'Sent a file.')
  );

  -- Numbered per thread: a count across both would tell the designer how
  -- many files the client sent the team.
  SELECT count(*)::integer + 1 INTO v_n FROM public.thread_files WHERE thread_id = p_thread_id;
  v_name := 'file_' || v_n::text || '.' || v_ext;

  INSERT INTO public.thread_files
    (thread_id, message_id, order_id, object_key, content_type, size_bytes, file_name, added_by)
  VALUES
    (p_thread_id, v_msg ->> 'message_id', v_thread.order_id, p_object_key, p_content_type,
     p_size_bytes, v_name, v_clerk_id)
  RETURNING id INTO v_id;

  PERFORM audit.log_event('THREAD_FILE_ADDED', 'order', v_thread.order_id, v_clerk_id, app.current_user_role(),
                          jsonb_build_object('thread_id', p_thread_id, 'thread_kind', v_thread.kind,
                                             'file_id', v_id, 'content_type', p_content_type));

  RETURN jsonb_build_object('file_id', v_id, 'file_name', v_name, 'message_id', v_msg ->> 'message_id');
END
$$;

-- The files in the threads the caller may read, to show under their messages.
CREATE OR REPLACE FUNCTION public.thread_attachments(p_order_id text)
RETURNS TABLE (
  id           text,
  message_id   text,
  thread_id    text,
  file_name    text,
  content_type text,
  size_bytes   integer,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id, f.message_id, f.thread_id, f.file_name, f.content_type, f.size_bytes, f.created_at
  FROM public.thread_files f
  WHERE f.order_id = p_order_id
    AND app.can_read_thread(f.thread_id)
  ORDER BY f.created_at, f.id
$$;

-- For the download route: the storage key, only where the thread is readable.
CREATE OR REPLACE FUNCTION public.thread_file_for_download(p_file_id text)
RETURNS TABLE (object_key text, content_type text, file_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.object_key, f.content_type, f.file_name
  FROM public.thread_files f
  WHERE f.id = p_file_id
    AND app.current_clerk_id() IS NOT NULL
    AND app.can_read_thread(f.thread_id)
$$;

-- ---------------------------------------------------------------- stamp --

CREATE OR REPLACE FUNCTION public.order_activity_stamp(p_order_id text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq bigint;
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
  RETURN v_seq;
END
$$;

REVOKE ALL ON FUNCTION app.cleanable_type(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_thread_file(text, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.thread_attachments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.thread_file_for_download(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_activity_stamp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cleanable_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_thread_file(text, text, text, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thread_attachments(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thread_file_for_download(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_activity_stamp(text) TO authenticated, service_role;
