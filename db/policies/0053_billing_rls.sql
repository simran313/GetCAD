-- 0053_billing_rls.sql
-- 0072's billing settings, invoices and offline payment reports: no direct
-- access for anyone. Clients read their own invoices and report a payment,
-- finance reads and issues them and edits the settings, only through the
-- 0072 functions.

ALTER TABLE billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_settings FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON billing_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON billing_settings TO service_role;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON invoices FROM PUBLIC, anon, authenticated;
GRANT ALL ON invoices TO service_role;

ALTER TABLE offline_payment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_payment_reports FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON offline_payment_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON offline_payment_reports TO service_role;
