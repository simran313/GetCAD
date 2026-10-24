-- 0036_designer_rate_card.sql
-- Phase 5c: a designer reads the category table — their own rate card
-- (docs/design D6; DECISIONS §3: category minutes × ₹500 / hour). Staff
-- already could (0028). Clients still cannot: INR pay is not theirs to see.

CREATE POLICY job_categories_designer_read ON job_categories
  FOR SELECT TO authenticated
  USING (app.has_role('DESIGNER'));
