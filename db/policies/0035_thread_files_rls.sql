-- 0035_thread_files_rls.sql
-- thread_files (0045): no direct reads or writes. Files are posted through
-- post_thread_file() and read through thread_attachments() and
-- thread_file_for_download(), which apply the thread's own read rule.

ALTER TABLE thread_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_files FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON thread_files FROM PUBLIC, anon, authenticated;
GRANT ALL ON thread_files TO service_role;
