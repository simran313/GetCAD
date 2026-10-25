-- 0051_preview_claims_stats.sql
-- Phase 7b (SPEC-ADDENDUM A5–A7).
--
-- LOGO. A client may upload their logo (cleaned by the server) for the
-- preview pages they send their customers (owner answer).
--
-- PREVIEW LINKS (A5). The client makes an unguessable link for an approved
-- design; we keep only its SHA-256. It expires (30 days by default, the
-- client can extend), can be revoked, and counts views. The public page
-- reads it through preview_by_token(), server only, which returns storage
-- keys for that one order's renders and STL and the jeweler's name and
-- logo — never a price, a reference or anything of ours.
--
-- SPEC CLAIMS (A6). Within the claim window after delivery the client
-- uploads the file they used, photos, the spec and casting details. The
-- server hashes the file: no match with what we delivered → not covered
-- (edited after delivery); a waiver on that spec → not covered; a third
-- claim in 90 days → admin review. The pod lead re-measures and decides;
-- admin may decide and may overturn a rejection (owner answer). Upheld →
-- a free fix job (₹0 designer pay — owner answer — QC pay as the original,
-- 6-hour clock from now) and the CAD fee back as credit, once.
--
-- STATS (A7). Computed weekly; readable by anyone only while the
-- public_stats flag is on (DECISIONS §12).

-- ------------------------------------------------------------------ logo --

ALTER TABLE client_profiles ADD COLUMN logo_object_key text;

CREATE OR REPLACE FUNCTION public.set_client_logo(p_object_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_object_key IS NOT NULL AND p_object_key NOT LIKE 'logos/' || v_clerk_id || '/%' THEN
    RAISE EXCEPTION 'not your logo';
  END IF;
  UPDATE public.client_profiles SET logo_object_key = p_object_key WHERE user_id = v_clerk_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'save your business details first'; END IF;
END
$$;

-- --------------------------------------------------------- preview links --

CREATE TABLE preview_links (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id       text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  token_hash     text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  view_count     integer     NOT NULL DEFAULT 0,
  last_viewed_at timestamptz
);

CREATE INDEX preview_links_order_idx ON preview_links (order_id);

CREATE OR REPLACE FUNCTION app.token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION app.my_approved_order(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.client_id = app.current_clerk_id() AND o.deleted_at IS NULL
      AND o.status IN ('APPROVED', 'DELIVERED', 'CLOSED', 'PAYOUT_RELEASED')
  )
$$;

CREATE OR REPLACE FUNCTION public.create_preview_link(p_order_id text, p_token text, p_days integer DEFAULT 30)
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
  IF NOT app.my_approved_order(p_order_id) THEN
    RAISE EXCEPTION 'a preview link can be made once you have approved the design';
  END IF;
  IF p_token IS NULL OR char_length(p_token) < 32 THEN RAISE EXCEPTION 'token too short'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'choose 1 to 365 days'; END IF;
  INSERT INTO public.preview_links (order_id, token_hash, created_by, expires_at)
  VALUES (p_order_id, app.token_hash(p_token), v_clerk_id, now() + make_interval(days => p_days))
  RETURNING id INTO v_id;
  INSERT INTO public.marketing_events (event, user_id, order_id) VALUES ('preview_link_created', v_clerk_id, p_order_id);
  PERFORM audit.log_event('PREVIEW_LINK_CREATED', 'order', p_order_id, v_clerk_id, 'CLIENT',
                          jsonb_build_object('link_id', v_id, 'days', p_days));
  RETURN v_id;
END
$$;

-- Extend (days from now) or revoke one of my links.
CREATE OR REPLACE FUNCTION public.update_preview_link(p_link_id text, p_revoke boolean DEFAULT false, p_days integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.preview_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.preview_links WHERE id = p_link_id;
  IF NOT FOUND OR NOT app.my_approved_order(v_link.order_id) THEN RAISE EXCEPTION 'link not found'; END IF;
  IF p_revoke THEN
    UPDATE public.preview_links SET revoked_at = coalesce(revoked_at, now()) WHERE id = p_link_id;
  ELSIF p_days IS NOT NULL THEN
    IF v_link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'a revoked link cannot be extended'; END IF;
    IF p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'choose 1 to 365 days'; END IF;
    UPDATE public.preview_links SET expires_at = now() + make_interval(days => p_days) WHERE id = p_link_id;
  END IF;
  PERFORM audit.log_event('PREVIEW_LINK_CHANGED', 'order', v_link.order_id, app.current_clerk_id(), 'CLIENT',
                          jsonb_build_object('link_id', p_link_id, 'revoked', p_revoke, 'days', p_days));
END
$$;

CREATE OR REPLACE FUNCTION public.my_preview_links(p_order_id text)
RETURNS TABLE (id text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
               view_count integer, last_viewed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id, l.created_at, l.expires_at, l.revoked_at, l.view_count, l.last_viewed_at
  FROM public.preview_links l
  WHERE l.order_id = p_order_id AND app.my_approved_order(p_order_id)
  ORDER BY l.created_at DESC
$$;

-- Server only: the public page. Counts the view. Nothing but storage keys
-- for this order's approved files, the piece's type, and the jeweler.
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
                           AND d.slot IN ('TV', 'PV', 'RV', 'FV', 'BV')), '[]'::jsonb)
  );
END
$$;

-- ------------------------------------------------------------ spec claims --

CREATE TABLE spec_claims (
  id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id           text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  client_id          text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  designer_id        text        REFERENCES users (id) ON DELETE RESTRICT,
  spec               text        NOT NULL CHECK (spec IN ('wall', 'prong', 'stone_seat', 'size', 'mesh', 'open_edges', 'other')),
  description        text        NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  casting_details    text        NOT NULL CHECK (char_length(btrim(casting_details)) BETWEEN 1 AND 2000),
  uploaded_sha256    text        NOT NULL CHECK (uploaded_sha256 ~ '^[0-9a-f]{64}$'),
  file_object_key    text        NOT NULL,
  photo_keys         text[]      NOT NULL CHECK (cardinality(photo_keys) BETWEEN 1 AND 10),
  hash_match         boolean     NOT NULL,
  matched_version    integer,
  status             text        NOT NULL CHECK (status IN ('not_covered', 'open', 'admin_review', 'upheld', 'rejected')),
  not_covered_reason text,
  measured           jsonb,
  decision_note      text        CHECK (decision_note IS NULL OR char_length(decision_note) <= 4000),
  decided_by         text        REFERENCES users (id) ON DELETE RESTRICT,
  decided_at         timestamptz,
  fix_order_id       text        REFERENCES orders (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- One claim being looked at per order at a time.
CREATE UNIQUE INDEX spec_claims_one_open ON spec_claims (order_id) WHERE status IN ('open', 'admin_review');
CREATE INDEX spec_claims_client_idx ON spec_claims (client_id, created_at);

-- When an order was last delivered (the claim window runs from here).
CREATE OR REPLACE FUNCTION app.delivered_at(p_order_id text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.last_moved_to(p_order_id, 'DELIVERED')
$$;

-- What the claim screen needs to know before the client fills it in.
CREATE OR REPLACE FUNCTION app.claim_window_for(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_from  timestamptz := app.delivered_at(p_order_id);
  v_days  integer := coalesce(app.setting('claim_window_days'), 30);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object(
    'delivered_at', v_from,
    'closes_at', v_from + make_interval(days => v_days),
    'open', coalesce(v_from IS NOT NULL AND now() <= v_from + make_interval(days => v_days)
            AND v_order.status IN ('DELIVERED', 'CLOSED', 'PAYOUT_RELEASED')
            AND NOT EXISTS (SELECT 1 FROM public.spec_claims c WHERE c.order_id = p_order_id AND c.status IN ('open', 'admin_review')),
            false),
    'days', v_days
  );
END
$$;

CREATE OR REPLACE FUNCTION public.claim_window(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND client_id = app.current_clerk_id()) THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  RETURN app.claim_window_for(p_order_id);
END
$$;

-- Server only, with the signed-in client's id: the hash must be the one the
-- server computed from the bytes it stored, never one a browser supplies
-- (anyone can hash the file we delivered and claim with it).
CREATE OR REPLACE FUNCTION public.open_spec_claim(
  p_client_id       text,
  p_order_id        text,
  p_spec            text,
  p_description     text,
  p_casting_details text,
  p_uploaded_sha256 text,
  p_file_object_key text,
  p_photo_keys      text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := p_client_id;
  v_order    public.orders%ROWTYPE;
  v_window   jsonb;
  v_version  integer;
  v_status   text := 'open';
  v_reason   text;
  v_recent   integer;
  v_id       text;
  v_sha      text := lower(btrim(coalesce(p_uploaded_sha256, '')));
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id IS DISTINCT FROM v_clerk_id THEN RAISE EXCEPTION 'order not found'; END IF;
  v_window := app.claim_window_for(p_order_id);
  IF NOT (v_window ->> 'open')::boolean THEN
    RAISE EXCEPTION 'claims can be opened within % days of delivery, one at a time', v_window ->> 'days';
  END IF;
  IF p_file_object_key NOT LIKE p_order_id || '/claims/%' THEN RAISE EXCEPTION 'upload the file you used'; END IF;
  IF p_photo_keys IS NULL OR cardinality(p_photo_keys) = 0 THEN RAISE EXCEPTION 'add at least one photo of the piece'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_photo_keys) k WHERE k NOT LIKE p_order_id || '/claims/%') THEN
    RAISE EXCEPTION 'upload the photos with the claim';
  END IF;

  -- The file they cast from, matched by fingerprint to what we delivered.
  SELECT f.version INTO v_version FROM public.deliverable_files f
  WHERE f.order_id = p_order_id AND f.sha256 = v_sha ORDER BY f.version DESC LIMIT 1;
  IF v_version IS NULL THEN
    v_status := 'not_covered';
    v_reason := 'The file you sent does not match any file we delivered, so it was changed after delivery. Edited files are not covered.';
  ELSIF EXISTS (SELECT 1 FROM public.spec_waivers w WHERE w.order_id = p_order_id AND w.spec = p_spec) THEN
    v_status := 'not_covered';
    v_reason := 'You asked for this measurement below our minimum; the waiver is on the certificate, so it is not covered.';
  ELSE
    SELECT count(*) INTO v_recent FROM public.spec_claims c
    WHERE c.client_id = v_clerk_id AND c.created_at > now() - interval '90 days' AND c.status <> 'not_covered';
    IF v_recent >= 2 THEN v_status := 'admin_review'; END IF;
  END IF;

  INSERT INTO public.spec_claims
    (order_id, client_id, designer_id, spec, description, casting_details, uploaded_sha256, file_object_key,
     photo_keys, hash_match, matched_version, status, not_covered_reason)
  VALUES
    (p_order_id, v_clerk_id, v_order.designer_id, p_spec, btrim(p_description), btrim(p_casting_details), v_sha,
     p_file_object_key, p_photo_keys, v_version IS NOT NULL, v_version, v_status, v_reason)
  RETURNING id INTO v_id;

  INSERT INTO public.marketing_events (event, user_id, order_id) VALUES ('spec_claim_opened', v_clerk_id, p_order_id);
  PERFORM audit.log_event('SPEC_CLAIM_OPENED', 'order', p_order_id, v_clerk_id, 'CLIENT',
                          jsonb_build_object('claim_id', v_id, 'spec', p_spec, 'status', v_status,
                                             'hash_match', v_version IS NOT NULL));
  IF v_status = 'open' THEN
    PERFORM app.notify(v_order.pod_lead_id, v_clerk_id, 'DISPUTE', p_order_id,
                       'A client opened a spec claim. Re-measure the archived file.');
  END IF;
  RETURN jsonb_build_object('claim_id', v_id, 'status', v_status, 'reason', v_reason);
END
$$;

-- The pod lead decides an open claim; an admin decides any open or
-- admin-review claim and may overturn a rejection. Upheld: the fix job and
-- the credit, once.
CREATE OR REPLACE FUNCTION public.decide_spec_claim(
  p_claim_id     text,
  p_upheld       boolean,
  p_measured     jsonb,
  p_note         text,
  p_fix_order_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_claim    public.spec_claims%ROWTYPE;
  v_order    public.orders%ROWTYPE;
  v_admin    boolean := app.is_admin();
  v_paid     integer;
  v_ref      text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_claim FROM public.spec_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_claim.order_id;

  IF NOT (
    (v_claim.status = 'open' AND (v_admin OR app.is_pod_lead_of(v_order.pod_id)))
    OR (v_claim.status = 'admin_review' AND v_admin)
    OR (v_claim.status = 'rejected' AND v_admin AND p_upheld)
  ) THEN
    RAISE EXCEPTION 'this claim is not yours to decide now (is %)', v_claim.status;
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN RAISE EXCEPTION 'write what you measured and why'; END IF;

  IF p_upheld THEN
    IF p_fix_order_id IS NULL OR btrim(p_fix_order_id) = '' THEN RAISE EXCEPTION 'a new order id is required'; END IF;
    -- The fix job: same piece, same pod, the original's category and QC pay,
    -- no designer pay and no price; paid and confirmed now, so the 6-hour
    -- clock starts.
    INSERT INTO public.orders
      (id, client_id, product_type, status, currency, service, pod_id, pod_lead_id,
       price_total, designer_payout, qc_payout, platform_commission)
    VALUES
      (p_fix_order_id, v_order.client_id, v_order.product_type, 'DRAFT', v_order.currency, v_order.service,
       v_order.pod_id, v_order.pod_lead_id, 0, 0, 0, 0);
    INSERT INTO public.order_specs
    SELECT (jsonb_populate_record(NULL::public.order_specs,
              to_jsonb(s) || jsonb_build_object('order_id', p_fix_order_id, 'based_on_order_id', v_order.id,
                                                'change_summary', 'Spec claim fix (' || v_claim.spec || '): ' || btrim(p_note)))).*
    FROM public.order_specs s WHERE s.order_id = v_order.id;
    INSERT INTO public.order_spec_accents (order_id, position, shape, width_um, quantity, setting)
    SELECT p_fix_order_id, a.position, a.shape, a.width_um, a.quantity, a.setting
    FROM public.order_spec_accents a WHERE a.order_id = v_order.id
      AND EXISTS (SELECT 1 FROM public.order_specs WHERE order_id = p_fix_order_id);
    UPDATE public.orders SET status = 'SUBMITTED' WHERE id = p_fix_order_id RETURNING order_ref INTO v_ref;
    UPDATE public.orders
       SET status = 'PAYMENT_HELD', category = v_order.category, tier = v_order.tier,
           designer_payout_paise = 0, qc_payout_paise = v_order.qc_payout_paise,
           paid_at = now(), payment_method = 'manual', confirmed_at = now(), confirmed_by = v_clerk_id
     WHERE id = p_fix_order_id;
    PERFORM app.maybe_start_sla(p_fix_order_id);
    PERFORM audit.log_event('ORDER_CREATED', 'order', p_fix_order_id, v_clerk_id, app.current_user_role(),
                            jsonb_build_object('claim_fix_of', v_order.id, 'claim_id', p_claim_id));

    -- The CAD fee back as credit, once per order (client_credits is unique
    -- on order and kind).
    SELECT coalesce(sum(amount) FILTER (WHERE kind = 'HOLD'), 0)::integer INTO v_paid
    FROM public.escrow_ledger WHERE order_id = v_order.id;
    IF v_paid > 0 THEN
      INSERT INTO public.client_credits
        (client_id, order_id, kind, amount_cents, currency, status, decided_at, decided_amount_cents, decision_reason)
      VALUES (v_order.client_id, v_order.id, 'claim_credit', v_paid, v_order.currency, 'apply_next', now(), v_paid,
              'spec claim upheld')
      ON CONFLICT (order_id, kind) DO NOTHING;
    END IF;
    PERFORM app.notify(v_order.pod_lead_id, v_clerk_id, 'ASSIGNED', p_fix_order_id,
                       'A spec claim was upheld. Assign the free fix — the 6-hour clock is running.');
  END IF;

  UPDATE public.spec_claims
     SET status = CASE WHEN p_upheld THEN 'upheld' ELSE 'rejected' END,
         measured = p_measured, decision_note = btrim(p_note), decided_by = v_clerk_id, decided_at = now(),
         fix_order_id = CASE WHEN p_upheld THEN p_fix_order_id ELSE fix_order_id END
   WHERE id = p_claim_id;
  PERFORM audit.log_event('SPEC_CLAIM_DECIDED', 'order', v_claim.order_id, v_clerk_id, app.current_user_role(),
                          jsonb_build_object('claim_id', p_claim_id, 'upheld', p_upheld, 'measured', p_measured,
                                             'fix_order_id', CASE WHEN p_upheld THEN p_fix_order_id END));
  PERFORM app.notify(v_order.client_id, v_clerk_id, 'DISPUTE', v_order.id,
                     CASE WHEN p_upheld THEN 'Your spec claim was upheld: a free fix is under way and the CAD fee is credited.'
                          ELSE 'We re-measured the archived file for your spec claim. See the result on the order.' END);
  RETURN jsonb_build_object('claim_id', p_claim_id, 'upheld', p_upheld, 'fix_order_id',
                            CASE WHEN p_upheld THEN p_fix_order_id END, 'fix_order_ref', v_ref);
END
$$;

-- Claims on an order: the client sees their own (never the designer); the
-- team sees everything, including the file and photo keys.
CREATE OR REPLACE FUNCTION public.order_claims(p_order_id text)
RETURNS TABLE (id text, spec text, description text, casting_details text, hash_match boolean,
               matched_version integer, status text, not_covered_reason text, measured jsonb,
               decision_note text, decided_at timestamptz, fix_order_id text, created_at timestamptz,
               file_object_key text, photo_keys text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.spec, c.description, c.casting_details, c.hash_match, c.matched_version, c.status,
         c.not_covered_reason, c.measured, c.decision_note, c.decided_at, c.fix_order_id, c.created_at,
         CASE WHEN app.team_on_order(p_order_id) THEN c.file_object_key END,
         CASE WHEN app.team_on_order(p_order_id) THEN c.photo_keys END
  FROM public.spec_claims c
  WHERE c.order_id = p_order_id
    AND (app.team_on_order(p_order_id) OR c.client_id = app.current_clerk_id())
  ORDER BY c.created_at DESC
$$;

-- The team's claims queue: open in my pods; admin sees open + admin review.
CREATE OR REPLACE FUNCTION public.claims_queue()
RETURNS TABLE (id text, order_id text, order_ref text, client_code text, designer_ref text, spec text,
               status text, hash_match boolean, created_at timestamptz, designer_upheld_90d integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.order_id, o.order_ref, ca.client_code, d.designer_ref, c.spec, c.status, c.hash_match, c.created_at,
         (SELECT count(*)::integer FROM public.spec_claims x
           WHERE x.designer_id = c.designer_id AND x.status = 'upheld' AND x.decided_at > now() - interval '90 days')
  FROM public.spec_claims c
  JOIN public.orders o ON o.id = c.order_id
  LEFT JOIN public.client_accounts ca ON ca.user_id = c.client_id
  LEFT JOIN public.designer_profiles d ON d.user_id = c.designer_id
  WHERE (c.status = 'open' AND (app.is_admin() OR o.pod_id = ANY (app.current_pod_ids())))
     OR (c.status IN ('admin_review', 'rejected', 'upheld', 'not_covered') AND app.is_admin()
         AND c.created_at > now() - interval '90 days')
  ORDER BY (c.status IN ('open', 'admin_review')) DESC, c.created_at
$$;

-- ----------------------------------------------------------------- stats --

CREATE TABLE public_stats (
  week_start               date        PRIMARY KEY,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  designs_delivered        integer     NOT NULL,
  first_look_on_time_pct   integer,
  first_pass_approval_pct  integer,
  late_credits_issued      integer     NOT NULL,
  claims_upheld            integer     NOT NULL
);

-- Add. A7, over the last 30 days, stored against this week. Admin or the
-- scheduler; never edited by hand.
--   on time      standard-tier first looks that met the 6-hour clock
--   first pass   approved orders the client approved with no revision round
--   credits      late-order credits granted (not pending, not rejected)
--   claims       spec claims upheld
CREATE OR REPLACE FUNCTION public.compute_public_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz := now() - interval '30 days';
BEGIN
  IF app.current_clerk_id() IS NOT NULL AND NOT app.is_admin() THEN
    RAISE EXCEPTION 'only an admin may compute the stats';
  END IF;
  INSERT INTO public.public_stats
    (week_start, designs_delivered, first_look_on_time_pct, first_pass_approval_pct, late_credits_issued, claims_upheld)
  SELECT date_trunc('week', now())::date,
    (SELECT count(DISTINCT a.entity_id)::integer FROM audit.audit_log a
      WHERE a.entity_type = 'order' AND a.action = 'ORDER_STATUS_CHANGED' AND a.payload ->> 'to' = 'DELIVERED'
        AND a.created_at > v_from),
    (SELECT round(100.0 * count(*) FILTER (WHERE o.sla_status = 'met') / nullif(count(*), 0))::integer
       FROM public.orders o
      WHERE o.tier = 'standard' AND o.sla_status IN ('met', 'breached', 'breached_credited') AND o.sla_due_at > v_from),
    (SELECT round(100.0 * count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.revision_requests r WHERE r.order_id = ap.entity_id))
                  / nullif(count(*), 0))::integer
       FROM (SELECT DISTINCT a.entity_id FROM audit.audit_log a
              WHERE a.entity_type = 'order' AND a.action = 'ORDER_STATUS_CHANGED' AND a.payload ->> 'to' = 'APPROVED'
                AND a.created_at > v_from) ap),
    (SELECT count(*)::integer FROM public.client_credits c
      WHERE c.kind = 'sla_credit' AND c.status IN ('apply_next', 'refunded', 'partial', 'applied') AND c.decided_at > v_from),
    (SELECT count(*)::integer FROM public.spec_claims c WHERE c.status = 'upheld' AND c.decided_at > v_from)
  ON CONFLICT (week_start) DO UPDATE SET
    computed_at = now(), designs_delivered = EXCLUDED.designs_delivered,
    first_look_on_time_pct = EXCLUDED.first_look_on_time_pct,
    first_pass_approval_pct = EXCLUDED.first_pass_approval_pct,
    late_credits_issued = EXCLUDED.late_credits_issued, claims_upheld = EXCLUDED.claims_upheld;
END
$$;

-- Anyone, but only while public_stats is on (DECISIONS §12). An admin
-- always sees it, to check the numbers before turning the flag on.
CREATE OR REPLACE FUNCTION public.public_stats_latest()
RETURNS TABLE (week_start date, computed_at timestamptz, designs_delivered integer, first_look_on_time_pct integer,
               first_pass_approval_pct integer, late_credits_issued integer, claims_upheld integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.week_start, s.computed_at, s.designs_delivered, s.first_look_on_time_pct, s.first_pass_approval_pct,
         s.late_credits_issued, s.claims_upheld
  FROM public.public_stats s
  WHERE EXISTS (SELECT 1 FROM public.feature_flags f WHERE f.key = 'public_stats' AND f.enabled)
     OR app.is_admin()
  ORDER BY s.week_start DESC
  LIMIT 1
$$;

-- Weekly, Monday 06:00 UTC, where pg_cron exists (as with sla_sweep).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('public-stats', '0 6 * * 1', 'SELECT public.compute_public_stats()');
  END IF;
END
$$;

REVOKE ALL ON preview_links, spec_claims, public_stats FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_client_logo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_preview_link(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_preview_link(text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_preview_links(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_window(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_spec_claim(text, text, text, text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_window_for(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_spec_claim(text, boolean, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_claims(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claims_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_public_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_stats_latest() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.my_approved_order(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.delivered_at(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_client_logo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_preview_link(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_preview_link(text, boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_preview_links(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_by_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_window(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_spec_claim(text, text, text, text, text, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_spec_claim(text, boolean, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_claims(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claims_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_public_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_stats_latest() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.my_approved_order(text) TO authenticated, service_role;
