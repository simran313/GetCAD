-- 0048_money_visibility_rls.sql — the read side of migration 0065.
--
-- 1. The money columns of orders leave the SELECT grant. A row policy cannot
--    hide a column on a row you may see, and a pod lead may see every row of
--    their pod (0027). visible_orders() and pod_jobs() now hand out the price
--    and the pay by who is asking; nobody reads them from the table.
REVOKE SELECT (price_total, designer_payout, qc_payout, platform_commission,
               designer_payout_paise, qc_payout_paise)
  ON orders FROM authenticated;

-- 2. The client's payments: the order's client and those who see order money,
--    no longer anyone who can see the order (a pod lead saw every payment).
DROP POLICY escrow_ledger_read ON escrow_ledger;
CREATE POLICY escrow_ledger_read ON escrow_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = escrow_ledger.order_id)
    AND app.sees_money_of(escrow_ledger.order_id)
  );

-- 3. A designer no longer reads the category rate card (0036): rates are the
--    admins' and the pod lead's to see, not the designer's.
DROP POLICY job_categories_designer_read ON job_categories;

-- 4. designer_rates: no reads or writes from the app; functions only.
ALTER TABLE designer_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_rates FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON designer_rates FROM anon, authenticated;
