-- 0050_outreach_rls.sql
-- 0069's outreach tables (contacts, senders, imports, the record of every
-- touch): no direct access for anyone. Admins work every contact and SALES
-- reps only their own, through the 0069 functions.

ALTER TABLE outreach_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_senders FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_senders FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_senders TO service_role;

ALTER TABLE outreach_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_imports FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_imports FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_imports TO service_role;

ALTER TABLE outreach_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_contacts FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_contacts FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_contacts TO service_role;

ALTER TABLE outreach_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_activities FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_activities FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_activities TO service_role;
