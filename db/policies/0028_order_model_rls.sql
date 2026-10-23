-- 0028_order_model_rls.sql
-- Read access to the reference and settings tables of 0035. All writes go
-- through the admin functions there; no table here has a write policy.

ALTER TABLE job_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_categories  FORCE  ROW LEVEL SECURITY;
ALTER TABLE price_bands     ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_bands     FORCE  ROW LEVEL SECURITY;
ALTER TABLE feature_flags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags   FORCE  ROW LEVEL SECURITY;
ALTER TABLE app_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings    FORCE  ROW LEVEL SECURITY;
ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_accounts FORCE  ROW LEVEL SECURITY;

-- Supabase gives anon/authenticated ALL on every new table by default
-- (ALTER DEFAULT PRIVILEGES). Start from nothing, then grant exactly what the
-- policies below are written for — otherwise the column restrictions would
-- hold locally and not in production.
REVOKE ALL ON job_categories, price_bands, feature_flags, app_settings, client_accounts FROM anon, authenticated;
GRANT SELECT ON job_categories, price_bands, feature_flags, app_settings TO authenticated;
GRANT SELECT (user_id, client_code, first_design_order_id, created_at) ON client_accounts TO authenticated;
GRANT ALL ON job_categories, price_bands, feature_flags, app_settings, client_accounts TO service_role;

-- Category rates are designer pay: staff only. A designer learns their own
-- category and pay from visible_orders(); a client never sees INR rates.
CREATE POLICY job_categories_staff_read ON job_categories
  FOR SELECT TO authenticated
  USING (app.is_staff());

-- Prices are public (the website shows them).
CREATE POLICY price_bands_read ON price_bands
  FOR SELECT TO authenticated
  USING (true);

-- Every signed-in user may read flags: screens hide what is off.
CREATE POLICY feature_flags_read ON feature_flags
  FOR SELECT TO authenticated
  USING (true);

-- Settings hold the FX rate and margins: staff only.
CREATE POLICY app_settings_staff_read ON app_settings
  FOR SELECT TO authenticated
  USING (app.is_staff());

-- A client's code: the client, admin, sales/ops/finance, and the pod lead of
-- a pod holding one of their orders ("client identity: reference only",
-- Spec §1). Never a designer.
CREATE POLICY client_accounts_read ON client_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = app.current_clerk_id()
    OR app.current_roles() && ARRAY['SALES', 'OPS', 'FINANCE']::public.role[]
    OR app.client_in_my_pods(user_id)
  );
