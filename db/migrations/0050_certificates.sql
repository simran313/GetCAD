-- 0050_certificates.sql
-- Phase 7a (SPEC-ADDENDUM A2–A4): what every delivery carries.
--
-- QC MEASUREMENTS (A2). The pod lead records the measured minimums for the
-- version under review (wall, prong, stone seats, size, mesh, open edges).
-- A CAD version cannot pass QC without them, and open edges must be 0.
--
-- MODEL VOLUME (A4). The designer enters the model's volume (mm³) for the
-- version; a CAD version cannot be submitted without it. The weight sheet is
-- computed from it with the densities in app_settings (owner answer: grams
-- only, no metal cost).
--
-- WAIVERS (A2). When a client asks for less than a minimum, the team records
-- it; it is printed on the certificate and a claim on that spec is not
-- covered (DECISIONS §7).
--
-- FINGERPRINTS (A3). The server records a SHA-256 for every slot file as it
-- is stored (record_file_fingerprint, server only); on delivery the
-- version's files are stamped archived. Files are never overwritten: every
-- upload is a new object, and nothing deletes them.
--
-- CERTIFICATES (A2). On QC pass the server builds the PDF, stores it, and
-- registers it here with its hash. A certificate row can never change.

CREATE TABLE qc_measurements (
  order_id          text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version           integer     NOT NULL CHECK (version >= 1),
  min_wall_um       integer     NOT NULL CHECK (min_wall_um BETWEEN 1 AND 20000),
  min_prong_um      integer     CHECK (min_prong_um IS NULL OR min_prong_um BETWEEN 1 AND 20000),
  stone_seats       jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stone_seats) = 'array'),
  ring_size         text        CHECK (ring_size IS NULL OR char_length(ring_size) <= 40),
  inner_diameter_um integer     CHECK (inner_diameter_um IS NULL OR inner_diameter_um BETWEEN 1 AND 300000),
  mesh_tolerance_um integer     NOT NULL DEFAULT 5 CHECK (mesh_tolerance_um BETWEEN 1 AND 1000),
  open_edges        integer     NOT NULL DEFAULT 0 CHECK (open_edges >= 0),
  recorded_by       text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version)
);

CREATE TABLE job_volumes (
  order_id   text          NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version    integer       NOT NULL CHECK (version >= 1),
  volume_mm3 numeric(12,3) NOT NULL CHECK (volume_mm3 > 0 AND volume_mm3 < 10000000),
  entered_by text          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  entered_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version)
);

CREATE TABLE spec_waivers (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id    text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  spec        text        NOT NULL CHECK (spec IN ('wall', 'prong', 'stone_seat', 'size', 'mesh', 'other')),
  requested   text        NOT NULL CHECK (char_length(btrim(requested)) BETWEEN 1 AND 200),
  note        text        CHECK (note IS NULL OR char_length(note) <= 1000),
  recorded_by text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deliverable_files (
  file_version_id text        PRIMARY KEY REFERENCES file_versions (id) ON DELETE RESTRICT,
  order_id        text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version         integer     NOT NULL,
  slot            text        NOT NULL,
  sha256          text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes      integer     NOT NULL CHECK (size_bytes > 0),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX deliverable_files_order_idx ON deliverable_files (order_id, version);
CREATE INDEX deliverable_files_sha_idx ON deliverable_files (sha256);

CREATE TABLE certificates (
  order_id    text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version     integer     NOT NULL CHECK (version >= 1),
  object_key  text        NOT NULL UNIQUE,
  sha256      text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes  integer     NOT NULL CHECK (size_bytes > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version)
);

REVOKE ALL ON qc_measurements, job_volumes, spec_waivers, deliverable_files, certificates
  FROM PUBLIC, anon, authenticated;

-- A certificate, once issued, is a record: no update, no delete.
CREATE OR REPLACE FUNCTION app.certificates_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'a certificate cannot be changed once issued';
END
$$;

CREATE TRIGGER certificates_immutable
  BEFORE UPDATE OR DELETE ON certificates
  FOR EACH ROW EXECUTE FUNCTION app.certificates_immutable();

-- ----------------------------------------------------------------- writes --

CREATE OR REPLACE FUNCTION public.set_job_volume(p_order_id text, p_volume_mm3 numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR app.order_relation(p_order_id) IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT coalesce((v_order.designer_id = v_clerk_id AND v_order.status = 'IN_PROGRESS')
                   OR (app.is_pod_lead_of(v_order.pod_id) AND v_order.status = 'QC_REVIEW'), false) THEN
    RAISE EXCEPTION 'the volume is entered by the designer while working, or by the pod lead in QC';
  END IF;
  IF p_volume_mm3 IS NULL OR p_volume_mm3 <= 0 THEN RAISE EXCEPTION 'enter the model volume in mm³'; END IF;
  INSERT INTO public.job_volumes (order_id, version, volume_mm3, entered_by)
  VALUES (p_order_id, v_order.work_version, round(p_volume_mm3, 3), v_clerk_id)
  ON CONFLICT (order_id, version) DO UPDATE
    SET volume_mm3 = EXCLUDED.volume_mm3, entered_by = EXCLUDED.entered_by, entered_at = now();
  PERFORM audit.log_event('JOB_VOLUME_SET', 'order', p_order_id, v_clerk_id, app.current_user_role(),
                          jsonb_build_object('version', v_order.work_version, 'volume_mm3', round(p_volume_mm3, 3)));
END
$$;

CREATE OR REPLACE FUNCTION public.record_qc_measurements(
  p_order_id          text,
  p_min_wall_um       integer,
  p_min_prong_um      integer,
  p_stone_seats       jsonb,
  p_ring_size         text,
  p_inner_diameter_um integer,
  p_mesh_tolerance_um integer,
  p_open_edges        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT app.is_pod_lead_of(v_order.pod_id) THEN
    RAISE EXCEPTION 'only the pod lead of this order''s pod records QC measurements';
  END IF;
  IF v_order.status <> 'QC_REVIEW' THEN RAISE EXCEPTION 'measurements are recorded during QC review'; END IF;
  INSERT INTO public.qc_measurements
    (order_id, version, min_wall_um, min_prong_um, stone_seats, ring_size, inner_diameter_um,
     mesh_tolerance_um, open_edges, recorded_by)
  VALUES
    (p_order_id, v_order.work_version, p_min_wall_um, p_min_prong_um, coalesce(p_stone_seats, '[]'::jsonb),
     nullif(btrim(p_ring_size), ''), p_inner_diameter_um, coalesce(p_mesh_tolerance_um, 5),
     coalesce(p_open_edges, 0), v_clerk_id)
  ON CONFLICT (order_id, version) DO UPDATE SET
    min_wall_um = EXCLUDED.min_wall_um, min_prong_um = EXCLUDED.min_prong_um,
    stone_seats = EXCLUDED.stone_seats, ring_size = EXCLUDED.ring_size,
    inner_diameter_um = EXCLUDED.inner_diameter_um, mesh_tolerance_um = EXCLUDED.mesh_tolerance_um,
    open_edges = EXCLUDED.open_edges, recorded_by = EXCLUDED.recorded_by, recorded_at = now();
  PERFORM audit.log_event('QC_MEASURED', 'order', p_order_id, v_clerk_id, 'QC',
                          jsonb_build_object('version', v_order.work_version, 'min_wall_um', p_min_wall_um,
                                             'min_prong_um', p_min_prong_um, 'open_edges', coalesce(p_open_edges, 0)));
END
$$;

CREATE OR REPLACE FUNCTION public.add_spec_waiver(p_order_id text, p_spec text, p_requested text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_id       text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.team_on_order(p_order_id) THEN RAISE EXCEPTION 'only the team on this order records a waiver'; END IF;
  INSERT INTO public.spec_waivers (order_id, spec, requested, note, recorded_by)
  VALUES (p_order_id, p_spec, btrim(p_requested), nullif(btrim(p_note), ''), v_clerk_id)
  RETURNING id INTO v_id;
  PERFORM audit.log_event('SPEC_WAIVER_ADDED', 'order', p_order_id, v_clerk_id, app.current_user_role(),
                          jsonb_build_object('spec', p_spec, 'requested', btrim(p_requested)));
  RETURN v_id;
END
$$;

-- Server only: the hash the server computed from the bytes it stored.
CREATE OR REPLACE FUNCTION public.record_file_fingerprint(p_file_version_id text, p_sha256 text, p_size_bytes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d public.deliverables%ROWTYPE;
BEGIN
  SELECT * INTO v_d FROM public.deliverables WHERE file_version_id = p_file_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not a slot file'; END IF;
  INSERT INTO public.deliverable_files (file_version_id, order_id, version, slot, sha256, size_bytes)
  VALUES (p_file_version_id, v_d.order_id, v_d.version, v_d.slot, lower(p_sha256), p_size_bytes)
  ON CONFLICT (file_version_id) DO NOTHING;
  IF EXISTS (SELECT 1 FROM public.deliverable_files WHERE file_version_id = p_file_version_id AND sha256 <> lower(p_sha256)) THEN
    RAISE EXCEPTION 'this file already has a different fingerprint';
  END IF;
END
$$;

-- Server only, after building the PDF from certificate_data().
CREATE OR REPLACE FUNCTION public.record_certificate(
  p_order_id text, p_version integer, p_object_key text, p_sha256 text, p_size_bytes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.qc_measurements WHERE order_id = p_order_id AND version = p_version) THEN
    RAISE EXCEPTION 'no QC measurements for this version';
  END IF;
  INSERT INTO public.certificates (order_id, version, object_key, sha256, size_bytes)
  VALUES (p_order_id, p_version, p_object_key, lower(p_sha256), p_size_bytes);
  PERFORM audit.log_event('CERTIFICATE_ISSUED', 'order', p_order_id, NULL, NULL,
                          jsonb_build_object('version', p_version, 'sha256', lower(p_sha256)));
END
$$;

-- ------------------------------------------------------------------ gates --

-- Submit needs the volume; QC pass needs the measurements, with no open
-- edges (DECISIONS §7, A2). Render-only orders have no model and skip both.
CREATE OR REPLACE FUNCTION app.spec_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open integer;
BEGIN
  IF NEW.service = 'render' THEN RETURN NEW; END IF;
  IF NEW.status = 'DESIGNER_SUBMITTED' AND OLD.status = 'IN_PROGRESS'
     AND NOT EXISTS (SELECT 1 FROM public.job_volumes WHERE order_id = NEW.id AND version = NEW.work_version) THEN
    RAISE EXCEPTION 'enter the model volume (mm³) before submitting';
  END IF;
  IF NEW.status = 'CLIENT_PREVIEW' AND OLD.status = 'QC_REVIEW' THEN
    SELECT open_edges INTO v_open FROM public.qc_measurements WHERE order_id = NEW.id AND version = NEW.work_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'record the QC measurements before passing'; END IF;
    IF v_open > 0 THEN RAISE EXCEPTION 'open edges must be 0 to pass'; END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_spec_gates
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION app.spec_gates();

-- Delivery archives the version's fingerprinted files.
CREATE OR REPLACE FUNCTION app.archive_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND OLD.status IS DISTINCT FROM 'DELIVERED' THEN
    UPDATE public.deliverable_files SET archived_at = now()
    WHERE order_id = NEW.id AND version = NEW.work_version AND archived_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_archive_on_delivery
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION app.archive_on_delivery();

-- ------------------------------------------------------------------ reads --

-- Who may read a version's certificate data: the client once it has passed
-- QC, and the team. Never the designer (it carries the order reference).
CREATE OR REPLACE FUNCTION app.can_read_certificate(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- coalesce: a stranger's relation is NULL, and NULL must read as "no",
  -- not "unknown" (an IF NOT NULL would let them through).
  SELECT coalesce(app.current_clerk_id() IS NOT NULL AND (
    app.team_on_order(p_order_id)
    OR app.is_admin()
    OR (coalesce(app.order_relation(p_order_id), '') = 'CLIENT'
        AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id
                    AND o.status IN ('CLIENT_PREVIEW', 'APPROVED', 'DELIVERED', 'CLOSED', 'PAYOUT_RELEASED',
                                     'DISPUTED', 'REVISION_REQUESTED')))
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.certificate_data(p_order_id text, p_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_version integer;
  v_m       public.qc_measurements%ROWTYPE;
BEGIN
  IF NOT app.can_read_certificate(p_order_id) THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  -- The latest version that has measurements, unless one is asked for.
  SELECT coalesce(p_version, max(version)) INTO v_version FROM public.qc_measurements WHERE order_id = p_order_id;
  SELECT * INTO v_m FROM public.qc_measurements WHERE order_id = p_order_id AND version = v_version;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'order_ref', v_order.order_ref,
    'version', v_version,
    'category', v_order.category,
    'service', v_order.service,
    'product', (SELECT s.product::text FROM public.order_specs s WHERE s.order_id = p_order_id),
    'passed_at', (SELECT max(a.created_at) FROM audit.audit_log a
                  WHERE a.entity_type = 'order' AND a.entity_id = p_order_id AND a.action = 'ORDER_STATUS_CHANGED'
                    AND a.payload ->> 'to' = 'CLIENT_PREVIEW'),
    'measurements', jsonb_build_object(
      'min_wall_um', v_m.min_wall_um, 'min_prong_um', v_m.min_prong_um, 'stone_seats', v_m.stone_seats,
      'ring_size', v_m.ring_size, 'inner_diameter_um', v_m.inner_diameter_um,
      'mesh_tolerance_um', v_m.mesh_tolerance_um, 'open_edges', v_m.open_edges, 'recorded_at', v_m.recorded_at),
    'minimums', jsonb_build_object('wall_um', app.setting('min_wall_um'), 'prong_um', app.setting('min_prong_um')),
    'waivers', coalesce((SELECT jsonb_agg(jsonb_build_object('spec', w.spec, 'requested', w.requested, 'note', w.note,
                                                              'at', w.created_at) ORDER BY w.created_at)
                         FROM public.spec_waivers w WHERE w.order_id = p_order_id), '[]'::jsonb),
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object('item', i.id, 'group', i.group_name, 'label', i.label,
                                                                'signoff', i.is_signoff, 'designer_at', k.designer_at,
                                                                'qc_at', k.qc_at) ORDER BY i.id)
                           FROM public.checklist_items i
                           LEFT JOIN public.order_checks k
                             ON k.order_id = p_order_id AND k.version = v_version AND k.item_id = i.id), '[]'::jsonb),
    'designer_ref', (SELECT d.designer_ref FROM public.designer_profiles d WHERE d.user_id = v_order.designer_id),
    'pod_name', (SELECT p.name FROM public.pods p WHERE p.id = v_order.pod_id),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('slot', f.slot, 'sha256', f.sha256, 'size_bytes', f.size_bytes,
                                                            'file_name', dv.file_name) ORDER BY f.slot)
                       FROM public.deliverable_files f
                       JOIN public.deliverables dv ON dv.file_version_id = f.file_version_id
                       WHERE f.order_id = p_order_id AND f.version = v_version), '[]'::jsonb),
    'issued', EXISTS (SELECT 1 FROM public.certificates c WHERE c.order_id = p_order_id AND c.version = v_version)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.certificate_for_download(p_order_id text, p_version integer DEFAULT NULL)
RETURNS TABLE (object_key text, version integer, sha256 text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.object_key, c.version, c.sha256
  FROM public.certificates c
  WHERE c.order_id = p_order_id
    AND app.can_read_certificate(p_order_id)
    AND (p_version IS NULL OR c.version = p_version)
  ORDER BY c.version DESC
  LIMIT 1
$$;

-- The weight sheet's inputs (A4): the latest entered volume, the densities
-- and the brief. Client (after QC), the team and the order's designer.
CREATE OR REPLACE FUNCTION public.weight_sheet_data(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel text := app.order_relation(p_order_id);
  v_vol public.job_volumes%ROWTYPE;
BEGIN
  IF app.current_clerk_id() IS NULL OR v_rel IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_rel = 'CLIENT' AND NOT app.can_read_certificate(p_order_id) THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_vol FROM public.job_volumes WHERE order_id = p_order_id ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'ref', (SELECT CASE WHEN v_rel = 'DESIGNER' THEN o.job_code ELSE o.order_ref END FROM public.orders o WHERE o.id = p_order_id),
    'version', v_vol.version,
    'volume_mm3', v_vol.volume_mm3,
    'densities_mg_cm3', jsonb_build_object(
      '10K', app.setting('density_10k_mg_cm3'), '14K', app.setting('density_14k_mg_cm3'),
      '18K', app.setting('density_18k_mg_cm3'), 'Pt950', app.setting('density_pt950_mg_cm3'),
      'Ag925', app.setting('density_ag925_mg_cm3')),
    'spec', (SELECT to_jsonb(s) - 'reference_name' - 'based_on_order_id' - 'order_id' - 'notes'
             FROM public.order_specs s WHERE s.order_id = p_order_id),
    'accents', coalesce((SELECT jsonb_agg(jsonb_build_object('shape', a.shape, 'width_um', a.width_um,
                                                              'quantity', a.quantity, 'setting', a.setting) ORDER BY a.position)
                         FROM public.order_spec_accents a WHERE a.order_id = p_order_id), '[]'::jsonb),
    'measurements', (SELECT jsonb_build_object('ring_size', m.ring_size, 'inner_diameter_um', m.inner_diameter_um,
                                               'stone_seats', m.stone_seats)
                     FROM public.qc_measurements m WHERE m.order_id = p_order_id ORDER BY m.version DESC LIMIT 1)
  );
END
$$;

-- What the job and QC screens show: this version's volume, measurements,
-- waivers. Designer: volume only.
CREATE OR REPLACE FUNCTION public.version_spec(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel   text := app.order_relation(p_order_id);
  v_order public.orders%ROWTYPE;
BEGIN
  IF app.current_clerk_id() IS NULL OR v_rel IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object(
    'version', v_order.work_version,
    'volume_mm3', (SELECT volume_mm3 FROM public.job_volumes WHERE order_id = p_order_id AND version = v_order.work_version),
    'measurements', CASE WHEN v_rel = 'DESIGNER' THEN NULL ELSE
      (SELECT to_jsonb(m) - 'recorded_by' FROM public.qc_measurements m
        WHERE m.order_id = p_order_id AND m.version = v_order.work_version) END,
    'waivers', CASE WHEN v_rel = 'DESIGNER' THEN '[]'::jsonb ELSE
      coalesce((SELECT jsonb_agg(jsonb_build_object('spec', w.spec, 'requested', w.requested, 'note', w.note) ORDER BY w.created_at)
                FROM public.spec_waivers w WHERE w.order_id = p_order_id), '[]'::jsonb) END,
    'minimums', jsonb_build_object('wall_um', app.setting('min_wall_um'), 'prong_um', app.setting('min_prong_um')),
    'certificate', EXISTS (SELECT 1 FROM public.certificates c WHERE c.order_id = p_order_id)
                   AND v_rel <> 'DESIGNER'
  );
END
$$;

-- C8: the fingerprints of the files a client (or the team) can see.
CREATE OR REPLACE FUNCTION public.order_fingerprints(p_order_id text)
RETURNS TABLE (file_version_id text, slot text, version integer, sha256 text, size_bytes integer, archived_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.file_version_id, f.slot, f.version, f.sha256, f.size_bytes, f.archived_at
  FROM public.deliverable_files f
  WHERE f.order_id = p_order_id AND app.can_read_certificate(p_order_id)
  ORDER BY f.version DESC, f.slot
$$;

REVOKE ALL ON FUNCTION public.set_job_volume(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_qc_measurements(text, integer, integer, jsonb, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_spec_waiver(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_file_fingerprint(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_certificate(text, integer, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.certificate_data(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.certificate_for_download(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weight_sheet_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.version_spec(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_fingerprints(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_read_certificate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.spec_gates() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.archive_on_delivery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_volume(text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_qc_measurements(text, integer, integer, jsonb, text, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_spec_waiver(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_file_fingerprint(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_certificate(text, integer, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.certificate_data(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.certificate_for_download(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weight_sheet_data(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.version_spec(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_fingerprints(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_read_certificate(text) TO authenticated, service_role;
