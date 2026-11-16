-- =============================================================================
-- 0069: outreach — contacts, senders and the record of every touch (owner,
-- 16 Nov 2026; DECISIONS 1.32).
--
-- The team's own record of who it has written to, from which address, and
-- what came back. Two lists in one table:
--
--   EXISTING  people the business already knows (the owner's own contacts);
--   PROSPECT  businesses found by research from public sources.
--
-- Senders are the 4–5 addresses (and WhatsApp or Instagram handles) the team
-- writes from. Each can later be handed to one person (its owner); contacts
-- are spread over the active senders on import so deliverability and replies
-- can be compared address by address.
--
-- Who sees what: an admin (SALES + OPS + FINANCE) sees and does everything; a
-- SALES-only teammate (a rep) sees and works only the contacts they own. No
-- one else, and nothing outside these functions.
--
-- Nothing here changes an existing table, trigger or function. Whether a
-- contact became a client is read, never written: their email is matched to
-- client profiles and orders when a list or the dashboard is opened.
-- =============================================================================

-- ------------------------------------------------------------- tables --

CREATE TABLE public.outreach_senders (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label       text        NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  channel     text        NOT NULL CHECK (channel IN ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'LINKEDIN')),
  address     text        NOT NULL CHECK (char_length(btrim(address)) BETWEEN 3 AND 200),
  -- Which list it writes to: the main domain for people we know, a second
  -- domain for research prospects (docs/marketing/OUTBOUND-KIT.md).
  for_kind    text        NOT NULL DEFAULT 'ANY' CHECK (for_kind IN ('EXISTING', 'PROSPECT', 'ANY')),
  signature   text        CHECK (signature IS NULL OR char_length(signature) <= 1000),
  daily_limit integer     NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 500),
  owner_id    text        REFERENCES public.users (id) ON DELETE RESTRICT,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outreach_senders_address_key ON public.outreach_senders (channel, lower(address));

CREATE TABLE public.outreach_imports (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind             text        NOT NULL CHECK (kind IN ('EXISTING', 'PROSPECT')),
  file_name        text        CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  source           text        CHECK (source IS NULL OR char_length(source) <= 200),
  total            integer     NOT NULL DEFAULT 0,
  added            integer     NOT NULL DEFAULT 0,
  duplicates       integer     NOT NULL DEFAULT 0,
  skipped_clients  integer     NOT NULL DEFAULT 0,
  invalid          integer     NOT NULL DEFAULT 0,
  created_by       text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outreach_contacts (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind              text        NOT NULL CHECK (kind IN ('EXISTING', 'PROSPECT')),
  business_name     text        CHECK (business_name IS NULL OR char_length(business_name) <= 200),
  contact_name      text        CHECK (contact_name IS NULL OR char_length(contact_name) <= 120),
  email             text        CHECK (email IS NULL OR (char_length(email) <= 254 AND email = lower(email)
                                       AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone             text        CHECK (phone IS NULL OR char_length(phone) <= 40),
  whatsapp          text        CHECK (whatsapp IS NULL OR char_length(whatsapp) <= 40),
  instagram         text        CHECK (instagram IS NULL OR char_length(instagram) <= 120),
  linkedin          text        CHECK (linkedin IS NULL OR char_length(linkedin) <= 300),
  website           text        CHECK (website IS NULL OR char_length(website) <= 300),
  city              text        CHECK (city IS NULL OR char_length(city) <= 80),
  region            text        CHECK (region IS NULL OR char_length(region) <= 80),
  country           text        CHECK (country IS NULL OR char_length(country) <= 80),
  segment           text        CHECK (segment IS NULL OR segment IN
                                  ('RETAIL_JEWELER', 'MANUFACTURER', 'BRAND_WHOLESALER', 'DESIGN_STUDIO', 'OTHER')),
  tags              text[]      NOT NULL DEFAULT '{}',
  notes             text        CHECK (notes IS NULL OR char_length(notes) <= 4000),
  source            text        CHECK (source IS NULL OR char_length(source) <= 200),
  stage             text        NOT NULL DEFAULT 'NEW' CHECK (stage IN
                                  ('NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NOT_NOW', 'NOT_INTERESTED')),
  do_not_contact    boolean     NOT NULL DEFAULT false,
  dnc_reason        text        CHECK (dnc_reason IS NULL OR char_length(dnc_reason) <= 300),
  sender_id         text        REFERENCES public.outreach_senders (id) ON DELETE SET NULL,
  owner_id          text        REFERENCES public.users (id) ON DELETE RESTRICT,
  touches           integer     NOT NULL DEFAULT 0,
  last_contacted_at timestamptz,
  replied_at        timestamptz,
  next_follow_up_at timestamptz,
  import_id         text        REFERENCES public.outreach_imports (id) ON DELETE SET NULL,
  created_by        text        NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Keys used to spot the same person twice when there is no email.
  phone_key         text        GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')) STORED,
  whatsapp_key      text        GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g'), '')) STORED,
  CONSTRAINT outreach_contacts_named CHECK (coalesce(business_name, contact_name, email) IS NOT NULL)
);

CREATE UNIQUE INDEX outreach_contacts_email_key ON public.outreach_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX outreach_contacts_phone_idx     ON public.outreach_contacts (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX outreach_contacts_whatsapp_idx  ON public.outreach_contacts (whatsapp_key) WHERE whatsapp_key IS NOT NULL;
CREATE INDEX outreach_contacts_instagram_idx ON public.outreach_contacts (instagram) WHERE instagram IS NOT NULL;
CREATE INDEX outreach_contacts_owner_idx     ON public.outreach_contacts (owner_id, stage);
CREATE INDEX outreach_contacts_sender_idx    ON public.outreach_contacts (sender_id);
CREATE INDEX outreach_contacts_due_idx       ON public.outreach_contacts (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND NOT do_not_contact;

CREATE TABLE public.outreach_activities (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact_id text        NOT NULL REFERENCES public.outreach_contacts (id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN
                           ('IMPORTED', 'CREATED', 'EDITED', 'NOTE', 'SENT', 'REPLIED', 'STAGE', 'ASSIGNED', 'DNC')),
  channel    text        CHECK (channel IS NULL OR channel IN ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'LINKEDIN', 'PHONE', 'IN_PERSON')),
  sender_id  text        REFERENCES public.outreach_senders (id) ON DELETE SET NULL,
  actor_id   text        REFERENCES public.users (id) ON DELETE RESTRICT,
  body       text        CHECK (body IS NULL OR char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outreach_activities_contact_idx ON public.outreach_activities (contact_id, created_at DESC);
CREATE INDEX outreach_activities_sent_idx    ON public.outreach_activities (sender_id, created_at)
  WHERE kind IN ('SENT', 'REPLIED');

-- Locked at once, in the same run as the CREATE (Supabase grants new tables
-- to the API roles by default). policies/0050 states the same, for db:apply.
ALTER TABLE public.outreach_senders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_senders    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.outreach_imports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_imports    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contacts   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.outreach_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_activities FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_senders, public.outreach_imports, public.outreach_contacts, public.outreach_activities
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outreach_senders, public.outreach_imports, public.outreach_contacts, public.outreach_activities
  TO service_role;

-- ------------------------------------------------------------ helpers --

-- Who may use outreach: true for an admin (everything), false for a SALES
-- rep (their own contacts); anyone else is refused.
CREATE OR REPLACE FUNCTION app.outreach_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.is_admin() THEN RETURN true; END IF;
  IF app.has_role('SALES') THEN RETURN false; END IF;
  RAISE EXCEPTION 'outreach is for admins and sales';
END
$$;

-- One contact the caller may work, locked for the change; refuses the rest
-- with the same words, so a rep cannot tell another rep's contact exists.
CREATE OR REPLACE FUNCTION app.outreach_contact_for_update(p_id text)
RETURNS public.outreach_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_c     public.outreach_contacts%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.outreach_contacts c
  WHERE c.id = p_id AND (v_admin OR c.owner_id = app.current_clerk_id())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such contact'; END IF;
  RETURN v_c;
END
$$;

-- A row from a spreadsheet or the add form, cleaned: trimmed, cut to size,
-- email lower-cased, Instagram as a bare handle, the business type read from
-- common words. 'error' says why a row cannot be used.
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
    'error',         v_error
  );
END
$$;

-- Why a cleaned row should not be added: already a client, or already in
-- outreach (by email, phone, WhatsApp or Instagram). NULL when it is new.
CREATE OR REPLACE FUNCTION app.outreach_conflict(p jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone    text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  v_whatsapp text := nullif(regexp_replace(coalesce(p ->> 'whatsapp', ''), '[^0-9]', '', 'g'), '');
BEGIN
  IF p ->> 'email' IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_profiles cp
    WHERE lower(cp.email) = p ->> 'email' AND cp.deleted_at IS NULL
  ) THEN
    RETURN 'CLIENT';
  END IF;

  IF p ->> 'email' IS NOT NULL AND EXISTS (SELECT 1 FROM public.outreach_contacts c WHERE c.email = p ->> 'email') THEN
    RETURN 'DUPLICATE';
  END IF;
  -- Phone numbers are compared by digits; seven at least, so an extension or
  -- a short code does not match a stranger.
  IF length(v_phone) >= 7 AND EXISTS (
    SELECT 1 FROM public.outreach_contacts c WHERE c.phone_key = v_phone OR c.whatsapp_key = v_phone
  ) THEN
    RETURN 'DUPLICATE';
  END IF;
  IF length(v_whatsapp) >= 7 AND EXISTS (
    SELECT 1 FROM public.outreach_contacts c WHERE c.phone_key = v_whatsapp OR c.whatsapp_key = v_whatsapp
  ) THEN
    RETURN 'DUPLICATE';
  END IF;
  IF p ->> 'instagram' IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.outreach_contacts c WHERE c.instagram = p ->> 'instagram'
  ) THEN
    RETURN 'DUPLICATE';
  END IF;
  RETURN NULL;
END
$$;

-- Adds one cleaned, checked row. The caller has already decided the sender
-- and owner.
CREATE OR REPLACE FUNCTION app.outreach_insert(
  p          jsonb,
  p_kind     text,
  p_sender   text,
  p_owner    text,
  p_import   text,
  p_activity text
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
     city, region, country, segment, tags, notes, source, sender_id, owner_id, import_id, created_by)
  VALUES
    (p_kind, p ->> 'business_name', p ->> 'contact_name', p ->> 'email', p ->> 'phone', p ->> 'whatsapp',
     p ->> 'instagram', p ->> 'linkedin', p ->> 'website', p ->> 'city', p ->> 'region', p ->> 'country',
     p ->> 'segment', ARRAY(SELECT jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb))),
     p ->> 'notes', p ->> 'source', p_sender, p_owner, p_import, app.current_clerk_id())
  RETURNING id INTO v_id;

  INSERT INTO public.outreach_activities (contact_id, kind, sender_id, actor_id, body)
  VALUES (v_id, p_activity, p_sender, app.current_clerk_id(), p ->> 'source');
  RETURN v_id;
END
$$;

-- What became of a contact, read from the portal by email: an account, a
-- verified account, placed orders and (admins only) their value.
CREATE OR REPLACE FUNCTION app.outreach_conversion(p_email text, p_admin boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN cl.user_id IS NULL THEN NULL ELSE jsonb_build_object(
    'signed_up_at', cl.created_at,
    'verified',     cl.status = 'ACTIVE',
    'orders',       (SELECT count(*) FROM public.orders o
                     WHERE o.client_id = cl.user_id AND o.status NOT IN ('DRAFT', 'CANCELLED')),
    'first_order_at', (SELECT min(o.created_at) FROM public.orders o
                       WHERE o.client_id = cl.user_id AND o.status NOT IN ('DRAFT', 'CANCELLED')),
    'order_value',  CASE WHEN p_admin THEN (
                      SELECT coalesce(sum(o.price_total), 0) FROM public.orders o
                      WHERE o.client_id = cl.user_id AND o.currency = 'USD'
                        AND o.status NOT IN ('DRAFT', 'SUBMITTED', 'QUOTED', 'CANCELLED', 'REFUNDED')) END
  ) END
  FROM (SELECT NULL::int) one
  LEFT JOIN LATERAL (
    SELECT u.id AS user_id, u.created_at, u.status
    FROM public.client_profiles cp JOIN public.users u ON u.id = cp.user_id
    WHERE p_email IS NOT NULL AND lower(cp.email) = p_email AND cp.deleted_at IS NULL AND u.deleted_at IS NULL
    ORDER BY u.created_at
    LIMIT 1
  ) cl ON true
$$;

-- ------------------------------------------------------------- senders --

CREATE OR REPLACE FUNCTION public.outreach_senders_list()
RETURNS TABLE (
  id text, label text, channel text, address text, for_kind text, signature text, daily_limit integer,
  owner_id text, owner_name text, active boolean, contacts integer, sent_today integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
BEGIN
  RETURN QUERY
  SELECT s.id, s.label, s.channel, s.address, s.for_kind, s.signature, s.daily_limit, s.owner_id,
         sp.first_name, s.active,
         (SELECT count(*)::integer FROM public.outreach_contacts c WHERE c.sender_id = s.id),
         (SELECT count(*)::integer FROM public.outreach_activities a
          WHERE a.sender_id = s.id AND a.kind = 'SENT'
            AND a.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))
  FROM public.outreach_senders s
  LEFT JOIN public.staff_profiles sp ON sp.user_id = s.owner_id
  WHERE v_admin OR s.owner_id = app.current_clerk_id()
  ORDER BY s.active DESC, s.channel, s.label;
END
$$;

-- Add (p_id NULL) or change a sender. Admins only.
CREATE OR REPLACE FUNCTION public.outreach_save_sender(
  p_id          text,
  p_label       text,
  p_channel     text,
  p_address     text,
  p_for_kind    text DEFAULT 'ANY',
  p_signature   text DEFAULT NULL,
  p_daily_limit integer DEFAULT 20,
  p_owner_id    text DEFAULT NULL,
  p_active      boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id      text;
  v_address text := btrim(coalesce(p_address, ''));
BEGIN
  IF NOT app.outreach_access() THEN RAISE EXCEPTION 'only an admin may set up senders'; END IF;
  IF p_channel = 'EMAIL' THEN
    v_address := lower(v_address);
    IF v_address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'the sender email is not valid'; END IF;
  END IF;
  IF p_owner_id IS NOT NULL AND NOT app.user_has_role(p_owner_id, 'SALES') THEN
    RAISE EXCEPTION 'a sender can be handed only to someone with the SALES role';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.outreach_senders (label, channel, address, for_kind, signature, daily_limit, owner_id, active)
    VALUES (btrim(p_label), p_channel, v_address, coalesce(p_for_kind, 'ANY'), nullif(btrim(coalesce(p_signature, '')), ''),
            coalesce(p_daily_limit, 20), p_owner_id, coalesce(p_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.outreach_senders SET
      label = btrim(p_label), channel = p_channel, address = v_address, for_kind = coalesce(p_for_kind, 'ANY'),
      signature = nullif(btrim(coalesce(p_signature, '')), ''), daily_limit = coalesce(p_daily_limit, 20),
      owner_id = p_owner_id, active = coalesce(p_active, true)
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such sender'; END IF;
  END IF;

  PERFORM audit.log_event('OUTREACH_SENDER_SAVED', 'outreach_sender', v_id, app.current_clerk_id(),
                          app.acting_role('SALES'),
                          jsonb_build_object('channel', p_channel, 'owner_id', p_owner_id, 'active', coalesce(p_active, true)));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'that address is already a sender';
END
$$;

-- The people a sender or contact can be handed to: everyone with SALES.
CREATE OR REPLACE FUNCTION public.outreach_team()
RETURNS TABLE (user_id text, name text, is_admin boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.outreach_access() THEN RAISE EXCEPTION 'only an admin may see the team'; END IF;
  RETURN QUERY
  SELECT u.id, coalesce(sp.first_name, 'Teammate ' || right(u.id, 4)),
         app.user_has_role(u.id, 'OPS') AND app.user_has_role(u.id, 'FINANCE')
  FROM public.users u
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE' AND app.user_has_role(u.id, 'SALES')
  ORDER BY 2;
END
$$;

-- ------------------------------------------------------------ contacts --

-- A batch of spreadsheet rows (500 at most a call; the screen sends a large
-- file in parts under one import id). Rows already in outreach, existing
-- clients and unusable rows are counted, not added. With no sender named,
-- each contact goes to the least-used active email sender for its list, so
-- the addresses share the work evenly; the contact's owner is the sender's
-- owner, or whoever imports. A rep imports for themselves, through their own
-- senders.
CREATE OR REPLACE FUNCTION public.outreach_import(
  p_import_id text,
  p_kind      text,
  p_file_name text,
  p_source    text,
  p_sender_id text,
  p_rows      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin     boolean := app.outreach_access();
  v_me        text := app.current_clerk_id();
  v_import    text := p_import_id;
  v_row       jsonb;
  v_clean     jsonb;
  v_conflict  text;
  v_senders   text[];
  v_owners    text[];
  v_loads     integer[];
  v_pick      integer;
  v_sender    text;
  v_owner     text;
  v_added     integer := 0;
  v_dupes     integer := 0;
  v_clients   integer := 0;
  v_invalid   integer := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_n         integer := 0;
BEGIN
  IF p_kind NOT IN ('EXISTING', 'PROSPECT') THEN RAISE EXCEPTION 'choose which list: existing contacts or prospects'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'rows must be a list'; END IF;
  IF jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION '500 rows at most in one part'; END IF;

  IF v_import IS NULL THEN
    INSERT INTO public.outreach_imports (kind, file_name, source, created_by)
    VALUES (p_kind, left(nullif(btrim(coalesce(p_file_name, '')), ''), 200), left(nullif(btrim(coalesce(p_source, '')), ''), 200), v_me)
    RETURNING id INTO v_import;
  ELSIF NOT EXISTS (SELECT 1 FROM public.outreach_imports i WHERE i.id = v_import AND i.created_by = v_me AND i.kind = p_kind) THEN
    RAISE EXCEPTION 'no such import';
  END IF;

  -- The senders to share the rows between, with how many contacts each has.
  IF p_sender_id IS NOT NULL THEN
    SELECT array_agg(s.id), array_agg(s.owner_id), array_agg(0) INTO v_senders, v_owners, v_loads
    FROM public.outreach_senders s
    WHERE s.id = p_sender_id AND s.active AND (v_admin OR s.owner_id = v_me);
    IF v_senders IS NULL THEN RAISE EXCEPTION 'no such active sender'; END IF;
  ELSE
    SELECT array_agg(x.id ORDER BY x.n, x.created_at), array_agg(x.owner_id ORDER BY x.n, x.created_at),
           array_agg(x.n ORDER BY x.n, x.created_at)
      INTO v_senders, v_owners, v_loads
    FROM (
      SELECT s.id, s.owner_id, s.created_at,
             (SELECT count(*)::integer FROM public.outreach_contacts c WHERE c.sender_id = s.id) AS n
      FROM public.outreach_senders s
      WHERE s.active AND s.channel = 'EMAIL' AND s.for_kind IN (p_kind, 'ANY')
        AND (v_admin OR s.owner_id = v_me)
    ) x;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_n := v_n + 1;
    v_clean := app.outreach_clean(v_row || jsonb_build_object('source', coalesce(v_row ->> 'source', p_source)));
    IF v_clean ->> 'error' IS NOT NULL THEN
      v_invalid := v_invalid + 1;
      IF jsonb_array_length(v_errors) < 50 THEN
        v_errors := v_errors || jsonb_build_object('row', coalesce((v_row ->> '_row')::integer, v_n), 'error', v_clean ->> 'error');
      END IF;
      CONTINUE;
    END IF;

    v_conflict := app.outreach_conflict(v_clean);
    IF v_conflict = 'CLIENT' THEN v_clients := v_clients + 1; CONTINUE; END IF;
    IF v_conflict = 'DUPLICATE' THEN v_dupes := v_dupes + 1; CONTINUE; END IF;

    v_sender := NULL;
    v_owner := v_me;
    IF v_senders IS NOT NULL THEN
      SELECT i INTO v_pick FROM generate_subscripts(v_loads, 1) i ORDER BY v_loads[i], i LIMIT 1;
      v_sender := v_senders[v_pick];
      v_loads[v_pick] := v_loads[v_pick] + 1;
      IF v_admin THEN v_owner := coalesce(v_owners[v_pick], v_me); END IF;
    END IF;

    PERFORM app.outreach_insert(v_clean, p_kind, v_sender, v_owner, v_import, 'IMPORTED');
    v_added := v_added + 1;
  END LOOP;

  UPDATE public.outreach_imports SET
    total = total + v_n, added = added + v_added, duplicates = duplicates + v_dupes,
    skipped_clients = skipped_clients + v_clients, invalid = invalid + v_invalid
  WHERE id = v_import;

  PERFORM audit.log_event('OUTREACH_IMPORTED', 'outreach_import', v_import, v_me, app.acting_role('SALES'),
                          jsonb_build_object('kind', p_kind, 'rows', v_n, 'added', v_added));
  RETURN jsonb_build_object(
    'import_id', v_import, 'total', v_n, 'added', v_added, 'duplicates', v_dupes,
    'skipped_clients', v_clients, 'invalid', v_invalid, 'errors', v_errors
  );
END
$$;

-- One contact from the add form; says plainly when it is a client or already
-- in outreach.
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
  v_sender public.outreach_senders%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('EXISTING', 'PROSPECT') THEN RAISE EXCEPTION 'choose which list: existing contacts or prospects'; END IF;
  IF v_clean ->> 'error' IS NOT NULL THEN RAISE EXCEPTION '%', v_clean ->> 'error'; END IF;
  CASE app.outreach_conflict(v_clean)
    WHEN 'CLIENT' THEN RAISE EXCEPTION 'this email belongs to a client already';
    WHEN 'DUPLICATE' THEN RAISE EXCEPTION 'this contact is already in outreach';
    ELSE NULL;
  END CASE;

  IF p_sender_id IS NOT NULL THEN
    SELECT * INTO v_sender FROM public.outreach_senders s
    WHERE s.id = p_sender_id AND (v_admin OR s.owner_id = v_me);
    IF NOT FOUND THEN RAISE EXCEPTION 'no such sender'; END IF;
    IF v_admin AND v_sender.owner_id IS NOT NULL THEN v_owner := v_sender.owner_id; END IF;
  END IF;

  RETURN app.outreach_insert(v_clean, p_kind, p_sender_id, v_owner, NULL, 'CREATED');
END
$$;

-- The working list, filtered; total is the count before paging.
CREATE OR REPLACE FUNCTION public.outreach_contacts_list(
  p_kind      text    DEFAULT NULL,
  p_stage     text    DEFAULT NULL,
  p_sender_id text    DEFAULT NULL,
  p_owner_id  text    DEFAULT NULL,
  p_search    text    DEFAULT NULL,
  p_due       boolean DEFAULT false,
  p_limit     integer DEFAULT 50,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE (
  id text, kind text, business_name text, contact_name text, email text, phone text, whatsapp text,
  instagram text, city text, region text, country text, segment text, tags text[], stage text,
  do_not_contact boolean, sender_id text, sender_label text, owner_id text, owner_name text, touches integer,
  last_contacted_at timestamptz, replied_at timestamptz, next_follow_up_at timestamptz, created_at timestamptz,
  conversion jsonb, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_me    text := app.current_clerk_id();
  v_q     text := nullif(lower(btrim(coalesce(p_search, ''))), '');
BEGIN
  RETURN QUERY
  WITH hits AS (
    SELECT c.*, count(*) OVER () AS n
    FROM public.outreach_contacts c
    WHERE (v_admin OR c.owner_id = v_me)
      AND (p_kind IS NULL OR c.kind = p_kind)
      AND (p_stage IS NULL OR (p_stage = 'DNC' AND c.do_not_contact) OR (c.stage = p_stage AND p_stage <> 'DNC'))
      AND (p_sender_id IS NULL OR (p_sender_id = 'NONE' AND c.sender_id IS NULL) OR c.sender_id = p_sender_id)
      AND (p_owner_id IS NULL OR c.owner_id = p_owner_id)
      AND (NOT coalesce(p_due, false) OR (c.next_follow_up_at <= now() AND NOT c.do_not_contact))
      AND (v_q IS NULL OR strpos(lower(concat_ws(' ', c.business_name, c.contact_name, c.email, c.city, c.region,
                                                c.country, c.instagram, array_to_string(c.tags, ' '))), v_q) > 0)
    ORDER BY
      CASE WHEN coalesce(p_due, false) THEN c.next_follow_up_at END ASC NULLS LAST,
      c.updated_at DESC, c.id
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200) OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT h.id, h.kind, h.business_name, h.contact_name, h.email, h.phone, h.whatsapp, h.instagram, h.city,
         h.region, h.country, h.segment, h.tags, h.stage, h.do_not_contact, h.sender_id, s.label, h.owner_id,
         sp.first_name, h.touches, h.last_contacted_at, h.replied_at, h.next_follow_up_at, h.created_at,
         app.outreach_conversion(h.email, v_admin), h.n
  FROM hits h
  LEFT JOIN public.outreach_senders s ON s.id = h.sender_id
  LEFT JOIN public.staff_profiles sp ON sp.user_id = h.owner_id
  ORDER BY
    CASE WHEN coalesce(p_due, false) THEN h.next_follow_up_at END ASC NULLS LAST,
    h.updated_at DESC, h.id;
END
$$;

-- One contact, its timeline and what became of them.
CREATE OR REPLACE FUNCTION public.outreach_contact(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_c     public.outreach_contacts%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.outreach_contacts c WHERE c.id = p_id AND (v_admin OR c.owner_id = app.current_clerk_id());
  IF NOT FOUND THEN RAISE EXCEPTION 'no such contact'; END IF;

  RETURN (to_jsonb(v_c) - 'phone_key' - 'whatsapp_key' - 'created_by') || jsonb_build_object(
    'sender', (SELECT jsonb_build_object('id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address,
                                         'signature', s.signature)
               FROM public.outreach_senders s WHERE s.id = v_c.sender_id),
    'owner_name', (SELECT first_name FROM public.staff_profiles WHERE user_id = v_c.owner_id),
    'conversion', app.outreach_conversion(v_c.email, v_admin),
    'activities', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'kind', a.kind, 'channel', a.channel, 'body', a.body, 'created_at', a.created_at,
               'sender_label', s.label, 'actor_name', sp.first_name) ORDER BY a.created_at DESC, a.id), '[]'::jsonb)
      FROM public.outreach_activities a
      LEFT JOIN public.outreach_senders s ON s.id = a.sender_id
      LEFT JOIN public.staff_profiles sp ON sp.user_id = a.actor_id
      WHERE a.contact_id = v_c.id
    )
  );
END
$$;

-- Edit the details. Only the keys given change; an empty value clears it.
CREATE OR REPLACE FUNCTION public.outreach_update_contact(p_id text, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c     public.outreach_contacts%ROWTYPE := app.outreach_contact_for_update(p_id);
  v_merged jsonb;
  v_clean  jsonb;
BEGIN
  v_merged := (to_jsonb(v_c) - 'tags') || jsonb_build_object('tags', to_jsonb(v_c.tags)) || coalesce(p_fields, '{}'::jsonb);
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
    kind = CASE WHEN p_fields ->> 'kind' IN ('EXISTING', 'PROSPECT') THEN p_fields ->> 'kind' ELSE kind END,
    updated_at = now()
  WHERE id = v_c.id;

  INSERT INTO public.outreach_activities (contact_id, kind, actor_id)
  VALUES (v_c.id, 'EDITED', app.current_clerk_id());
END
$$;

-- Record a touch. SENT: a message went out (the contact moves from New to
-- Contacted, and is due again in four days unless a date is given). REPLIED:
-- they answered. NOTE: anything else worth keeping, with an optional
-- follow-up date.
CREATE OR REPLACE FUNCTION public.outreach_log(
  p_id          text,
  p_kind        text,
  p_channel     text DEFAULT NULL,
  p_body        text DEFAULT NULL,
  p_follow_up   timestamptz DEFAULT NULL,
  p_sender_id   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      public.outreach_contacts%ROWTYPE := app.outreach_contact_for_update(p_id);
  v_body   text := left(nullif(btrim(coalesce(p_body, '')), ''), 4000);
  v_sender text := coalesce(p_sender_id, v_c.sender_id);
BEGIN
  IF p_kind NOT IN ('SENT', 'REPLIED', 'NOTE') THEN RAISE EXCEPTION 'record a message sent, a reply or a note'; END IF;
  IF p_sender_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.outreach_senders s
    WHERE s.id = p_sender_id AND (app.outreach_access() OR s.owner_id = app.current_clerk_id())
  ) THEN
    RAISE EXCEPTION 'no such sender';
  END IF;

  IF p_kind = 'SENT' THEN
    IF v_c.do_not_contact THEN RAISE EXCEPTION 'this contact asked not to be contacted'; END IF;
    UPDATE public.outreach_contacts SET
      stage = CASE WHEN stage = 'NEW' THEN 'CONTACTED' ELSE stage END,
      touches = touches + 1,
      last_contacted_at = now(),
      sender_id = coalesce(sender_id, v_sender),
      next_follow_up_at = CASE
        WHEN stage IN ('NEW', 'CONTACTED') THEN coalesce(p_follow_up, now() + interval '4 days')
        ELSE p_follow_up END,
      updated_at = now()
    WHERE id = v_c.id;
  ELSIF p_kind = 'REPLIED' THEN
    UPDATE public.outreach_contacts SET
      stage = CASE WHEN stage IN ('NEW', 'CONTACTED') THEN 'REPLIED' ELSE stage END,
      replied_at = coalesce(replied_at, now()),
      next_follow_up_at = p_follow_up,
      updated_at = now()
    WHERE id = v_c.id;
  ELSE
    IF v_body IS NULL THEN RAISE EXCEPTION 'write the note first'; END IF;
    UPDATE public.outreach_contacts SET
      next_follow_up_at = coalesce(p_follow_up, next_follow_up_at),
      updated_at = now()
    WHERE id = v_c.id;
  END IF;

  INSERT INTO public.outreach_activities (contact_id, kind, channel, sender_id, actor_id, body)
  VALUES (v_c.id, p_kind, p_channel, CASE WHEN p_kind = 'NOTE' THEN NULL ELSE v_sender END,
          app.current_clerk_id(), v_body);
END
$$;

CREATE OR REPLACE FUNCTION public.outreach_set_stage(p_id text, p_stage text, p_follow_up timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c public.outreach_contacts%ROWTYPE := app.outreach_contact_for_update(p_id);
BEGIN
  IF p_stage NOT IN ('NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NOT_NOW', 'NOT_INTERESTED') THEN
    RAISE EXCEPTION 'no such stage';
  END IF;
  IF p_stage = v_c.stage AND p_follow_up IS NULL THEN RETURN; END IF;

  UPDATE public.outreach_contacts SET
    stage = p_stage,
    replied_at = CASE WHEN p_stage IN ('REPLIED', 'INTERESTED') THEN coalesce(replied_at, now()) ELSE replied_at END,
    next_follow_up_at = CASE WHEN p_stage = 'NOT_INTERESTED' THEN NULL ELSE coalesce(p_follow_up, next_follow_up_at) END,
    updated_at = now()
  WHERE id = v_c.id;

  INSERT INTO public.outreach_activities (contact_id, kind, actor_id, body)
  VALUES (v_c.id, 'STAGE', app.current_clerk_id(), v_c.stage || ' → ' || p_stage);
END
$$;

-- Do not contact: kept on file so the same person is never imported or
-- written to again. Lifting it needs a reason too.
CREATE OR REPLACE FUNCTION public.outreach_set_dnc(p_id text, p_dnc boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      public.outreach_contacts%ROWTYPE := app.outreach_contact_for_update(p_id);
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
BEGIN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'say why'; END IF;
  UPDATE public.outreach_contacts SET
    do_not_contact = p_dnc,
    dnc_reason = CASE WHEN p_dnc THEN v_reason END,
    next_follow_up_at = CASE WHEN p_dnc THEN NULL ELSE next_follow_up_at END,
    updated_at = now()
  WHERE id = v_c.id;

  INSERT INTO public.outreach_activities (contact_id, kind, actor_id, body)
  VALUES (v_c.id, 'DNC', app.current_clerk_id(), CASE WHEN p_dnc THEN 'Do not contact: ' ELSE 'Contact again: ' END || v_reason);
  PERFORM audit.log_event('OUTREACH_DNC', 'outreach_contact', v_c.id, app.current_clerk_id(), app.acting_role('SALES'),
                          jsonb_build_object('do_not_contact', p_dnc));
END
$$;

-- Hand contacts to a sender and/or a person (admins). 'NONE' clears it; NULL
-- leaves it as is.
CREATE OR REPLACE FUNCTION public.outreach_assign(p_ids text[], p_sender_id text, p_owner_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n     integer;
  v_label text;
  v_name  text;
BEGIN
  IF NOT app.outreach_access() THEN RAISE EXCEPTION 'only an admin may hand contacts over'; END IF;
  IF coalesce(array_length(p_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'choose contacts first'; END IF;
  IF array_length(p_ids, 1) > 1000 THEN RAISE EXCEPTION '1000 contacts at most at once'; END IF;
  IF p_sender_id IS NULL AND p_owner_id IS NULL THEN RAISE EXCEPTION 'choose a sender or a person'; END IF;
  IF p_sender_id IS NOT NULL AND p_sender_id <> 'NONE' THEN
    SELECT label INTO v_label FROM public.outreach_senders WHERE id = p_sender_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such sender'; END IF;
  END IF;
  IF p_owner_id IS NOT NULL THEN
    IF NOT app.user_has_role(p_owner_id, 'SALES') THEN RAISE EXCEPTION 'contacts can be handed only to someone with the SALES role'; END IF;
    SELECT coalesce(first_name, 'a teammate') INTO v_name FROM public.staff_profiles WHERE user_id = p_owner_id;
  END IF;

  UPDATE public.outreach_contacts SET
    sender_id = CASE WHEN p_sender_id IS NULL THEN sender_id WHEN p_sender_id = 'NONE' THEN NULL ELSE p_sender_id END,
    owner_id = coalesce(p_owner_id, owner_id),
    updated_at = now()
  WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.outreach_activities (contact_id, kind, sender_id, actor_id, body)
  SELECT c, 'ASSIGNED', nullif(p_sender_id, 'NONE'), app.current_clerk_id(),
         concat_ws(' · ', CASE WHEN p_sender_id = 'NONE' THEN 'No sender' WHEN v_label IS NOT NULL THEN 'Sender: ' || v_label END,
                   CASE WHEN p_owner_id IS NOT NULL THEN 'Owner: ' || coalesce(v_name, 'a teammate') END)
  FROM unnest(p_ids) c
  WHERE EXISTS (SELECT 1 FROM public.outreach_contacts oc WHERE oc.id = c);

  PERFORM audit.log_event('OUTREACH_ASSIGNED', 'outreach_contact', NULL, app.current_clerk_id(), app.acting_role('SALES'),
                          jsonb_build_object('contacts', v_n, 'sender_id', p_sender_id, 'owner_id', p_owner_id));
  RETURN v_n;
END
$$;

-- ----------------------------------------------------------- dashboard --

-- Everything the outreach dashboard shows, in one read: the funnel per list,
-- each sender's volume and replies (to compare deliverability), each owner's
-- book, what is due, and how many became clients. A rep sees their own.
CREATE OR REPLACE FUNCTION public.outreach_dashboard()
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
  RETURN (
    WITH mine AS (
      SELECT c.* FROM public.outreach_contacts c WHERE v_admin OR c.owner_id = v_me
    ),
    sends AS (
      SELECT a.* FROM public.outreach_activities a
      JOIN mine m ON m.id = a.contact_id
      WHERE a.kind IN ('SENT', 'REPLIED')
    ),
    conv AS (
      SELECT m.kind, m.sender_id, app.outreach_conversion(m.email, v_admin) AS cv
      FROM mine m
      WHERE m.email IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.client_profiles cp WHERE lower(cp.email) = m.email AND cp.deleted_at IS NULL
      )
    )
    SELECT jsonb_build_object(
      'is_admin', v_admin,
      'totals', (SELECT jsonb_build_object(
          'contacts', count(*),
          'existing', count(*) FILTER (WHERE kind = 'EXISTING'),
          'prospects', count(*) FILTER (WHERE kind = 'PROSPECT'),
          'do_not_contact', count(*) FILTER (WHERE do_not_contact),
          'due', count(*) FILTER (WHERE next_follow_up_at <= now() AND NOT do_not_contact),
          'never_contacted', count(*) FILTER (WHERE touches = 0 AND NOT do_not_contact),
          'contacted', count(*) FILTER (WHERE touches > 0),
          'replied', count(*) FILTER (WHERE replied_at IS NOT NULL),
          'sent_today', (SELECT count(*) FROM sends WHERE kind = 'SENT' AND created_at >= v_today),
          'sent_7d', (SELECT count(*) FROM sends WHERE kind = 'SENT' AND created_at >= now() - interval '7 days'))
        FROM mine),
      'funnel', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'stage', k.stage, 'n', k.n)), '[]'::jsonb)
        FROM (SELECT kind, stage, count(*) AS n FROM mine WHERE NOT do_not_contact GROUP BY kind, stage) k),
      'senders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address, 'active', s.active,
            'daily_limit', s.daily_limit, 'owner_name', sp.first_name,
            'contacts', (SELECT count(*) FROM mine m WHERE m.sender_id = s.id),
            'contacted', (SELECT count(*) FROM mine m WHERE m.sender_id = s.id AND m.touches > 0),
            'replied', (SELECT count(*) FROM mine m WHERE m.sender_id = s.id AND m.replied_at IS NOT NULL),
            'sent_today', (SELECT count(*) FROM sends a WHERE a.sender_id = s.id AND a.kind = 'SENT' AND a.created_at >= v_today),
            'sent_7d', (SELECT count(*) FROM sends a WHERE a.sender_id = s.id AND a.kind = 'SENT' AND a.created_at >= now() - interval '7 days'),
            'clients', (SELECT count(*) FROM conv WHERE conv.sender_id = s.id)
          ) ORDER BY s.active DESC, s.label), '[]'::jsonb)
        FROM public.outreach_senders s
        LEFT JOIN public.staff_profiles sp ON sp.user_id = s.owner_id
        WHERE v_admin OR s.owner_id = v_me),
      'owners', CASE WHEN v_admin THEN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'owner_id', o.owner_id, 'name', coalesce(sp.first_name, 'Unassigned'),
            'contacts', o.contacts, 'contacted', o.contacted, 'replied', o.replied, 'due', o.due) ORDER BY o.contacts DESC), '[]'::jsonb)
        FROM (SELECT owner_id, count(*) AS contacts, count(*) FILTER (WHERE touches > 0) AS contacted,
                     count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
                     count(*) FILTER (WHERE next_follow_up_at <= now() AND NOT do_not_contact) AS due
              FROM mine GROUP BY owner_id) o
        LEFT JOIN public.staff_profiles sp ON sp.user_id = o.owner_id) ELSE '[]'::jsonb END,
      'conversion', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'kind', x.kind, 'signed_up', x.signed_up, 'verified', x.verified, 'ordered', x.ordered,
            'order_value', x.order_value)), '[]'::jsonb)
        FROM (SELECT kind, count(*) AS signed_up,
                     count(*) FILTER (WHERE (cv ->> 'verified')::boolean) AS verified,
                     count(*) FILTER (WHERE (cv ->> 'orders')::integer > 0) AS ordered,
                     CASE WHEN v_admin THEN sum((cv ->> 'order_value')::bigint) END AS order_value
              FROM conv GROUP BY kind) x)
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.outreach_imports_list()
RETURNS TABLE (
  id text, kind text, file_name text, source text, total integer, added integer, duplicates integer,
  skipped_clients integer, invalid integer, created_at timestamptz, by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
BEGIN
  RETURN QUERY
  SELECT i.id, i.kind, i.file_name, i.source, i.total, i.added, i.duplicates, i.skipped_clients, i.invalid,
         i.created_at, sp.first_name
  FROM public.outreach_imports i
  LEFT JOIN public.staff_profiles sp ON sp.user_id = i.created_by
  WHERE v_admin OR i.created_by = app.current_clerk_id()
  ORDER BY i.created_at DESC
  LIMIT 20;
END
$$;

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION app.outreach_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_contact_for_update(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_clean(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_conflict(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_insert(jsonb, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.outreach_conversion(text, boolean) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.outreach_senders_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_save_sender(text, text, text, text, text, text, integer, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_import(text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_add_contact(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_contacts_list(text, text, text, text, text, boolean, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_contact(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_update_contact(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_log(text, text, text, text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_set_stage(text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_set_dnc(text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_assign(text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_imports_list() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.outreach_senders_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_save_sender(text, text, text, text, text, text, integer, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_team() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_import(text, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_add_contact(text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_contacts_list(text, text, text, text, text, boolean, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_contact(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_update_contact(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_log(text, text, text, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_set_stage(text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_set_dnc(text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_assign(text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_dashboard() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_imports_list() TO authenticated, service_role;
