-- 0046_designer_documents_rls.sql
-- 0061's designer documents (PAN card, Aadhaar, bank proof): no direct
-- access for anyone. Admins list, open and remove them through the 0061
-- functions; every open is audited.

ALTER TABLE designer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_documents FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON designer_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON designer_documents TO service_role;
