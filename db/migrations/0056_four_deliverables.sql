-- 0056_four_deliverables.sql
--
-- Phase 13a (owner, 1 Nov 2026): a CAD job delivers four files the designer
-- uploads, not ten.
--
--   3DM     Rhino 3DM
--   STL     STL mesh
--   RENDER  Render views: one image with the four basic render views
--   TECH    Technical sheet: one image with four views, measurements,
--           diamond details and gold weight (karat)
--
-- and a fifth the platform makes itself: the summary sheet (summary_sheet_data
-- below, rendered as a PDF by /api/orders/[id]/summary): the order, both
-- images, stones, gold weights, and how long it took with its timeline.
--
-- The old view slots (TV … GW) stay in the table, no longer required, so every
-- file already uploaded keeps its row and its name. Requirements are read
-- from this table everywhere (app.missing_slots, job_slots), so nothing else
-- changes: a version is complete when the four are there.

-- Positions are unique: move every row out of the way, then lay them out.
UPDATE public.deliverable_slots SET position = position + 100;

INSERT INTO public.deliverable_slots (code, label, required, position) VALUES
  ('RENDER', 'Render views — one image, four views', true, 3),
  ('TECH',   'Technical sheet — four views with measurements, diamond details and gold weight (kt)', true, 4)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, required = true, position = EXCLUDED.position;

UPDATE public.deliverable_slots SET position = 1, required = true WHERE code = '3DM';
UPDATE public.deliverable_slots SET position = 2, required = true WHERE code = 'STL';
UPDATE public.deliverable_slots SET required = false, position = position - 100 + 10
 WHERE code NOT IN ('3DM', 'STL', 'RENDER', 'TECH');

-- What each slot's file IS (0041), with the two new slots.
CREATE OR REPLACE FUNCTION app.slot_kind(p_slot text)
RETURNS file_kind
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (CASE p_slot
    WHEN '3DM' THEN 'RHINO_3DM'
    WHEN 'STL' THEN 'STL'
    WHEN 'RENDER' THEN 'RENDER'
    WHEN 'TECH' THEN 'TECHNICAL_SHEET'
    WHEN 'TV' THEN 'RENDER' WHEN 'PV' THEN 'RENDER' WHEN 'RV' THEN 'RENDER'
    WHEN 'FV' THEN 'RENDER' WHEN 'BV' THEN 'RENDER'
    WHEN 'DD' THEN 'DIAMOND_DETAILS' WHEN 'DIAMOND_DETAILS' THEN 'DIAMOND_DETAILS'
    WHEN 'GW' THEN 'WEIGHT_CHART' WHEN 'GOLD_WEIGHT_CHART' THEN 'WEIGHT_CHART'
    WHEN 'SUMMARY' THEN 'SUMMARY_SHEET'
    ELSE 'OTHER'
  END)::public.file_kind
$$;

-- The checklist line that named the ten views now names the four files.
UPDATE public.checklist_items
   SET label = 'Delivery files ready — render views (one image, four views) and technical sheet (measurements, diamond details, gold weight)'
 WHERE id = 12;

-- The public preview page (0051) shows the render image too. Not the
-- technical sheet: that page is for the jeweler's own customer.
CREATE OR REPLACE FUNCTION public.preview_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link  public.preview_links%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_token IS NULL OR char_length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT * INTO v_link FROM public.preview_links WHERE token_hash = app.token_hash(p_token);
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL OR v_link.expires_at < now() THEN RETURN NULL; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_link.order_id;
  IF v_order.status NOT IN ('APPROVED', 'DELIVERED', 'CLOSED', 'PAYOUT_RELEASED') OR v_order.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.preview_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id = v_link.id;
  RETURN jsonb_build_object(
    'jeweler', (SELECT coalesce(nullif(btrim(p.business_name), ''), 'Your jeweler') FROM public.client_profiles p
                WHERE p.user_id = v_order.client_id),
    'logo_key', (SELECT p.logo_object_key FROM public.client_profiles p WHERE p.user_id = v_order.client_id),
    'product', (SELECT s.product::text FROM public.order_specs s WHERE s.order_id = v_order.id),
    'stl_key', (SELECT fv.object_key FROM public.deliverables d JOIN public.file_versions fv ON fv.id = d.file_version_id
                WHERE d.order_id = v_order.id AND d.version = v_order.work_version AND d.slot = 'STL'),
    'renders', coalesce((SELECT jsonb_agg(jsonb_build_object('slot', d.slot, 'key', fv.object_key) ORDER BY ds.position)
                         FROM public.deliverables d
                         JOIN public.file_versions fv ON fv.id = d.file_version_id
                         JOIN public.deliverable_slots ds ON ds.code = d.slot
                         WHERE d.order_id = v_order.id AND d.version = v_order.work_version
                           AND d.slot IN ('RENDER', 'TV', 'PV', 'RV', 'FV', 'BV')), '[]'::jsonb)
  );
END
$$;

-- ---------------------------------------------------------- summary sheet --

-- Everything the summary sheet shows, read as the caller. The client from
-- approval on (the summary is part of what they buy, like the 3DM and STL);
-- the order's team and admins always. Never the designer: it carries the
-- client's order reference. Storage keys go only to the server route, which
-- embeds the two images; the bucket is private either way.
CREATE OR REPLACE FUNCTION public.summary_sheet_data(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel   text := app.order_relation(p_order_id);
  v_order public.orders%ROWTYPE;
  v_vol   public.job_volumes%ROWTYPE;
BEGIN
  IF app.current_clerk_id() IS NULL OR v_rel IS NULL OR v_rel = 'DESIGNER' THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_rel = 'CLIENT' AND v_order.status NOT IN ('APPROVED', 'DELIVERED', 'CLOSED', 'PAYOUT_RELEASED') THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT * INTO v_vol FROM public.job_volumes
   WHERE order_id = p_order_id AND version = v_order.work_version;

  RETURN jsonb_build_object(
    'ref', v_order.order_ref,
    'title', (SELECT nullif(btrim(s.reference_name), '') FROM public.order_specs s WHERE s.order_id = p_order_id),
    'product_type', v_order.product_type,
    'service', v_order.service,
    'status', v_order.status,
    'version', v_order.work_version,
    'created_at', v_order.created_at,
    'confirmed_at', v_order.sla_started_at,
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
    'measurements', (SELECT jsonb_build_object('ring_size', m.ring_size, 'inner_diameter_um', m.inner_diameter_um)
                     FROM public.qc_measurements m WHERE m.order_id = p_order_id ORDER BY m.version DESC LIMIT 1),
    'images', coalesce((SELECT jsonb_object_agg(d.slot, jsonb_build_object('key', fv.object_key, 'type', fv.content_type))
                        FROM public.deliverables d
                        JOIN public.file_versions fv ON fv.id = d.file_version_id
                        WHERE d.order_id = p_order_id AND d.version = v_order.work_version
                          AND d.slot IN ('RENDER', 'TECH')), '{}'::jsonb),
    -- The status changes, from the audit log: the order's timeline.
    'timeline', coalesce((SELECT jsonb_agg(jsonb_build_object('at', a.created_at, 'to', a.payload ->> 'to') ORDER BY a.seq)
                          FROM audit.audit_log a
                          WHERE a.entity_type = 'order' AND a.entity_id = p_order_id
                            AND a.action = 'ORDER_STATUS_CHANGED'), '[]'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.summary_sheet_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.summary_sheet_data(text) TO authenticated, service_role;
