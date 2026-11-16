-- 0049_client_verification_rls.sql
-- 0068's client verification (business details and proofs of registration):
-- no direct access for anyone. Clients read their own state and add or
-- remove their own proofs, and admins list, open and decide, only through
-- the 0068 functions; every open of a proof is audited.

ALTER TABLE client_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_verifications FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON client_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON client_verifications TO service_role;

ALTER TABLE client_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_verification_documents FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON client_verification_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON client_verification_documents TO service_role;
