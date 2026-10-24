-- 0039_certificates_rls.sql
-- 0050's tables: no direct reads or writes. Written through their
-- functions (fingerprints and certificates by the server only); read through
-- certificate_data, certificate_for_download, weight_sheet_data,
-- version_spec and order_fingerprints, which apply who-may-see.

ALTER TABLE qc_measurements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_measurements   FORCE  ROW LEVEL SECURITY;
ALTER TABLE job_volumes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_volumes       FORCE  ROW LEVEL SECURITY;
ALTER TABLE spec_waivers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE spec_waivers      FORCE  ROW LEVEL SECURITY;
ALTER TABLE deliverable_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_files FORCE  ROW LEVEL SECURITY;
ALTER TABLE certificates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates      FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON qc_measurements, job_volumes, spec_waivers, deliverable_files, certificates
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON qc_measurements, job_volumes, spec_waivers, deliverable_files, certificates TO service_role;
