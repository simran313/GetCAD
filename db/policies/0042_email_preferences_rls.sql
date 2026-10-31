-- 0042_email_preferences_rls.sql
-- 0054's email preferences: no direct access. Read through
-- my_email_preferences, written through set_email_preferences (own row only).

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_preferences FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON email_preferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON email_preferences TO service_role;
