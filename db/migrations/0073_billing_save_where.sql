-- =============================================================================
-- 0073 — Billing details save on Supabase (fix for 0072)
--
-- Supabase loads pg_safeupdate for API calls, which refuses an UPDATE with no
-- WHERE clause ("UPDATE requires a WHERE clause"). billing_settings has one
-- row (id = true), and 0072's billing_settings_save updated it without a
-- WHERE, so saving Billing details failed in production. Same function, now
-- with WHERE id. Nothing else changes; grants stay as 0072/0053 set them.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.billing_settings_save(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  PERFORM app.require_admin();
  UPDATE public.billing_settings SET
    legal_name     = coalesce(nullif(btrim(p ->> 'legal_name'), ''), legal_name),
    cin            = CASE WHEN p ? 'cin' THEN nullif(btrim(coalesce(p ->> 'cin', '')), '') ELSE cin END,
    address        = coalesce(nullif(btrim(p ->> 'address'), ''), address),
    gstin          = CASE WHEN p ? 'gstin' THEN nullif(upper(btrim(coalesce(p ->> 'gstin', ''))), '') ELSE gstin END,
    lut_arn        = CASE WHEN p ? 'lut_arn' THEN nullif(btrim(coalesce(p ->> 'lut_arn', '')), '') ELSE lut_arn END,
    lut_fy         = CASE WHEN p ? 'lut_fy' THEN nullif(btrim(coalesce(p ->> 'lut_fy', '')), '') ELSE lut_fy END,
    sac_code       = CASE WHEN p ? 'sac_code' THEN nullif(btrim(coalesce(p ->> 'sac_code', '')), '') ELSE sac_code END,
    invoice_prefix = coalesce(nullif(upper(btrim(p ->> 'invoice_prefix')), ''), invoice_prefix),
    bank_transfer  = CASE WHEN p ? 'bank_transfer' THEN nullif(btrim(coalesce(p ->> 'bank_transfer', '')), '') ELSE bank_transfer END,
    wise_details   = CASE WHEN p ? 'wise_details' THEN nullif(btrim(coalesce(p ->> 'wise_details', '')), '') ELSE wise_details END,
    paypal_link    = CASE WHEN p ? 'paypal_link' THEN nullif(btrim(coalesce(p ->> 'paypal_link', '')), '') ELSE paypal_link END,
    invoice_note   = CASE WHEN p ? 'invoice_note' THEN nullif(btrim(coalesce(p ->> 'invoice_note', '')), '') ELSE invoice_note END,
    updated_by     = app.current_clerk_id(),
    updated_at     = now()
  WHERE id;
  PERFORM audit.log_event('BILLING_SETTINGS_SAVED', 'billing_settings', NULL, app.current_clerk_id(),
                          app.acting_role('FINANCE'), '{}'::jsonb);
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_text = CONSTRAINT_NAME;
  RAISE EXCEPTION '%', CASE
    WHEN v_text LIKE '%gstin%' THEN 'the GSTIN is not in the right format (15 characters, e.g. 07ABCDE1234F1Z5)'
    WHEN v_text LIKE '%lut_fy%' THEN 'write the LUT year as 2026-27'
    WHEN v_text LIKE '%paypal%' THEN 'the PayPal link must start with https://'
    WHEN v_text LIKE '%sac%' THEN 'the SAC code is 4 to 8 digits'
    WHEN v_text LIKE '%prefix%' THEN 'the invoice prefix is up to 8 capital letters or digits'
    ELSE 'one of the values is not valid' END;
END
$$;

