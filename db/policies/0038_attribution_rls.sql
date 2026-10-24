-- 0038_attribution_rls.sql
-- marketing_attribution and marketing_events (0049): no direct reads or
-- writes. Written through save_attribution(), record_marketing_event() and
-- triggers; read through attribution_report(), admin only.

ALTER TABLE marketing_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attribution FORCE  ROW LEVEL SECURITY;
ALTER TABLE marketing_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_events      FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON marketing_attribution, marketing_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON marketing_attribution, marketing_events TO service_role;
