-- 0033_revisions_rls.sql
-- revision_requests (0042): no direct reads or writes. The client writes
-- through request_revision(); everyone on the order reads through
-- order_revisions(), which leaves out who wrote the note.

ALTER TABLE revision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_requests FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON revision_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON revision_requests TO service_role;
