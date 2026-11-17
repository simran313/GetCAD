-- =============================================================================
-- 0071: outreach research — finding prospects by hand from public sources
-- (owner, 17 Nov 2026; DECISIONS 1.34).
--
--   1. Research areas: a city and a business type ("custom jewelers in
--      Austin, TX"), with a status and who is working it, so two people never
--      research the same ground. Shared by everyone in outreach.
--   2. Two things research adds to a prospect: a real detail (it finishes
--      "I saw …" in message 1 and fills the template's {detail}) and a fit
--      grade (A strong, B maybe, C weak). Today offers A before B before C.
--   3. Repeats are also caught by website domain, and a live check tells the
--      researcher a business is already in outreach or a client before they
--      spend time on it.
--
-- Touches only the outreach objects of 0069–0070.
-- =============================================================================

CREATE TABLE public.outreach_areas (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  segment    text        NOT NULL CHECK (segment IN
                           ('RETAIL_JEWELER', 'MANUFACTURER', 'BRAND_WHOLESALER', 'DESIGN_STUDIO', 'OTHER')),
  city       text        NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 80),
  region     text        CHECK (region IS NULL OR char_length(region) <= 80),
  country    text        NOT NULL DEFAULT 'United States' CHECK (char_length(btrim(country)) BETWEEN 2 AND 80),
  status     text        NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
  owner_id   text        REFERENCES public.users (id) ON DELETE RESTRICT,
  notes      text        CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outreach_areas_place_key
  ON public.outreach_areas (segment, lower(city), lower(coalesce(region, '')), lower(country));

ALTER TABLE public.outreach_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_areas FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_areas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outreach_areas TO service_role;

ALTER TABLE public.outreach_contacts
  ADD COLUMN detail  text CHECK (detail IS NULL OR char_length(detail) <= 300),
  ADD COLUMN fit     text CHECK (fit IS NULL OR fit IN ('A', 'B', 'C')),
  ADD COLUMN area_id text REFERENCES public.outreach_areas (id) ON DELETE SET NULL,
  -- The website's domain, to spot the same business found twice.
  ADD COLUMN website_key text GENERATED ALWAYS AS (
    nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(website, '')), '^[a-zA-Z]+://', ''), '^www\.|[:/?#].*$', '', 'g')), '')
  ) STORED;

CREATE INDEX outreach_contacts_website_idx ON public.outreach_contacts (website_key) WHERE website_key IS NOT NULL;
CREATE INDEX outreach_contacts_area_idx    ON public.outreach_contacts (area_id) WHERE area_id IS NOT NULL;

-- ----------------------------------------------------- cleaning, repeats --

-- 0069's cleaning, plus the detail and the fit grade.
CREATE OR REPLACE FUNCTION app.outreach_clean(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_email     text := lower(nullif(btrim(regexp_replace(coalesce(p_row ->> 'email', ''), '^mailto:', '', 'i')), ''));
  v_insta     text := nullif(btrim(coalesce(p_row ->> 'instagram', '')), '');
  v_segment   text := upper(nullif(btrim(coalesce(p_row ->> 'segment', '')), ''));
  v_fit       text := upper(left(nullif(btrim(coalesce(p_row ->> 'fit', '')), ''), 1));
  v_tags      text[];
  v_business  text := left(nullif(btrim(coalesce(p_row ->> 'business_name', '')), ''), 200);
  v_contact   text := left(nullif(btrim(coalesce(p_row ->> 'contact_name', '')), ''), 120);
  v_phone     text := left(nullif(btrim(coalesce(p_row ->> 'phone', '')), ''), 40);
  v_whatsapp  text := left(nullif(btrim(coalesce(p_row ->> 'whatsapp', '')), ''), 40);
  v_linkedin  text := left(nullif(btrim(coalesce(p_row ->> 'linkedin', '')), ''), 300);
  v_error     text;
BEGIN
  IF v_email IS NOT NULL AND (char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    v_error := 'email is not valid';
  END IF;

  IF v_insta IS NOT NULL THEN
    v_insta := lower(regexp_replace(regexp_replace(v_insta, '^(https?://)?(www\.)?instagram\.com/', '', 'i'), '^@|/.*$', '', 'g'));
    v_insta := left(nullif(v_insta, ''), 120);
  END IF;

  IF v_segment IS NOT NULL AND v_segment NOT IN ('RETAIL_JEWELER', 'MANUFACTURER', 'BRAND_WHOLESALER', 'DESIGN_STUDIO', 'OTHER') THEN
    v_segment := CASE
      WHEN v_segment ~ 'MANUFACTUR|FACTORY|CASTING|TRADE' THEN 'MANUFACTURER'
      WHEN v_segment ~ 'WHOLESAL|BRAND|DISTRIBUT' THEN 'BRAND_WHOLESALER'
      WHEN v_segment ~ 'STUDIO|DESIGN' THEN 'DESIGN_STUDIO'
      WHEN v_segment ~ 'JEWEL|RETAIL|STORE|SHOP|BRIDAL|CUSTOM' THEN 'RETAIL_JEWELER'
      ELSE 'OTHER'
    END;
  END IF;
  IF v_fit IS NOT NULL AND v_fit NOT IN ('A', 'B', 'C') THEN
    v_fit := CASE WHEN p_row ->> 'fit' ~* 'strong|high|great|1' THEN 'A'
                  WHEN p_row ->> 'fit' ~* 'weak|low|poor|3' THEN 'C'
                  ELSE 'B' END;
  END IF;

  IF jsonb_typeof(p_row -> 'tags') = 'array' THEN
    SELECT coalesce(array_agg(DISTINCT left(lower(btrim(t)), 40)) FILTER (WHERE btrim(t) <> ''), '{}')
      INTO v_tags FROM jsonb_array_elements_text(p_row -> 'tags') t;
  ELSE
    SELECT coalesce(array_agg(DISTINCT left(lower(btrim(t)), 40)) FILTER (WHERE btrim(t) <> ''), '{}')
      INTO v_tags FROM regexp_split_to_table(coalesce(p_row ->> 'tags', ''), '[,;]') t;
  END IF;
  v_tags := v_tags[1:20];

  IF v_error IS NULL AND coalesce(v_business, v_contact, v_email) IS NULL THEN
    v_error := 'needs a business name, a contact name or an email';
  END IF;
  IF v_error IS NULL AND coalesce(v_email, v_phone, v_whatsapp, v_insta, v_linkedin) IS NULL THEN
    v_error := 'needs a way to reach them: email, phone, WhatsApp, Instagram or LinkedIn';
  END IF;

  RETURN jsonb_build_object(
    'business_name', v_business,
    'contact_name',  v_contact,
    'email',         v_email,
    'phone',         v_phone,
    'whatsapp',      v_whatsapp,
    'instagram',     v_insta,
    'linkedin',      v_linkedin,
    'website',       left(nullif(btrim(coalesce(p_row ->> 'website', '')), ''), 300),
    'city',          left(nullif(btrim(coalesce(p_row ->> 'city', '')), ''), 80),
    'region',        left(nullif(btrim(coalesce(p_row ->> 'region', '')), ''), 80),
    'country',       left(nullif(btrim(coalesce(p_row ->> 'country', '')), ''), 80),
    'segment',       v_segment,
    'tags',          to_jsonb(v_tags),
    'notes',         left(nullif(btrim(coalesce(p_row ->> 'notes', '')), ''), 4000),
    'source',        left(nullif(btrim(coalesce(p_row ->> 'source', '')), ''), 200),
    'detail',        left(nullif(btrim(coalesce(p_row ->> 'detail', '')), ''), 300),
    'fit',           v_fit,
    'error',         v_error
  );
END
$$;

-- What a cleaned row matches, and on what: {"state": "CLIENT" | "DUPLICATE"
-- | null, "by": "email" | "phone" | "instagram" | "website"}. A website on a
-- shared platform (Instagram, Etsy, Facebook …) is not a business's own
-- domain and is not compared.
CREATE OR REPLACE FUNCTION app.outreach_match(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone    text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  v_whatsapp text := nullif(regexp_replace(coalesce(p ->> 'whatsapp', ''), '[^0-9]', '', 'g'), '');
  v_site     text := nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(p ->> 'website', '')), '^[a-zA-Z]+://', ''), '^www\.|[:/?#].*$', '', 'g')), '');
BEGIN
  IF p ->> 'email' IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_profiles cp WHERE lower(cp.email) = p ->> 'email' AND cp.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('state', 'CLIENT', 'by', 'email');
  END IF;
  IF p ->> 'email' IS NOT NULL AND EXISTS (SELECT 1 FROM public.outreach_contacts c WHERE c.email = p ->> 'email') THEN
    RETURN jsonb_build_object('state', 'DUPLICATE', 'by', 'email');
  END IF;
  IF (length(v_phone) >= 7 AND EXISTS (
        SELECT 1 FROM public.outreach_contacts c WHERE c.phone_key = v_phone OR c.whatsapp_key = v_phone))
     OR (length(v_whatsapp) >= 7 AND EXISTS (
        SELECT 1 FROM public.outreach_contacts c WHERE c.phone_key = v_whatsapp OR c.whatsapp_key = v_whatsapp)) THEN
    RETURN jsonb_build_object('state', 'DUPLICATE', 'by', 'phone');
  END IF;
  IF p ->> 'instagram' IS NOT NULL AND EXISTS (SELECT 1 FROM public.outreach_contacts c WHERE c.instagram = p ->> 'instagram') THEN
    RETURN jsonb_build_object('state', 'DUPLICATE', 'by', 'instagram');
  END IF;
  IF v_site IS NOT NULL
     AND v_site !~ '(^|\.)(instagram|facebook|fb|etsy|linktr|linkedin|google|goo|yelp|tiktok|pinterest|twitter|x|youtube|amazon|ebay|wa|whatsapp)\.(com|ee|gl|me)$'
     AND EXISTS (SELECT 1 FROM public.outreach_contacts c WHERE c.website_key = v_site) THEN
    RETURN jsonb_build_object('state', 'DUPLICATE', 'by', 'website');
  END IF;
  RETURN jsonb_build_object('state', NULL, 'by', NULL);
END
$$;

CREATE OR REPLACE FUNCTION app.outreach_conflict(p jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.outreach_match(p) ->> 'state'
$$;

-- 0069's insert, plus the detail, the fit grade and the research area.
DROP FUNCTION app.outreach_insert(jsonb, text, text, text, text, text);

CREATE OR REPLACE FUNCTION app.outreach_insert(
  p          jsonb,
  p_kind     text,
  p_sender   text,
  p_owner    text,
  p_import   text,
  p_activity text,
  p_area     text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
BEGIN
  INSERT INTO public.outreach_contacts
    (kind, business_name, contact_name, email, phone, whatsapp, instagram, linkedin, website,
     city, region, country, segment, tags, notes, source, detail, fit, area_id, sender_id, owner_id, import_id, created_by)
  VALUES
    (p_kind, p ->> 'business_name', p ->> 'contact_name', p ->> 'email', p ->> 'phone', p ->> 'whatsapp',
     p ->> 'instagram', p ->> 'linkedin', p ->> 'website', p ->> 'city', p ->> 'region', p ->> 'country',
     p ->> 'segment', ARRAY(SELECT jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))),
     p ->> 'notes', p ->> 'source', p ->> 'detail', p ->> 'fit', p_area,
     p_sender, p_owner, p_import, app.current_clerk_id())
  RETURNING id INTO v_id;

  INSERT INTO public.outreach_activities (contact_id, kind, sender_id, actor_id, body)
  VALUES (v_id, p_activity, p_sender, app.current_clerk_id(), p ->> 'source');
  RETURN v_id;
END
$$;

-- -------------------------------------------------------------- contacts --

-- 0069's add, plus a research area (p_fields.area_id). With no sender named,
-- a prospect found by research goes to the least-used active email sender
-- for its list, as an import would.
CREATE OR REPLACE FUNCTION public.outreach_add_contact(p_kind text, p_fields jsonb, p_sender_id text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin  boolean := app.outreach_access();
  v_me     text := app.current_clerk_id();
  v_clean  jsonb := app.outreach_clean(p_fields);
  v_owner  text := v_me;
  v_area   text := nullif(p_fields ->> 'area_id', '');
  v_sender public.outreach_senders%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('EXISTING', 'PROSPECT') THEN RAISE EXCEPTION 'choose which list: existing contacts or prospects'; END IF;
  IF v_clean ->> 'error' IS NOT NULL THEN RAISE EXCEPTION '%', v_clean ->> 'error'; END IF;
  CASE app.outreach_conflict(v_clean)
    WHEN 'CLIENT' THEN RAISE EXCEPTION 'this email belongs to a client already';
    WHEN 'DUPLICATE' THEN RAISE EXCEPTION 'this contact is already in outreach';
    ELSE NULL;
  END CASE;
  IF v_area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.outreach_areas a WHERE a.id = v_area) THEN
    RAISE EXCEPTION 'no such research area';
  END IF;

  IF p_sender_id IS NOT NULL THEN
    SELECT * INTO v_sender FROM public.outreach_senders s
    WHERE s.id = p_sender_id AND (v_admin OR s.owner_id = v_me);
    IF NOT FOUND THEN RAISE EXCEPTION 'no such sender'; END IF;
  ELSIF v_area IS NOT NULL THEN
    SELECT s.* INTO v_sender FROM public.outreach_senders s
    WHERE s.active AND s.channel = 'EMAIL' AND s.for_kind IN (p_kind, 'ANY') AND (v_admin OR s.owner_id = v_me)
    ORDER BY (SELECT count(*) FROM public.outreach_contacts c WHERE c.sender_id = s.id), s.created_at
    LIMIT 1;
  END IF;
  IF v_admin AND v_sender.owner_id IS NOT NULL THEN v_owner := v_sender.owner_id; END IF;

  RETURN app.outreach_insert(v_clean, p_kind, v_sender.id, v_owner, NULL, 'CREATED', v_area);
END
$$;

-- 0070's edit, plus the detail and the fit grade.
CREATE OR REPLACE FUNCTION public.outreach_update_contact(p_id text, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      public.outreach_contacts%ROWTYPE := app.outreach_contact_for_update(p_id);
  v_merged jsonb;
  v_clean  jsonb;
BEGIN
  v_merged := to_jsonb(v_c) || coalesce(p_fields, '{}'::jsonb);
  v_clean := app.outreach_clean(v_merged);
  IF v_clean ->> 'error' IS NOT NULL THEN RAISE EXCEPTION '%', v_clean ->> 'error'; END IF;
  IF v_clean ->> 'email' IS DISTINCT FROM v_c.email AND v_clean ->> 'email' IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.outreach_contacts c WHERE c.email = v_clean ->> 'email' AND c.id <> v_c.id
  ) THEN
    RAISE EXCEPTION 'another contact has this email';
  END IF;

  UPDATE public.outreach_contacts SET
    business_name = v_clean ->> 'business_name', contact_name = v_clean ->> 'contact_name',
    email = v_clean ->> 'email', phone = v_clean ->> 'phone', whatsapp = v_clean ->> 'whatsapp',
    instagram = v_clean ->> 'instagram', linkedin = v_clean ->> 'linkedin', website = v_clean ->> 'website',
    city = v_clean ->> 'city', region = v_clean ->> 'region', country = v_clean ->> 'country',
    segment = v_clean ->> 'segment', tags = ARRAY(SELECT jsonb_array_elements_text(v_clean -> 'tags')),
    notes = v_clean ->> 'notes', source = v_clean ->> 'source',
    detail = v_clean ->> 'detail', fit = v_clean ->> 'fit',
    kind = CASE WHEN p_fields ->> 'kind' IN ('EXISTING', 'PROSPECT') THEN p_fields ->> 'kind' ELSE kind END,
    updated_at = now()
  WHERE id = v_c.id;

  INSERT INTO public.outreach_activities (contact_id, kind, actor_id)
  VALUES (v_c.id, 'EDITED', app.current_clerk_id());
END
$$;

-- Before researching a business: is it already in outreach or a client?
CREATE OR REPLACE FUNCTION public.outreach_check(p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.outreach_access();
  RETURN app.outreach_match(app.outreach_clean(coalesce(p_fields, '{}'::jsonb)));
END
$$;

-- --------------------------------------------------------------- areas --

-- Every research area, with what it has produced so far. Shared by everyone
-- in outreach, so two people do not research the same place.
CREATE OR REPLACE FUNCTION public.outreach_areas_list()
RETURNS TABLE (
  id text, segment text, city text, region text, country text, status text, owner_id text, owner_name text,
  notes text, prospects bigint, contacted bigint, replied bigint, added_7d bigint, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.outreach_access();
  RETURN QUERY
  SELECT a.id, a.segment, a.city, a.region, a.country, a.status, a.owner_id, sp.first_name, a.notes,
         count(c.id), count(c.id) FILTER (WHERE c.touches > 0), count(c.id) FILTER (WHERE c.replied_at IS NOT NULL),
         count(c.id) FILTER (WHERE c.created_at >= now() - interval '7 days'), a.updated_at
  FROM public.outreach_areas a
  LEFT JOIN public.outreach_contacts c ON c.area_id = a.id
  LEFT JOIN public.staff_profiles sp ON sp.user_id = a.owner_id
  GROUP BY a.id, sp.first_name
  ORDER BY CASE a.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'TODO' THEN 1 ELSE 2 END, a.updated_at DESC;
END
$$;

-- Add (p_id NULL) or change an area. A rep works an area as its owner: they
-- may add one for themselves, claim an unowned one, and change their own;
-- an admin changes any and hands it to anyone with SALES.
CREATE OR REPLACE FUNCTION public.outreach_save_area(
  p_id       text,
  p_segment  text,
  p_city     text,
  p_region   text,
  p_country  text,
  p_status   text,
  p_owner_id text,
  p_notes    text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_me    text := app.current_clerk_id();
  v_owner text := p_owner_id;
  v_area  public.outreach_areas%ROWTYPE;
  v_id    text;
BEGIN
  IF NOT v_admin THEN
    IF v_owner IS NOT NULL AND v_owner <> v_me THEN RAISE EXCEPTION 'only an admin may hand an area to someone else'; END IF;
    v_owner := v_me;
  ELSIF v_owner IS NOT NULL AND NOT app.user_has_role(v_owner, 'SALES') THEN
    RAISE EXCEPTION 'an area can be handed only to someone with the SALES role';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.outreach_areas (segment, city, region, country, status, owner_id, notes, created_by)
    VALUES (p_segment, btrim(p_city), nullif(btrim(coalesce(p_region, '')), ''), coalesce(nullif(btrim(coalesce(p_country, '')), ''), 'United States'),
            coalesce(p_status, 'TODO'), v_owner, nullif(btrim(coalesce(p_notes, '')), ''), v_me)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_area FROM public.outreach_areas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such research area'; END IF;
    IF NOT v_admin AND v_area.owner_id IS NOT NULL AND v_area.owner_id <> v_me THEN
      RAISE EXCEPTION 'someone else is researching this area';
    END IF;
    UPDATE public.outreach_areas SET
      segment = p_segment, city = btrim(p_city), region = nullif(btrim(coalesce(p_region, '')), ''),
      country = coalesce(nullif(btrim(coalesce(p_country, '')), ''), 'United States'),
      status = coalesce(p_status, status), owner_id = v_owner, notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'that area is already on the list';
END
$$;

-- What research produced: prospects added today by the caller, and in the
-- last 7 days by each person.
CREATE OR REPLACE FUNCTION public.outreach_research_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_me    text := app.current_clerk_id();
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
BEGIN
  RETURN jsonb_build_object(
    'mine_today', (SELECT count(*) FROM public.outreach_contacts c
                   WHERE c.created_by = v_me AND c.kind = 'PROSPECT' AND c.import_id IS NULL AND c.created_at >= v_today),
    'with_detail', (SELECT count(*) FROM public.outreach_contacts c
                    WHERE c.kind = 'PROSPECT' AND c.detail IS NOT NULL AND (v_admin OR c.owner_id = v_me)),
    'prospects', (SELECT count(*) FROM public.outreach_contacts c
                  WHERE c.kind = 'PROSPECT' AND (v_admin OR c.owner_id = v_me)),
    'by_person', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', coalesce(sp.first_name, 'Teammate'), 'n', x.n) ORDER BY x.n DESC), '[]'::jsonb)
                  FROM (SELECT c.created_by, count(*) AS n FROM public.outreach_contacts c
                        WHERE c.kind = 'PROSPECT' AND c.import_id IS NULL AND c.created_at >= now() - interval '7 days'
                          AND (v_admin OR c.created_by = v_me)
                        GROUP BY c.created_by) x
                  LEFT JOIN public.staff_profiles sp ON sp.user_id = x.created_by)
  );
END
$$;

-- ---------------------------------------------------------------- today --

-- 0070's Today, plus the detail and fit on each contact; new contacts are
-- offered strongest fit first (A, B, ungraded, C), then oldest first.
CREATE OR REPLACE FUNCTION public.outreach_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_me    text := app.current_clerk_id();
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  v_end   timestamptz := v_start + interval '1 day';
BEGIN
  RETURN (
    WITH mine AS (
      SELECT c.* FROM public.outreach_contacts c WHERE v_admin OR c.owner_id = v_me
    ),
    senders AS (
      SELECT s.*,
             (SELECT count(*) FROM public.outreach_activities a
              WHERE a.sender_id = s.id AND a.kind = 'SENT' AND a.created_at >= v_start)::integer AS sent_today,
             (SELECT count(*) FROM mine m
              WHERE m.sender_id = s.id AND m.next_follow_up_at < v_end AND NOT m.do_not_contact
                AND m.stage <> 'NOT_INTERESTED')::integer AS due
      FROM public.outreach_senders s
      WHERE s.active AND (v_admin OR s.owner_id = v_me)
    ),
    due AS (
      SELECT m.*, m.next_follow_up_at AS sort_at, 0 AS fit_rank FROM mine m
      WHERE m.next_follow_up_at < v_end AND NOT m.do_not_contact AND m.stage <> 'NOT_INTERESTED'
      ORDER BY m.next_follow_up_at
      LIMIT 200
    ),
    fresh AS (
      SELECT x.* FROM senders s
      CROSS JOIN LATERAL (
        SELECT m.*, m.created_at AS sort_at,
               CASE m.fit WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 3 ELSE 2 END AS fit_rank
        FROM mine m
        WHERE m.sender_id = s.id AND m.touches = 0 AND m.stage = 'NEW' AND NOT m.do_not_contact
          AND m.next_follow_up_at IS NULL
          AND CASE s.channel
                WHEN 'EMAIL' THEN m.email IS NOT NULL
                WHEN 'WHATSAPP' THEN coalesce(m.whatsapp, m.phone) IS NOT NULL
                WHEN 'INSTAGRAM' THEN m.instagram IS NOT NULL
                ELSE m.linkedin IS NOT NULL
              END
        ORDER BY CASE m.fit WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 3 ELSE 2 END, m.created_at, m.id
        LIMIT greatest(s.daily_limit - s.sent_today - s.due, 0)
      ) x
    ),
    shaped AS (
      SELECT 'due' AS bucket, d.* FROM due d
      UNION ALL
      SELECT 'start', f.* FROM fresh f
    ),
    items AS (
      SELECT sh.bucket, sh.sort_at, sh.fit_rank, jsonb_build_object(
        'id', sh.id, 'kind', sh.kind, 'segment', sh.segment, 'business_name', sh.business_name,
        'contact_name', sh.contact_name, 'email', sh.email, 'phone', sh.phone, 'whatsapp', sh.whatsapp,
        'instagram', sh.instagram, 'linkedin', sh.linkedin, 'city', sh.city, 'stage', sh.stage,
        'touches', sh.touches, 'next_follow_up_at', sh.next_follow_up_at, 'last_contacted_at', sh.last_contacted_at,
        'detail', sh.detail, 'fit', sh.fit,
        'step', CASE WHEN sh.bucket = 'start' THEN 1 ELSE least(sh.touches + 1, 3) END,
        'sender', (SELECT jsonb_build_object('id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address,
                                             'signature', s.signature)
                   FROM public.outreach_senders s WHERE s.id = sh.sender_id)) AS item
      FROM shaped sh
    )
    SELECT jsonb_build_object(
      'is_admin', v_admin,
      'due', coalesce((SELECT jsonb_agg(i.item ORDER BY i.sort_at) FROM items i WHERE i.bucket = 'due'), '[]'::jsonb),
      'start', coalesce((SELECT jsonb_agg(i.item ORDER BY i.fit_rank, i.sort_at) FROM items i WHERE i.bucket = 'start'), '[]'::jsonb),
      'senders', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address, 'daily_limit', s.daily_limit,
          'sent_today', s.sent_today, 'due', s.due) ORDER BY s.label) FROM senders s), '[]'::jsonb),
      'no_sender', (SELECT count(*) FROM mine m WHERE m.sender_id IS NULL AND m.touches = 0 AND NOT m.do_not_contact)
    )
  );
END
$$;

-- --------------------------------------------------- templates use {detail} --

-- The seeded templates that asked for "[a real detail]" now take the
-- prospect's researched detail. Only seeds nobody has edited.
UPDATE public.outreach_templates SET
  body = replace(body, '[a real detail: a piece they posted, their custom ring page]', '{detail}')
WHERE created_by IS NULL AND updated_at = created_at AND name = 'Jeweler · message 1';
UPDATE public.outreach_templates SET
  body = replace(body, 'loved [a specific piece or launch]', 'loved {detail}')
WHERE created_by IS NULL AND updated_at = created_at AND name = 'Brand · message 1';
UPDATE public.outreach_templates SET
  body = replace(body, 'I came across {business}: [a real detail].', 'I came across {business} and saw {detail}.')
WHERE created_by IS NULL AND updated_at = created_at AND name = 'Prospect · WhatsApp';

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION app.outreach_clean(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_match(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_conflict(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_insert(jsonb, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.outreach_add_contact(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_update_contact(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_check(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_areas_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_save_area(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_research_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_today() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.outreach_add_contact(text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_update_contact(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_check(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_areas_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_save_area(text, text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_research_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_today() TO authenticated, service_role;
