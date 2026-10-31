-- 0054_client_emails.sql
-- Client email notifications (owner, 31 Oct 2026). Every important moment of
-- an order emails the client, from the database state that makes it true, in
-- the same transaction (the outbox, 0025): an email can only describe what
-- was saved, and a rolled-back action sends nothing. Idempotency keys make a
-- repeated event a no-op. Sending, test mode and retries are the dispatcher's
-- (lib/email/dispatch).
--
-- Events, all real (see docs/EMAIL.md):
--   portal order submitted ............ ORDER_RECEIVED
--   quote issued (each price) ......... QUOTE_READY
--   payment recorded .................. PAYMENT_RECEIVED
--   paid and confirmed: clock starts .. ORDER_CONFIRMED
--   first look shared ................. FIRST_LOOK_READY
--   changes asked for ................. REVISION_RECEIVED
--   revised design shared ............. REVISED_DESIGN_READY
--   approved .......................... DESIGN_APPROVED
--   final files released .............. FILES_DELIVERED
--   problem raised .................... PROBLEM_RECEIVED
--   refunded / cancelled .............. ORDER_REFUNDED / ORDER_CANCELLED
--   standard first look missed ........ ORDER_DELAYED
--   late credit decided ............... CREDIT_DECIDED
--   the team writes in the client chat  NEW_MESSAGE (at most one per order per 30 min)
--   a client signs up ................. WELCOME
-- and, from the 5-minute sweep (enqueue_email_reminders): QUOTE_REMINDER after
-- 24 h unpaid, PREVIEW_REMINDER after 48 h unreviewed, FEEDBACK_REQUEST 3 days
-- after delivery.
--
-- ANONYMITY. Only the client is emailed, about their own order: the payload
-- holds the order's id, reference and the client's own name for the piece.
-- No designer, pod lead or staff name ever enters a payload; the team is
-- "your team" (DECISIONS §2, §11).
--
-- PREFERENCES. Order emails are transactional and always sent. A client can
-- turn off message emails and reminders (email_preferences); marketing is off
-- by default and nothing sends it yet.

-- ------------------------------------------------------------ templates --

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK (template IN (
  'DESIGNER_APPLICATION_RECEIVED',
  'CONTACT_RECEIVED',
  'DESIGNER_APPLICATION_ACCEPTED',
  'DESIGNER_APPLICATION_REJECTED',
  'PAYOUT_SENT',
  'ORDER_PLACED_FOR_YOU',
  'WELCOME',
  'ORDER_RECEIVED',
  'QUOTE_READY',
  'QUOTE_REMINDER',
  'PAYMENT_RECEIVED',
  'ORDER_CONFIRMED',
  'FIRST_LOOK_READY',
  'REVISION_RECEIVED',
  'REVISED_DESIGN_READY',
  'PREVIEW_REMINDER',
  'DESIGN_APPROVED',
  'FILES_DELIVERED',
  'PROBLEM_RECEIVED',
  'ORDER_REFUNDED',
  'ORDER_CANCELLED',
  'ORDER_DELAYED',
  'CREDIT_DECIDED',
  'NEW_MESSAGE',
  'FEEDBACK_REQUEST'
));

-- ---------------------------------------------------------- preferences --

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id    text        PRIMARY KEY REFERENCES public.users (id) ON DELETE RESTRICT,
  messages   boolean     NOT NULL DEFAULT true,
  reminders  boolean     NOT NULL DEFAULT true,
  marketing  boolean     NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.my_email_preferences()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'messages',  coalesce(p.messages, true),
    'reminders', coalesce(p.reminders, true),
    'marketing', coalesce(p.marketing, false)
  )
  FROM (SELECT 1) one
  LEFT JOIN public.email_preferences p ON p.user_id = app.current_clerk_id()
$$;

CREATE OR REPLACE FUNCTION public.set_email_preferences(p_messages boolean, p_reminders boolean, p_marketing boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me text := app.current_clerk_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.email_preferences (user_id, messages, reminders, marketing, updated_at)
  VALUES (v_me, coalesce(p_messages, true), coalesce(p_reminders, true), coalesce(p_marketing, false), now())
  ON CONFLICT (user_id) DO UPDATE
    SET messages = excluded.messages, reminders = excluded.reminders,
        marketing = excluded.marketing, updated_at = now();
END
$$;

-- Whether a user takes an optional kind of email ('messages', 'reminders').
CREATE OR REPLACE FUNCTION app.wants_email(p_user_id text, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT CASE p_kind WHEN 'messages' THEN p.messages WHEN 'reminders' THEN p.reminders WHEN 'marketing' THEN p.marketing END
       FROM public.email_preferences p WHERE p.user_id = p_user_id),
    p_kind <> 'marketing'
  )
$$;

-- ------------------------------------------------------------- helpers --

-- The client's address and the fields every order email carries. NULL when
-- the client has no profile yet (nothing to send to).
CREATE OR REPLACE FUNCTION app.order_email_payload(p_order_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'email',     cp.email,
    'name',      cp.legal_name,
    'order_id',  o.id,
    'order_ref', o.order_ref,
    'title',     coalesce(nullif(btrim(s.reference_name), ''), initcap(replace(o.product_type, '_', ' '))),
    'price',     o.price_total,
    'currency',  o.currency,
    'version',   o.work_version,
    'due_at',    o.sla_due_at,
    'deadline_hours', o.complex_deadline_hours
  )
  FROM public.orders o
  JOIN public.client_profiles cp ON cp.user_id = o.client_id AND cp.deleted_at IS NULL
  LEFT JOIN public.order_specs s ON s.order_id = o.id
  WHERE o.id = p_order_id
$$;

-- Owe the client of an order an email. p_extra adds template fields;
-- p_kind names an optional kind the client may have turned off.
CREATE OR REPLACE FUNCTION app.email_order_client(
  p_order_id text,
  p_template text,
  p_key      text,
  p_extra    jsonb DEFAULT '{}'::jsonb,
  p_kind     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := app.order_email_payload(p_order_id);
  v_client  text;
BEGIN
  IF v_payload IS NULL THEN RETURN; END IF;
  IF p_kind IS NOT NULL THEN
    SELECT client_id INTO v_client FROM public.orders WHERE id = p_order_id;
    IF NOT app.wants_email(v_client, p_kind) THEN RETURN; END IF;
  END IF;
  PERFORM app.enqueue_email(
    p_template,
    v_payload ->> 'email',
    (v_payload - 'email') || coalesce(p_extra, '{}'::jsonb),
    p_key
  );
END
$$;

-- -------------------------------------------------------- order events --

CREATE OR REPLACE FUNCTION app.order_status_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k text := 'email:order:' || NEW.id || ':';
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'SUBMITTED' THEN
        -- A team-placed order already told the client (ORDER_PLACED_FOR_YOU, 0043).
        IF NEW.source = 'portal' THEN PERFORM app.email_order_client(NEW.id, 'ORDER_RECEIVED', k || 'received'); END IF;
      WHEN 'QUOTED' THEN
        PERFORM app.email_order_client(NEW.id, 'QUOTE_READY', k || 'quoted:' || NEW.price_total);
      WHEN 'PAYMENT_HELD' THEN
        PERFORM app.email_order_client(NEW.id, 'PAYMENT_RECEIVED', k || 'paid');
      WHEN 'CLIENT_PREVIEW' THEN
        IF NEW.work_version > 1 THEN
          PERFORM app.email_order_client(NEW.id, 'REVISED_DESIGN_READY', k || 'preview:v' || NEW.work_version);
        ELSE
          PERFORM app.email_order_client(NEW.id, 'FIRST_LOOK_READY', k || 'preview:v1');
        END IF;
      WHEN 'REVISION_REQUESTED' THEN
        PERFORM app.email_order_client(NEW.id, 'REVISION_RECEIVED', k || 'revision:v' || NEW.work_version);
      WHEN 'APPROVED' THEN
        PERFORM app.email_order_client(NEW.id, 'DESIGN_APPROVED', k || 'approved');
      WHEN 'DELIVERED' THEN
        PERFORM app.email_order_client(NEW.id, 'FILES_DELIVERED', k || 'delivered');
      WHEN 'DISPUTED' THEN
        PERFORM app.email_order_client(NEW.id, 'PROBLEM_RECEIVED', k || 'disputed:' || extract(epoch FROM now())::bigint);
      WHEN 'REFUNDED' THEN
        PERFORM app.email_order_client(NEW.id, 'ORDER_REFUNDED', k || 'refunded');
      WHEN 'CANCELLED' THEN
        -- Only an order the client had sent; a draft never emailed anyone.
        IF OLD.status <> 'DRAFT' THEN PERFORM app.email_order_client(NEW.id, 'ORDER_CANCELLED', k || 'cancelled'); END IF;
      ELSE
        NULL;
    END CASE;
  END IF;

  -- Paid and confirmed: the first-look clock starts (0040), with its due time.
  IF NEW.sla_started_at IS NOT NULL AND OLD.sla_started_at IS NULL THEN
    PERFORM app.email_order_client(NEW.id, 'ORDER_CONFIRMED', k || 'confirmed');
  END IF;

  -- A standard first look missed (breached): say so before the client has to ask.
  IF NEW.sla_status = 'breached' AND OLD.sla_status IS DISTINCT FROM 'breached' THEN
    PERFORM app.email_order_client(NEW.id, 'ORDER_DELAYED', k || 'delayed');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS orders_client_emails ON public.orders;
CREATE TRIGGER orders_client_emails
  AFTER UPDATE OF status, sla_started_at, sla_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.order_status_emails();

-- A late credit decided by admin (0040): what the client gets.
CREATE OR REPLACE FUNCTION app.credit_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('apply_next', 'refunded', 'partial') THEN
    PERFORM app.email_order_client(
      NEW.order_id, 'CREDIT_DECIDED', 'email:credit:' || NEW.id || ':' || NEW.status,
      jsonb_build_object('decision', NEW.status, 'amount', coalesce(NEW.decided_amount_cents, NEW.amount_cents), 'credit_currency', NEW.currency)
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS client_credits_emails ON public.client_credits;
CREATE TRIGGER client_credits_emails
  AFTER UPDATE OF status ON public.client_credits
  FOR EACH ROW EXECUTE FUNCTION app.credit_emails();

-- The team wrote in the client's conversation: one email per order per half
-- hour at most, and none for a client who turned message emails off.
CREATE OR REPLACE FUNCTION app.message_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NEW.sender_party <> 'TEAM' THEN RETURN NEW; END IF;
  SELECT kind INTO v_kind FROM public.message_threads WHERE id = NEW.thread_id;
  IF v_kind IS DISTINCT FROM 'client_team' THEN RETURN NEW; END IF;
  PERFORM app.email_order_client(
    NEW.order_id, 'NEW_MESSAGE',
    'email:message:' || NEW.order_id || ':' || (extract(epoch FROM NEW.created_at)::bigint / 1800),
    jsonb_build_object('excerpt', left(regexp_replace(NEW.body, '\s+', ' ', 'g'), 160)),
    'messages'
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS messages_client_emails ON public.messages;
CREATE TRIGGER messages_client_emails
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.message_emails();

-- Welcome, when a client creates their own account (not one the team
-- registered for them: that client is told by ORDER_PLACED_FOR_YOU).
CREATE OR REPLACE FUNCTION app.welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
  PERFORM app.enqueue_email('WELCOME', NEW.email, jsonb_build_object('name', NEW.legal_name), 'email:welcome:' || NEW.user_id);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS client_profiles_welcome ON public.client_profiles;
CREATE TRIGGER client_profiles_welcome
  AFTER INSERT ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION app.welcome_email();

-- -------------------------------------------------------------- reminders --

-- Run by the 5-minute email sweep (service role). Each reminder is keyed so
-- it is owed once, and timed from the email it follows up.
CREATE OR REPLACE FUNCTION public.enqueue_email_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  -- A quote unpaid after a day.
  FOR r IN
    SELECT o.id, o.client_id, o.price_total
    FROM public.orders o
    JOIN public.email_outbox e ON e.idempotency_key = 'email:order:' || o.id || ':quoted:' || o.price_total
    WHERE o.status = 'QUOTED' AND o.deleted_at IS NULL
      AND e.created_at < now() - interval '24 hours'
      AND e.created_at > now() - interval '14 days'
  LOOP
    PERFORM app.email_order_client(r.id, 'QUOTE_REMINDER', 'email:order:' || r.id || ':quote-reminder:' || r.price_total, '{}'::jsonb, 'reminders');
    n := n + 1;
  END LOOP;

  -- A design waiting for review for two days.
  FOR r IN
    SELECT o.id, o.work_version
    FROM public.orders o
    JOIN public.email_outbox e ON e.idempotency_key = 'email:order:' || o.id || ':preview:v' || o.work_version
    WHERE o.status = 'CLIENT_PREVIEW' AND o.deleted_at IS NULL
      AND e.created_at < now() - interval '48 hours'
      AND e.created_at > now() - interval '14 days'
  LOOP
    PERFORM app.email_order_client(r.id, 'PREVIEW_REMINDER', 'email:order:' || r.id || ':preview-reminder:v' || r.work_version, '{}'::jsonb, 'reminders');
    n := n + 1;
  END LOOP;

  -- How did it go, three days after the files.
  FOR r IN
    SELECT o.id
    FROM public.orders o
    JOIN public.email_outbox e ON e.idempotency_key = 'email:order:' || o.id || ':delivered'
    WHERE o.status IN ('DELIVERED', 'CLOSED', 'PAYOUT_RELEASED') AND o.deleted_at IS NULL
      AND e.created_at < now() - interval '72 hours'
      AND e.created_at > now() - interval '14 days'
  LOOP
    PERFORM app.email_order_client(r.id, 'FEEDBACK_REQUEST', 'email:order:' || r.id || ':feedback', '{}'::jsonb, 'reminders');
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- --------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.my_email_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_email_preferences(boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_email_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wants_email(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.order_email_payload(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_order_client(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_email_preferences() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_email_preferences(boolean, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email_reminders() TO service_role;
