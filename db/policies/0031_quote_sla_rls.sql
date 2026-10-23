-- 0031_quote_sla_rls.sql
-- 0040 added confirmed_at to orders. It is not an identifier, so it joins the
-- column grant of 0029; confirmed_by (a staff user id) and payment_reference
-- (a bank or PayPal reference) stay out of it.

GRANT SELECT (confirmed_at) ON orders TO authenticated;
