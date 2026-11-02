-- 0060_job_weights.sql
--
-- Phase 13f (owner, 2 Nov 2026): the calculators feed the technical
-- measurement image. For each job version the designer saves the 18K cast
-- gold weight (with the casting and post allowances) and the stones (chart,
-- shape, size, carat per stone, pieces). The server joins a panel with the
-- gold weight per metal and the diamond details under the uploaded technical
-- image; that joined image is the version's TECH deliverable.
--
-- 1. job_weights, one row per (order, version): the weights, and which
--    upload is the plain technical image the panel is joined to.
-- 2. set_job_weights(): the assigned designer, while in progress.
-- 3. set_tech_source(): records the plain upload (called by the server right
--    after the designer's TECH upload).
-- 4. job_weights_get(): the current version's row, with the previous
--    version's weights to start from, for the designer, the pod lead, admin.
-- 5. A CAD version cannot be submitted without the gold weight.

CREATE TABLE public.job_weights (
  order_id            text        NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  version             integer     NOT NULL CHECK (version >= 1),
  gold_18k_g          numeric(9,3) CHECK (gold_18k_g > 0 AND gold_18k_g <= 5000),
  casting_allowance_g numeric(6,3) NOT NULL DEFAULT 0.1 CHECK (casting_allowance_g >= 0 AND casting_allowance_g <= 50),
  post_allowance_g    numeric(6,3) NOT NULL DEFAULT 1   CHECK (post_allowance_g >= 0 AND post_allowance_g <= 50),
  stones              jsonb       NOT NULL DEFAULT '[]'::jsonb
                                  CHECK (jsonb_typeof(stones) = 'array' AND jsonb_array_length(stones) <= 60),
  tech_source_id      text        REFERENCES public.file_versions (id) ON DELETE SET NULL,
  entered_by          text        REFERENCES public.users (id) ON DELETE RESTRICT,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version)
);

-- Each stone line: {chart: size|centre, shape, size, carat > 0, pcs ≥ 1}.
CREATE OR REPLACE FUNCTION app.valid_stones(p_stones jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(p_stones) = 'array'
     AND jsonb_array_length(p_stones) <= 60
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_stones) e(v)
       WHERE jsonb_typeof(v) <> 'object'
          OR coalesce(v ->> 'chart', '') NOT IN ('size', 'centre')
          OR char_length(coalesce(v ->> 'shape', '')) NOT BETWEEN 1 AND 40
          OR char_length(coalesce(v ->> 'size', '')) NOT BETWEEN 1 AND 40
          OR jsonb_typeof(v -> 'carat') <> 'number' OR (v ->> 'carat')::numeric <= 0 OR (v ->> 'carat')::numeric > 100
          OR jsonb_typeof(v -> 'pcs') <> 'number' OR (v ->> 'pcs')::numeric <> floor((v ->> 'pcs')::numeric)
          OR (v ->> 'pcs')::numeric < 1 OR (v ->> 'pcs')::numeric > 100000)
$$;

REVOKE ALL ON FUNCTION app.valid_stones(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_job_weights(
  p_order_id text,
  p_gold_18k_g numeric,
  p_casting_allowance_g numeric DEFAULT 0.1,
  p_post_allowance_g numeric DEFAULT 1,
  p_stones jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT app.is_assigned_designer(p_order_id) THEN
    RAISE EXCEPTION 'only the assigned designer saves the weights';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'the weights are saved while the job is in progress (is %)', v_order.status;
  END IF;
  IF p_gold_18k_g IS NULL OR p_gold_18k_g <= 0 OR p_gold_18k_g > 5000 THEN
    RAISE EXCEPTION 'the 18K gold weight is grams, more than 0 and at most 5000';
  END IF;
  IF p_casting_allowance_g IS NULL OR p_casting_allowance_g < 0 OR p_casting_allowance_g > 50
     OR p_post_allowance_g IS NULL OR p_post_allowance_g < 0 OR p_post_allowance_g > 50 THEN
    RAISE EXCEPTION 'allowances are grams, 0 to 50';
  END IF;
  IF NOT app.valid_stones(coalesce(p_stones, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'each stone line needs a chart, shape, size, carat and pieces (at most 60 lines)';
  END IF;

  INSERT INTO public.job_weights (order_id, version, gold_18k_g, casting_allowance_g, post_allowance_g, stones, entered_by, updated_at)
  VALUES (p_order_id, v_order.work_version, round(p_gold_18k_g, 3), round(p_casting_allowance_g, 3), round(p_post_allowance_g, 3),
          coalesce(p_stones, '[]'::jsonb), v_clerk_id, now())
  ON CONFLICT (order_id, version) DO UPDATE
    SET gold_18k_g = EXCLUDED.gold_18k_g, casting_allowance_g = EXCLUDED.casting_allowance_g,
        post_allowance_g = EXCLUDED.post_allowance_g, stones = EXCLUDED.stones,
        entered_by = EXCLUDED.entered_by, updated_at = now();

  PERFORM audit.log_event('WEIGHTS_SET', 'order', p_order_id, v_clerk_id, app.current_user_role(),
    jsonb_build_object('version', v_order.work_version, 'gold_18k_g', round(p_gold_18k_g, 3),
                       'stone_lines', jsonb_array_length(coalesce(p_stones, '[]'::jsonb))));
  RETURN jsonb_build_object('order_id', p_order_id, 'version', v_order.work_version);
END
$$;

REVOKE ALL ON FUNCTION public.set_job_weights(text, numeric, numeric, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_weights(text, numeric, numeric, numeric, jsonb) TO authenticated, service_role;

-- The plain technical image the panel is joined to: the version's current
-- TECH upload, recorded right after the designer uploads it.
CREATE OR REPLACE FUNCTION public.set_tech_source(p_order_id text, p_file_version_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT app.is_assigned_designer(p_order_id) THEN
    RAISE EXCEPTION 'only the assigned designer uploads the technical image';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'the technical image is uploaded while the job is in progress (is %)', v_order.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deliverables
                 WHERE order_id = p_order_id AND version = v_order.work_version AND slot = 'TECH'
                   AND file_version_id = p_file_version_id) THEN
    RAISE EXCEPTION 'that is not this version''s technical image';
  END IF;
  INSERT INTO public.job_weights (order_id, version, tech_source_id, entered_by, updated_at)
  VALUES (p_order_id, v_order.work_version, p_file_version_id, app.current_clerk_id(), now())
  ON CONFLICT (order_id, version) DO UPDATE SET tech_source_id = EXCLUDED.tech_source_id, updated_at = now();
END
$$;

REVOKE ALL ON FUNCTION public.set_tech_source(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tech_source(text, text) TO authenticated, service_role;

-- The current version's weights, the plain and the delivered technical image,
-- and the previous version's weights to start from. Team only.
CREATE OR REPLACE FUNCTION public.job_weights_get(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel     text := app.order_relation(p_order_id);
  v_version integer;
  v_row     public.job_weights%ROWTYPE;
  v_prev    public.job_weights%ROWTYPE;
BEGIN
  IF v_rel IS NULL OR v_rel NOT IN ('DESIGNER', 'POD_LEAD', 'ADMIN') THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT work_version INTO v_version FROM public.orders WHERE id = p_order_id;
  SELECT * INTO v_row FROM public.job_weights WHERE order_id = p_order_id AND version = v_version;
  SELECT * INTO v_prev FROM public.job_weights
   WHERE order_id = p_order_id AND version < v_version AND gold_18k_g IS NOT NULL
   ORDER BY version DESC LIMIT 1;
  RETURN jsonb_build_object(
    'version', v_version,
    'gold_18k_g', v_row.gold_18k_g,
    'casting_allowance_g', coalesce(v_row.casting_allowance_g, v_prev.casting_allowance_g, 0.1),
    'post_allowance_g', coalesce(v_row.post_allowance_g, v_prev.post_allowance_g, 1),
    'stones', coalesce(v_row.stones, '[]'::jsonb),
    'updated_at', v_row.updated_at,
    'tech_source_id', v_row.tech_source_id,
    'tech_current_id', (SELECT d.file_version_id FROM public.deliverables d
                         WHERE d.order_id = p_order_id AND d.version = v_version AND d.slot = 'TECH'),
    'previous', CASE WHEN v_prev.order_id IS NULL THEN NULL
                     ELSE jsonb_build_object('version', v_prev.version, 'gold_18k_g', v_prev.gold_18k_g, 'stones', v_prev.stones) END
  );
END
$$;

REVOKE ALL ON FUNCTION public.job_weights_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_weights_get(text) TO authenticated, service_role;

-- A CAD version goes to QC with its gold weight (the technical image carries it).
CREATE OR REPLACE FUNCTION app.weights_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.service = 'render' THEN RETURN NEW; END IF;
  IF NEW.status = 'DESIGNER_SUBMITTED' AND OLD.status = 'IN_PROGRESS'
     AND NOT EXISTS (SELECT 1 FROM public.job_weights
                     WHERE order_id = NEW.id AND version = NEW.work_version AND gold_18k_g IS NOT NULL) THEN
    RAISE EXCEPTION 'save the gold weight and diamonds before submitting';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_weights_gate
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.weights_gate();
