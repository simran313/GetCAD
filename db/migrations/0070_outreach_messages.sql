-- =============================================================================
-- 0070: outreach messages — templates, the three-message sequence, the day's
-- work list and the dashboard's charts (owner, 16 Nov 2026; DECISIONS 1.33).
--
--   1. Templates: the messages the team sends, per channel (email, WhatsApp,
--      Instagram, LinkedIn), per list (existing contacts or prospects),
--      optionally per business type, and per step of the sequence. Seeded
--      from docs/marketing/OUTBOUND-KIT.md; admins edit them.
--   2. The sequence: message 1 on day 1, message 2 on day 4, message 3 on
--      day 10, then stop. Recording a send works out the next date.
--   3. Today: the follow-ups due, and the new contacts each sender can start
--      within its daily limit.
--   4. The dashboard adds the last 14 days, the funnel and each template's
--      reply rate.
--
-- Touches only 0069's own outreach objects: no other table, trigger or
-- function changes.
-- =============================================================================

CREATE TABLE public.outreach_templates (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  list       text        NOT NULL DEFAULT 'ANY' CHECK (list IN ('EXISTING', 'PROSPECT', 'ANY')),
  segment    text        CHECK (segment IS NULL OR segment IN
                           ('RETAIL_JEWELER', 'MANUFACTURER', 'BRAND_WHOLESALER', 'DESIGN_STUDIO', 'OTHER')),
  channel    text        NOT NULL CHECK (channel IN ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'LINKEDIN')),
  step       smallint    NOT NULL CHECK (step BETWEEN 1 AND 3),
  subject    text        CHECK (subject IS NULL OR char_length(subject) <= 200),
  body       text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  active     boolean     NOT NULL DEFAULT true,
  created_by text        REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_templates FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outreach_templates TO service_role;

-- Which template and which message of the sequence a send was.
ALTER TABLE public.outreach_activities
  ADD COLUMN template_id text REFERENCES public.outreach_templates (id) ON DELETE SET NULL,
  ADD COLUMN step        smallint CHECK (step IS NULL OR step BETWEEN 1 AND 3);

-- Contacts imported in one go keep the file's order (now() is the same for
-- the whole import; clock_timestamp() is not), so "oldest first" is the order
-- the list was in.
ALTER TABLE public.outreach_contacts ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE public.outreach_activities ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX outreach_activities_template_idx ON public.outreach_activities (template_id) WHERE template_id IS NOT NULL;

-- ------------------------------------------------------- seed templates --
-- {first_name} {business} {city} {my_name} are filled in when the message is
-- written; anything in [square brackets] is for the sender to replace with a
-- real detail before sending. The sender's signature is added to emails.

INSERT INTO public.outreach_templates (name, list, segment, channel, step, subject, body) VALUES
('Jeweler · message 1', 'PROSPECT', NULL, 'EMAIL', 1,
 'CAD for {business} custom orders',
 E'Hi {first_name},\n\nI saw [a real detail: a piece they posted, their custom ring page]. Nice work.\n\nI run The CAD Pillar, a CAD studio for jewelers. You send a sketch or photo, and you get a fixed price within the hour and a first look within 6 hours, so you can show your customer a design the same day. Castable 3DM and STL, checked twice, white-label, from $35.\n\nWant to try one? If the first look is late, it''s free.\n\nNot interested? Reply "no" and I won''t write again.'),
('Jeweler · message 2', 'PROSPECT', NULL, 'EMAIL', 2,
 'Re: CAD for {business} custom orders',
 E'Hi {first_name}, one more thought: most custom jewelers we talk to lose the sale while the CAD takes days. A 6-hour first look means the customer sees it before they shop elsewhere. Happy to do your next one for $35. Just reply with a photo of the sketch.'),
('Jeweler · message 3', 'PROSPECT', NULL, 'EMAIL', 3,
 'Re: CAD for {business} custom orders',
 E'Last note from me, {first_name}. If CAD ever backs up (holidays, a rush week), we''re here: thecadpillar.com/engagement-ring-cad. All the best with the season.'),
('Manufacturer · message 1', 'PROSPECT', 'MANUFACTURER', 'EMAIL', 1,
 'CAD overflow for {business}',
 E'Hi {first_name},\n\nDo your CAD designers ever have more work than hours, around the holidays or a show?\n\nThe CAD Pillar is a CAD team that works as overflow for manufacturers: your specs and naming, NDA by default, castable 3DM and STL checked twice, first look within 6 hours for standard pieces. Write your shop''s rules once and every designer sees them on every order.\n\nWorth a 10-minute call, or would you rather send one job as a test ($35)?\n\nNot interested? Reply "no" and I won''t write again.'),
('Manufacturer · message 2', 'PROSPECT', 'MANUFACTURER', 'EMAIL', 2,
 'Re: CAD overflow for {business}',
 E'Hi {first_name}, rush weeks are where we help most: you send the overflow, your team keeps the core work, and every file comes back to your specs. Send one job as a test whenever it suits you.'),
('Manufacturer · message 3', 'PROSPECT', 'MANUFACTURER', 'EMAIL', 3,
 'Re: CAD overflow for {business}',
 E'Last note from me, {first_name}. If CAD ever backs up, we''re here: thecadpillar.com/for-jewelers. All the best.'),
('Brand · message 1', 'PROSPECT', 'BRAND_WHOLESALER', 'EMAIL', 1,
 'CAD and renders for your next collection',
 E'Hi {first_name}, loved [a specific piece or launch]. When you plan the next collection, we model it as castable 3DM and STL with render views for product pages: fixed prices, 2 revision rounds, white-label. Renders of existing CAD from $15. Want me to price a few pieces from your sketches?\n\nNot interested? Reply "no" and I won''t write again.'),
('Brand · message 2', 'PROSPECT', 'BRAND_WHOLESALER', 'EMAIL', 2,
 'Re: CAD and renders for your next collection',
 E'Hi {first_name}, happy to price two or three pieces from sketches or photos, no commitment. A fixed price comes back within the hour.'),
('Brand · message 3', 'PROSPECT', 'BRAND_WHOLESALER', 'EMAIL', 3,
 'Re: CAD and renders for your next collection',
 E'Last note from me, {first_name}. When the next collection is on the table, we''re here: thecadpillar.com. All the best with the launch.'),
('People we know · message 1', 'EXISTING', NULL, 'EMAIL', 1,
 'Something new from me: The CAD Pillar',
 E'Hi {first_name},\n\nHope all is well at {business}. I wanted you to hear it from me first: I''ve started The CAD Pillar, a jewelry CAD studio. You send a sketch or photo and get a fixed price within the hour, a first look within 6 hours, and castable 3DM and STL checked twice, from $35.\n\nIf you ever need CAD, or extra hands in a rush week, I''d love to do your next piece. Happy to do the first one as a test.'),
('People we know · message 2', 'EXISTING', NULL, 'EMAIL', 2,
 'Re: Something new from me: The CAD Pillar',
 E'Hi {first_name}, just bringing this back up. If you have a sketch on the desk this week, send it over and I''ll come back with a price within the hour.'),
('People we know · message 3', 'EXISTING', NULL, 'EMAIL', 3,
 'Re: Something new from me: The CAD Pillar',
 E'Last nudge from me, {first_name}. Whenever CAD comes up, I''m a message away: thecadpillar.com. Thanks, and all the best.'),
('People we know · WhatsApp', 'EXISTING', NULL, 'WHATSAPP', 1, NULL,
 E'Hi {first_name}, {my_name} here. I''ve started The CAD Pillar, a jewelry CAD studio: send a sketch or photo, get a fixed price within the hour and a first look within 6 hours, from $35. If you need CAD for anything, I''d love to do your next piece. thecadpillar.com'),
('People we know · WhatsApp follow-up', 'EXISTING', NULL, 'WHATSAPP', 2, NULL,
 E'Hi {first_name}, just checking in. If you have a sketch on the desk, send it here and I''ll price it within the hour.'),
('Prospect · WhatsApp', 'PROSPECT', NULL, 'WHATSAPP', 1, NULL,
 E'Hi {first_name}, I came across {business}: [a real detail]. We''re The CAD Pillar, a CAD studio for jewelers: fixed price within the hour, first look within 6 hours, castable 3DM and STL from $35. Would you like to try one?'),
('Instagram DM', 'ANY', NULL, 'INSTAGRAM', 1, NULL,
 E'Hi! Love the [piece] you posted. Quick one: do you do your own CAD or outsource it? We''re a CAD studio for jewelers. First look in 6 hours, from $35. Happy to do one for you to try.'),
('Instagram DM · follow-up', 'ANY', NULL, 'INSTAGRAM', 2, NULL,
 E'Hi again! If it helps, here''s how it works: thecadpillar.com/engagement-ring-cad. Send a sketch anytime and I''ll price it within the hour.'),
('LinkedIn connection note', 'ANY', NULL, 'LINKEDIN', 1, NULL,
 E'Hi {first_name}, I run a jewelry CAD studio serving US jewelers and manufacturers (overflow, rush weeks, white-label). Would be good to connect.');

-- ------------------------------------------------------------ templates --

-- Every template, with how often it was sent and how many of those contacts
-- replied (a reply counts for the last message sent before it). A rep sees
-- the numbers for their own contacts.
CREATE OR REPLACE FUNCTION public.outreach_templates_list()
RETURNS TABLE (
  id text, name text, list text, segment text, channel text, step smallint, subject text, body text,
  active boolean, updated_at timestamptz, sent bigint, replied bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean := app.outreach_access();
  v_me    text := app.current_clerk_id();
BEGIN
  RETURN QUERY
  WITH mine AS (
    SELECT c.id AS contact_id, c.replied_at FROM public.outreach_contacts c WHERE v_admin OR c.owner_id = v_me
  ),
  sends AS (
    SELECT a.template_id AS tid, count(*) AS n
    FROM public.outreach_activities a JOIN mine m ON m.contact_id = a.contact_id
    WHERE a.kind = 'SENT' AND a.template_id IS NOT NULL
    GROUP BY a.template_id
  ),
  last_before_reply AS (
    SELECT DISTINCT ON (m.contact_id) a.template_id AS tid
    FROM mine m
    JOIN public.outreach_activities a ON a.contact_id = m.contact_id AND a.kind = 'SENT' AND a.created_at <= m.replied_at
    WHERE m.replied_at IS NOT NULL
    ORDER BY m.contact_id, a.created_at DESC
  ),
  replies AS (
    SELECT l.tid, count(*) AS n FROM last_before_reply l WHERE l.tid IS NOT NULL GROUP BY l.tid
  )
  SELECT t.id, t.name, t.list, t.segment, t.channel, t.step, t.subject, t.body, t.active, t.updated_at,
         coalesce(s.n, 0), coalesce(r.n, 0)
  FROM public.outreach_templates t
  LEFT JOIN sends s ON s.tid = t.id
  LEFT JOIN replies r ON r.tid = t.id
  ORDER BY t.active DESC, t.channel, t.list, t.segment NULLS FIRST, t.step, t.name;
END
$$;

-- Add (p_id NULL) or change a template. Admins only.
CREATE OR REPLACE FUNCTION public.outreach_save_template(
  p_id      text,
  p_name    text,
  p_list    text,
  p_segment text,
  p_channel text,
  p_step    integer,
  p_subject text,
  p_body    text,
  p_active  boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
BEGIN
  IF NOT app.outreach_access() THEN RAISE EXCEPTION 'only an admin may change templates'; END IF;
  IF p_channel = 'EMAIL' AND nullif(btrim(coalesce(p_subject, '')), '') IS NULL THEN
    RAISE EXCEPTION 'an email template needs a subject';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.outreach_templates (name, list, segment, channel, step, subject, body, active, created_by)
    VALUES (btrim(p_name), coalesce(p_list, 'ANY'), nullif(p_segment, ''), p_channel, p_step,
            CASE WHEN p_channel = 'EMAIL' THEN btrim(p_subject) END, btrim(p_body), coalesce(p_active, true),
            app.current_clerk_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.outreach_templates SET
      name = btrim(p_name), list = coalesce(p_list, 'ANY'), segment = nullif(p_segment, ''), channel = p_channel,
      step = p_step, subject = CASE WHEN p_channel = 'EMAIL' THEN btrim(p_subject) END, body = btrim(p_body),
      active = coalesce(p_active, true), updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such template'; END IF;
  END IF;

  PERFORM audit.log_event('OUTREACH_TEMPLATE_SAVED', 'outreach_template', v_id, app.current_clerk_id(),
                          app.acting_role('SALES'), jsonb_build_object('channel', p_channel, 'step', p_step));
  RETURN v_id;
END
$$;

-- ------------------------------------------------------------ sequence --

-- Recording a touch now knows the sequence: message 1, then message 2 three
-- days later (day 4), message 3 six days after that (day 10), then nothing
-- is due. A date given by hand always wins.
DROP FUNCTION public.outreach_log(text, text, text, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.outreach_log(
  p_id          text,
  p_kind        text,
  p_channel     text DEFAULT NULL,
  p_body        text DEFAULT NULL,
  p_follow_up   timestamptz DEFAULT NULL,
  p_sender_id   text DEFAULT NULL,
  p_template_id text DEFAULT NULL,
  p_step        integer DEFAULT NULL
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
  v_step   integer;
BEGIN
  IF p_kind NOT IN ('SENT', 'REPLIED', 'NOTE') THEN RAISE EXCEPTION 'record a message sent, a reply or a note'; END IF;
  IF p_sender_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.outreach_senders s
    WHERE s.id = p_sender_id AND (app.outreach_access() OR s.owner_id = app.current_clerk_id())
  ) THEN
    RAISE EXCEPTION 'no such sender';
  END IF;
  IF p_template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.outreach_templates t WHERE t.id = p_template_id) THEN
    RAISE EXCEPTION 'no such template';
  END IF;

  IF p_kind = 'SENT' THEN
    IF v_c.do_not_contact THEN RAISE EXCEPTION 'this contact asked not to be contacted'; END IF;
    v_step := least(greatest(coalesce(p_step, v_c.touches + 1), 1), 3);
    UPDATE public.outreach_contacts SET
      stage = CASE WHEN stage = 'NEW' THEN 'CONTACTED' ELSE stage END,
      touches = touches + 1,
      last_contacted_at = now(),
      sender_id = coalesce(sender_id, v_sender),
      next_follow_up_at = CASE
        WHEN p_follow_up IS NOT NULL THEN p_follow_up
        WHEN stage IN ('NEW', 'CONTACTED') THEN
          CASE v_step WHEN 1 THEN now() + interval '3 days' WHEN 2 THEN now() + interval '6 days' END
        END,
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

  INSERT INTO public.outreach_activities (contact_id, kind, channel, sender_id, actor_id, body, template_id, step)
  VALUES (v_c.id, p_kind, p_channel, CASE WHEN p_kind = 'NOTE' THEN NULL ELSE v_sender END,
          app.current_clerk_id(), v_body,
          CASE WHEN p_kind = 'SENT' THEN p_template_id END, CASE WHEN p_kind = 'SENT' THEN v_step END);
END
$$;

-- ---------------------------------------------------------------- today --

-- The day's work: follow-ups due by the end of today (India time), and the
-- new contacts each sender can start without going over its daily limit
-- (what it already sent today and the follow-ups due on it count first).
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
      SELECT m.* FROM mine m
      WHERE m.next_follow_up_at < v_end AND NOT m.do_not_contact AND m.stage <> 'NOT_INTERESTED'
      ORDER BY m.next_follow_up_at
      LIMIT 200
    ),
    fresh AS (
      SELECT x.* FROM senders s
      CROSS JOIN LATERAL (
        SELECT m.* FROM mine m
        WHERE m.sender_id = s.id AND m.touches = 0 AND m.stage = 'NEW' AND NOT m.do_not_contact
          AND m.next_follow_up_at IS NULL
          AND CASE s.channel
                WHEN 'EMAIL' THEN m.email IS NOT NULL
                WHEN 'WHATSAPP' THEN coalesce(m.whatsapp, m.phone) IS NOT NULL
                WHEN 'INSTAGRAM' THEN m.instagram IS NOT NULL
                ELSE m.linkedin IS NOT NULL
              END
        ORDER BY m.created_at, m.id
        LIMIT greatest(s.daily_limit - s.sent_today - s.due, 0)
      ) x
    ),
    shaped AS (
      SELECT 'due' AS bucket, d.next_follow_up_at AS sort_at, d.* FROM due d
      UNION ALL
      SELECT 'start', f.created_at, f.* FROM fresh f
    )
    SELECT jsonb_build_object(
      'is_admin', v_admin,
      'due', coalesce((SELECT jsonb_agg(r.item ORDER BY r.sort_at) FROM (
        SELECT sh.sort_at, jsonb_build_object(
          'id', sh.id, 'kind', sh.kind, 'segment', sh.segment, 'business_name', sh.business_name,
          'contact_name', sh.contact_name, 'email', sh.email, 'phone', sh.phone, 'whatsapp', sh.whatsapp,
          'instagram', sh.instagram, 'linkedin', sh.linkedin, 'city', sh.city, 'stage', sh.stage,
          'touches', sh.touches, 'next_follow_up_at', sh.next_follow_up_at, 'last_contacted_at', sh.last_contacted_at,
          'step', least(sh.touches + 1, 3),
          'sender', (SELECT jsonb_build_object('id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address,
                                               'signature', s.signature)
                     FROM public.outreach_senders s WHERE s.id = sh.sender_id)) AS item
        FROM shaped sh WHERE sh.bucket = 'due') r), '[]'::jsonb),
      'start', coalesce((SELECT jsonb_agg(r.item ORDER BY r.sort_at) FROM (
        SELECT sh.sort_at, jsonb_build_object(
          'id', sh.id, 'kind', sh.kind, 'segment', sh.segment, 'business_name', sh.business_name,
          'contact_name', sh.contact_name, 'email', sh.email, 'phone', sh.phone, 'whatsapp', sh.whatsapp,
          'instagram', sh.instagram, 'linkedin', sh.linkedin, 'city', sh.city, 'stage', sh.stage,
          'touches', sh.touches, 'next_follow_up_at', sh.next_follow_up_at, 'last_contacted_at', sh.last_contacted_at,
          'step', 1,
          'sender', (SELECT jsonb_build_object('id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address,
                                               'signature', s.signature)
                     FROM public.outreach_senders s WHERE s.id = sh.sender_id)) AS item
        FROM shaped sh WHERE sh.bucket = 'start') r), '[]'::jsonb),
      'senders', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'label', s.label, 'channel', s.channel, 'address', s.address, 'daily_limit', s.daily_limit,
          'sent_today', s.sent_today, 'due', s.due) ORDER BY s.label) FROM senders s), '[]'::jsonb),
      'no_sender', (SELECT count(*) FROM mine m WHERE m.sender_id IS NULL AND m.touches = 0 AND NOT m.do_not_contact)
    )
  );
END
$$;

-- ------------------------------------------------------------ dashboard --

-- 0069's dashboard plus the last 14 days (sent and replies a day, India
-- time), the funnel from written-to to ordered, and the contacts still
-- without a sender.
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
    ),
    days AS (
      SELECT generate_series(v_today - interval '13 days', v_today, interval '1 day') AS d
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
          'interested', count(*) FILTER (WHERE stage = 'INTERESTED'),
          'no_sender', count(*) FILTER (WHERE sender_id IS NULL AND touches = 0 AND NOT do_not_contact),
          'sent_today', (SELECT count(*) FROM sends WHERE kind = 'SENT' AND created_at >= v_today),
          'sent_7d', (SELECT count(*) FROM sends WHERE kind = 'SENT' AND created_at >= now() - interval '7 days'))
        FROM mine),
      'funnel', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'stage', k.stage, 'n', k.n)), '[]'::jsonb)
        FROM (SELECT kind, stage, count(*) AS n FROM mine WHERE NOT do_not_contact GROUP BY kind, stage) k),
      'daily', (SELECT jsonb_agg(jsonb_build_object(
            'day', to_char(days.d AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
            'sent', (SELECT count(*) FROM sends s WHERE s.kind = 'SENT' AND s.created_at >= days.d AND s.created_at < days.d + interval '1 day'),
            'replied', (SELECT count(*) FROM sends s WHERE s.kind = 'REPLIED' AND s.created_at >= days.d AND s.created_at < days.d + interval '1 day')
          ) ORDER BY days.d) FROM days),
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

-- ---------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.outreach_templates_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_save_template(text, text, text, text, text, integer, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_log(text, text, text, text, timestamptz, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_today() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_dashboard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.outreach_templates_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_save_template(text, text, text, text, text, integer, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_log(text, text, text, text, timestamptz, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_dashboard() TO authenticated, service_role;
