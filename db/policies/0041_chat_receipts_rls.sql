-- 0041_chat_receipts_rls.sql
-- 0053's reads: no direct access. Written through mark_thread_read, read
-- through thread_read_state (one time per thread, never who).

ALTER TABLE thread_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_reads FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON thread_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON thread_reads TO service_role;
