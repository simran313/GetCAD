-- 0052_outreach_areas_rls.sql
-- 0071's research areas: no direct access for anyone. Everyone in outreach
-- reads them, and works them, only through the 0071 functions.

ALTER TABLE outreach_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_areas FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON outreach_areas FROM PUBLIC, anon, authenticated;
GRANT ALL ON outreach_areas TO service_role;
