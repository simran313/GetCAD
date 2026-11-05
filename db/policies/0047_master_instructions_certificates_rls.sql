-- 0047_master_instructions_certificates_rls.sql
-- 0062's master instructions and diamond certificates: no direct access for
-- anyone. They are written and read only through the 0062 functions, which
-- check who the caller is to the client or the order.

ALTER TABLE client_master_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_master_instructions FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON client_master_instructions FROM PUBLIC, anon, authenticated;
GRANT ALL ON client_master_instructions TO service_role;

ALTER TABLE order_stone_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_stone_certificates FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON order_stone_certificates FROM PUBLIC, anon, authenticated;
GRANT ALL ON order_stone_certificates TO service_role;
