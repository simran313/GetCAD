-- 0040_preview_claims_rls.sql
-- 0051's tables: no direct reads or writes. Preview links through their
-- functions (the public page server-side only), claims through
-- open_spec_claim (server only) / decide_spec_claim / order_claims /
-- claims_queue, stats through public_stats_latest (flag-gated).

ALTER TABLE preview_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_links FORCE  ROW LEVEL SECURITY;
ALTER TABLE spec_claims   ENABLE ROW LEVEL SECURITY;
ALTER TABLE spec_claims   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_stats  FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON preview_links, spec_claims, public_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON preview_links, spec_claims, public_stats TO service_role;
