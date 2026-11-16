-- 0051_outreach_templates_rls.sql
-- 0070's outreach templates: no direct access for anyone. Admins and sales
-- read them, and admins change them, only through the 0070 functions.

ALTER TABLE outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_templates FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_templates TO service_role;
