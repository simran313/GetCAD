-- 0045_job_weights_rls.sql
-- 0060's job weights: no direct access. Written by set_job_weights and
-- set_tech_source, read through job_weights_get.

ALTER TABLE job_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_weights FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON job_weights FROM PUBLIC, anon, authenticated;
GRANT ALL ON job_weights TO service_role;
