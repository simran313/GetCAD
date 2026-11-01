-- 0043_job_time_materials_rls.sql
-- 0057's pauses and pod materials: no direct access. Pauses are written by
-- pause_job/resume_job and read through job_times; materials through
-- pod_materials, add_pod_material, remove_pod_material and pod_material_file.

ALTER TABLE job_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_pauses FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON job_pauses FROM PUBLIC, anon, authenticated;
GRANT ALL ON job_pauses TO service_role;

ALTER TABLE pod_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_materials FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON pod_materials FROM PUBLIC, anon, authenticated;
GRANT ALL ON pod_materials TO service_role;
