-- 0057_job_time_materials.sql
--
-- Phase 13b (owner brief, 1 Nov 2026): the designer's production workspace.
--
-- 1. Pause and resume. A designer can pause a job in progress and resume it.
--    Every pause is a row with both ends, so active working time is measured
--    from what happened, never estimated: (submitted or now) − started −
--    paused. Moving the job out of IN_PROGRESS (submit, reassignment, cancel)
--    closes an open pause by itself.
--
-- 2. job_times(): the recorded times of each job for its current version —
--    assigned, started, submitted, paused now?, paused total, active total.
--    The designer sees their own jobs; a pod lead their pod's; admins all.
--    Phase 13c builds the pod lead's reports on it.
--
-- 3. Pod materials: instructions, charts and reference documents a pod lead
--    shares with their pod, each with a title and a description. Designers
--    in the pod read them; the pod's lead (and admins) add and remove them.
--    Files live in the order-files bucket under materials/{pod}/, reached
--    only through pod_material_file() and a short-lived signed link.

-- ------------------------------------------------------------- pauses --

CREATE TABLE job_pauses (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id    text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version     integer     NOT NULL CHECK (version >= 1),
  designer_id text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  paused_at   timestamptz NOT NULL DEFAULT now(),
  resumed_at  timestamptz,
  CHECK (resumed_at IS NULL OR resumed_at >= paused_at)
);

-- At most one open pause per job.
CREATE UNIQUE INDEX job_pauses_one_open ON job_pauses (order_id) WHERE resumed_at IS NULL;
CREATE INDEX job_pauses_order_idx ON job_pauses (order_id, version);

CREATE OR REPLACE FUNCTION public.pause_job(p_order_id text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_at    timestamptz;
BEGIN
  IF NOT app.is_assigned_designer(p_order_id) THEN
    RAISE EXCEPTION 'only the assigned designer pauses this job';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'only a job in progress can be paused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_pauses WHERE order_id = p_order_id AND resumed_at IS NULL) THEN
    RAISE EXCEPTION 'the job is already paused';
  END IF;
  INSERT INTO public.job_pauses (order_id, version, designer_id)
  VALUES (p_order_id, v_order.work_version, app.current_clerk_id())
  RETURNING paused_at INTO v_at;
  PERFORM audit.log_event('JOB_PAUSED', 'order', p_order_id, app.current_clerk_id(), 'DESIGNER',
                          jsonb_build_object('version', v_order.work_version));
  RETURN v_at;
END
$$;

CREATE OR REPLACE FUNCTION public.resume_job(p_order_id text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_at    timestamptz;
BEGIN
  IF NOT app.is_assigned_designer(p_order_id) THEN
    RAISE EXCEPTION 'only the assigned designer resumes this job';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  UPDATE public.job_pauses SET resumed_at = now()
   WHERE order_id = p_order_id AND resumed_at IS NULL
  RETURNING resumed_at INTO v_at;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'the job is not paused';
  END IF;
  PERFORM audit.log_event('JOB_RESUMED', 'order', p_order_id, app.current_clerk_id(), 'DESIGNER',
                          jsonb_build_object('version', v_order.work_version));
  RETURN v_at;
END
$$;

-- A job that leaves IN_PROGRESS, or changes hands, is not paused any more.
CREATE OR REPLACE FUNCTION app.close_pause_on_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'IN_PROGRESS')
     OR NEW.designer_id IS DISTINCT FROM OLD.designer_id THEN
    UPDATE public.job_pauses SET resumed_at = now() WHERE order_id = NEW.id AND resumed_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS orders_close_pause ON public.orders;
CREATE TRIGGER orders_close_pause
  AFTER UPDATE OF status, designer_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.close_pause_on_move();

-- --------------------------------------------------------- job_times --

-- The recorded times of each job's current version. Seconds, so the app does
-- the wording. A version not started yet has no active time.
CREATE OR REPLACE FUNCTION public.job_times(p_order_id text DEFAULT NULL)
RETURNS TABLE (
  order_id        text,
  version         integer,
  status          public.order_status,
  assigned_at     timestamptz,
  started_at      timestamptz,
  submitted_at    timestamptz,
  paused_at       timestamptz,
  paused_seconds  integer,
  active_seconds  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.deleted_at IS NULL
      AND o.designer_id IS NOT NULL
      AND (p_order_id IS NULL OR o.id = p_order_id)
      AND app.current_clerk_id() IS NOT NULL
      AND ((o.designer_id = app.current_clerk_id() AND app.current_user_role() = 'DESIGNER')
           OR (o.pod_id IS NOT NULL AND o.pod_id = ANY (app.current_pod_ids()))
           OR app.is_admin())
  ),
  t AS (
    SELECT v.id, v.work_version, v.status,
           (SELECT max(j.assigned_at) FROM public.job_assignments j
             WHERE j.order_id = v.id AND j.designer_id = v.designer_id) AS assigned_at,
           app.last_moved_to(v.id, 'IN_PROGRESS') AS started_at,
           app.last_moved_to(v.id, 'QC_REVIEW') AS qc_at
    FROM visible v
  ),
  p AS (
    SELECT t.*,
           CASE WHEN t.qc_at >= t.started_at THEN t.qc_at END AS submitted_at,
           (SELECT jp.paused_at FROM public.job_pauses jp WHERE jp.order_id = t.id AND jp.resumed_at IS NULL) AS open_pause,
           coalesce((SELECT sum(extract(epoch FROM (coalesce(jp.resumed_at, now()) - jp.paused_at)))
                       FROM public.job_pauses jp
                      WHERE jp.order_id = t.id AND jp.version = t.work_version
                        AND t.started_at IS NOT NULL AND jp.paused_at >= t.started_at), 0) AS paused_s
    FROM t
  )
  SELECT p.id, p.work_version, p.status, p.assigned_at, p.started_at, p.submitted_at, p.open_pause,
         p.paused_s::integer,
         CASE
           WHEN p.started_at IS NULL THEN NULL
           WHEN p.submitted_at IS NOT NULL THEN greatest(0, extract(epoch FROM (p.submitted_at - p.started_at)) - p.paused_s)::integer
           WHEN p.status = 'IN_PROGRESS' THEN greatest(0, extract(epoch FROM (now() - p.started_at)) - p.paused_s)::integer
           ELSE NULL
         END
  FROM p
  LIMIT 1000
$$;

-- ---------------------------------------------------------- materials --

CREATE TABLE pod_materials (
  id           text        PRIMARY KEY,
  pod_id       text        NOT NULL REFERENCES pods (id) ON DELETE RESTRICT,
  title        text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description  text        CHECK (description IS NULL OR char_length(description) <= 2000),
  object_key   text        NOT NULL UNIQUE,
  file_name    text        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  content_type text        NOT NULL,
  size_bytes   integer     NOT NULL CHECK (size_bytes > 0),
  uploaded_by  text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz
);

CREATE INDEX pod_materials_pod_idx ON pod_materials (pod_id, created_at DESC) WHERE removed_at IS NULL;

-- Every pod I belong to, as designer or lead.
CREATE OR REPLACE FUNCTION app.my_member_pod_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(pm.pod_id), '{}'::text[])
  FROM public.pod_members pm
  WHERE pm.user_id = app.current_clerk_id()
$$;

CREATE OR REPLACE FUNCTION app.can_manage_materials(p_pod_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(app.is_admin() OR app.is_pod_lead_of(p_pod_id), false)
$$;

CREATE OR REPLACE FUNCTION public.pod_materials()
RETURNS TABLE (
  id           text,
  pod_id       text,
  pod_name     text,
  title        text,
  description  text,
  file_name    text,
  content_type text,
  size_bytes   integer,
  created_at   timestamptz,
  can_manage   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id, m.pod_id, p.name, m.title, m.description, m.file_name, m.content_type, m.size_bytes, m.created_at,
         app.can_manage_materials(m.pod_id)
  FROM public.pod_materials m
  JOIN public.pods p ON p.id = m.pod_id
  WHERE m.removed_at IS NULL
    AND app.current_clerk_id() IS NOT NULL
    AND (m.pod_id = ANY (app.my_member_pod_ids()) OR app.is_admin())
  ORDER BY m.created_at DESC
  LIMIT 500
$$;

-- The pods I may share materials with (my own pod as its lead; all for admins).
CREATE OR REPLACE FUNCTION public.material_pods()
RETURNS TABLE (id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name FROM public.pods p
  WHERE app.can_manage_materials(p.id)
  ORDER BY p.name
$$;

CREATE OR REPLACE FUNCTION public.add_pod_material(
  p_id           text,
  p_pod_id       text,
  p_title        text,
  p_description  text,
  p_object_key   text,
  p_file_name    text,
  p_content_type text,
  p_size_bytes   integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.can_manage_materials(p_pod_id) THEN
    RAISE EXCEPTION 'only the pod''s lead or an admin shares materials with this pod';
  END IF;
  IF p_object_key NOT LIKE 'materials/' || p_pod_id || '/%' THEN
    RAISE EXCEPTION 'file not found';
  END IF;
  INSERT INTO public.pod_materials (id, pod_id, title, description, object_key, file_name, content_type, size_bytes, uploaded_by)
  VALUES (p_id, p_pod_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_object_key,
          p_file_name, p_content_type, p_size_bytes, app.current_clerk_id());
  PERFORM audit.log_event('POD_MATERIAL_ADDED', 'pod', p_pod_id, app.current_clerk_id(), app.current_user_role(),
                          jsonb_build_object('material_id', p_id, 'title', btrim(p_title)));
END
$$;

CREATE OR REPLACE FUNCTION public.remove_pod_material(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pod text;
BEGIN
  SELECT pod_id INTO v_pod FROM public.pod_materials WHERE id = p_id AND removed_at IS NULL;
  IF v_pod IS NULL OR NOT app.can_manage_materials(v_pod) THEN
    RAISE EXCEPTION 'material not found';
  END IF;
  UPDATE public.pod_materials SET removed_at = now() WHERE id = p_id;
  PERFORM audit.log_event('POD_MATERIAL_REMOVED', 'pod', v_pod, app.current_clerk_id(), app.current_user_role(),
                          jsonb_build_object('material_id', p_id));
END
$$;

-- What the download route needs, for anyone who may read the material.
CREATE OR REPLACE FUNCTION public.pod_material_file(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('object_key', m.object_key, 'content_type', m.content_type, 'file_name', m.file_name)
  FROM public.pod_materials m
  WHERE m.id = p_id AND m.removed_at IS NULL
    AND app.current_clerk_id() IS NOT NULL
    AND (m.pod_id = ANY (app.my_member_pod_ids()) OR app.is_admin())
$$;

-- -------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.pause_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.job_times(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.close_pause_on_move() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.my_member_pod_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_manage_materials(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_materials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.material_pods() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_pod_material(text, text, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_pod_material(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pod_material_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_job(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_job(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.job_times(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.my_member_pod_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_manage_materials(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_materials() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.material_pods() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_pod_material(text, text, text, text, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_pod_material(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pod_material_file(text) TO authenticated, service_role;
