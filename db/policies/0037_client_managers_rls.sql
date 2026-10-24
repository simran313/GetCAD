-- 0037_client_managers_rls.sql
-- client_managers (0048): no direct reads or writes. Set through
-- set_account_manager() and read through admin_clients(), both admin only.

ALTER TABLE client_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_managers FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON client_managers FROM PUBLIC, anon, authenticated;
GRANT ALL ON client_managers TO service_role;
