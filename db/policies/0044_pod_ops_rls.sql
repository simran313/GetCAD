-- 0044_pod_ops_rls.sql
-- 0058's escalations and alert ledger: no direct access. Escalations are
-- written by escalate_job/resolve_escalation and read through
-- job_escalations_list; alerts only by sweep_job_alerts (service role).

ALTER TABLE job_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_escalations FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON job_escalations FROM PUBLIC, anon, authenticated;
GRANT ALL ON job_escalations TO service_role;

ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_alerts FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON job_alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON job_alerts TO service_role;
