-- 0036_pseudonymous_identity.sql
-- A designer must not be able to tell that two orders came from the same
-- client (DECISIONS §2, §7.3). Until now they could.
--
-- THE LEAK. Every order-scoped table inherited "you can read it if you can
-- read the order", and the rows carried raw Clerk user ids:
--
--   messages.sender_id        the client's id on every message they sent
--   orders.client_id / org_id the whole order row, to the assigned designer
--   file_versions.uploaded_by the client's id on every reference they attached
--   disputes.raised_by        the client's id
--   escrow_ledger.created_by  the client's id on the HOLD (and the price)
--   order_specs               based_on_order_id links a revision to the
--                             client's earlier order; reference_name is free
--                             text that usually names the end customer
--
-- A Clerk id is stable for life, so a designer who saw it on two orders knew
-- they shared a client. The same reads also showed designers the price, which
-- DECISIONS §2 forbids.
--
-- THE FIX, in three layers:
--   1. Designers lose direct access to `orders` (policies/0029). They read
--      their jobs through visible_orders() and job_brief(), which return no
--      client id, no price, no reference name, no lineage, and the job code
--      (RN-C-17) instead of the client-facing reference (MJ1-RN-C-17).
--   2. Raw user-id columns are not selectable by ANY app user (column
--      privileges, policies/0029). Who-is-who questions are answered by
--      functions that return a relation ('CLIENT', 'DESIGNER', …), a party, or
--      an is_mine flag — never the id.
--   3. Messages move into per-order threads (DECISIONS §11): client_team
--      (client + admin + pod lead) and internal (designer + pod lead + admin).
--      A sender is shown by a per-thread alias — "Client", "Designer",
--      "Team · Priya" — and a designer can neither read nor post in a
--      client_team thread.
--
-- tests/db/client_anonymity.test.ts walks every table and function a designer
-- can reach and fails if any client identifier, or any value shared between
-- two orders of the same client, comes back.

-- ----------------------------------------------------------- relations --

CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT app.current_roles() && ARRAY['SALES', 'OPS', 'FINANCE', 'QC']::public.role[]
$$;

CREATE OR REPLACE FUNCTION app.is_assigned_designer(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND o.designer_id = app.current_clerk_id()
      AND app.current_user_role() = 'DESIGNER'
  )
$$;

-- How the current user relates to an order, or NULL if the order is not
-- theirs to see. Mirrors the orders policies exactly (0003, 0017, 0027),
-- re-derived because SECURITY DEFINER callers bypass RLS.
CREATE OR REPLACE FUNCTION app.order_relation(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN o.client_id = app.current_clerk_id() THEN 'CLIENT'
    WHEN o.designer_id = app.current_clerk_id() AND app.current_user_role() = 'DESIGNER' THEN 'DESIGNER'
    WHEN app.is_admin() THEN 'ADMIN'
    WHEN o.pod_id IS NOT NULL AND o.pod_id = ANY (app.current_pod_ids()) THEN 'POD_LEAD'
    WHEN o.qc_reviewer_id = app.current_clerk_id() THEN 'QC_REVIEWER'
    WHEN EXISTS (
      SELECT 1 FROM public.order_transitions t
      WHERE t.from_status = o.status
        AND t.actor_role = ANY (app.current_roles())
        AND t.actor_role <> 'QC'
        AND t.actor_scope = 'STAFF'
    ) THEN 'STAFF'
  END
  FROM public.orders o
  WHERE o.id = p_order_id
$$;

CREATE OR REPLACE FUNCTION public.my_order_relation(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.order_relation(p_order_id)
$$;

GRANT EXECUTE ON FUNCTION app.is_staff()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_assigned_designer(text)  TO authenticated, service_role;
REVOKE ALL    ON FUNCTION app.order_relation(text)        FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.my_order_relation(text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_order_relation(text)  TO authenticated, service_role;

-- --------------------------------------------------------------- orders --

-- Every order the caller may see, in the shape their relation allows.
-- A designer gets the job code, their own pay in paise and the internal due
-- time; never the client reference, the price or the money split. Their
-- product label comes from the brief's product enum, not orders.product_type,
-- which is free text the client typed.
CREATE OR REPLACE FUNCTION public.visible_orders(p_order_id text DEFAULT NULL)
RETURNS TABLE (
  id                    text,
  relation              text,
  display_ref           text,
  product_type          text,
  status                public.order_status,
  service               public.service_kind,
  category              char(1),
  tier                  public.job_tier,
  currency              text,
  price_total           integer,
  designer_payout       integer,
  qc_payout             integer,
  platform_commission   integer,
  designer_payout_paise integer,
  qc_payout_paise       integer,
  sla_status            public.sla_status,
  sla_due_at            timestamptz,
  designer_due_at       timestamptz,
  first_look_at         timestamptz,
  source                public.order_source,
  created_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH v AS (
    SELECT o.*, app.order_relation(o.id) AS rel, s.product::text AS spec_product
    FROM public.orders o
    LEFT JOIN public.order_specs s ON s.order_id = o.id
    WHERE (p_order_id IS NULL OR o.id = p_order_id)
      AND o.deleted_at IS NULL
  )
  SELECT
    v.id,
    v.rel,
    CASE WHEN v.rel = 'DESIGNER' THEN v.job_code ELSE v.order_ref END,
    CASE WHEN v.rel = 'DESIGNER' THEN coalesce(v.spec_product, 'OTHER') ELSE v.product_type END,
    v.status,
    v.service,
    v.category,
    v.tier,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.currency END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.price_total END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.designer_payout END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.qc_payout END,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.platform_commission END,
    CASE WHEN v.rel = 'CLIENT' THEN NULL ELSE v.designer_payout_paise END,
    CASE WHEN v.rel IN ('CLIENT', 'DESIGNER') THEN NULL ELSE v.qc_payout_paise END,
    v.sla_status,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.sla_due_at END,
    v.sla_due_at - make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60)),
    v.first_look_at,
    CASE WHEN v.rel = 'DESIGNER' THEN NULL ELSE v.source END,
    v.created_at
  FROM v
  WHERE v.rel IS NOT NULL
  ORDER BY v.created_at DESC, v.id
$$;

REVOKE ALL ON FUNCTION public.visible_orders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visible_orders(text) TO authenticated, service_role;

-- The brief as a designer may read it: no reference name (the client's own
-- label, often their customer's name) and no link to the client's earlier
-- order — only that it IS a revision, and what changed.
CREATE OR REPLACE FUNCTION public.job_brief(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_spec public.order_specs%ROWTYPE;
BEGIN
  IF app.order_relation(p_order_id) IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  SELECT * INTO v_spec FROM public.order_specs WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN (to_jsonb(v_spec) - 'reference_name' - 'based_on_order_id')
         || jsonb_build_object('is_revision', v_spec.based_on_order_id IS NOT NULL);
END
$$;

REVOKE ALL ON FUNCTION public.job_brief(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_brief(text) TO authenticated, service_role;

-- ---------------------------------------------------------------- files --

-- Who uploaded a file, as a party. Replaces reading uploaded_by.
ALTER TABLE file_versions
  ADD COLUMN uploader_party text CHECK (uploader_party IN ('CLIENT', 'DESIGNER', 'TEAM'));

CREATE OR REPLACE FUNCTION app.set_uploader_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT CASE
           WHEN o.client_id = NEW.uploaded_by THEN 'CLIENT'
           WHEN o.designer_id = NEW.uploaded_by THEN 'DESIGNER'
           ELSE 'TEAM'
         END
    INTO NEW.uploader_party
  FROM public.orders o WHERE o.id = NEW.order_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER file_versions_uploader_party
  BEFORE INSERT ON file_versions
  FOR EACH ROW EXECUTE FUNCTION app.set_uploader_party();

UPDATE file_versions f
  SET uploader_party = CASE
        WHEN o.client_id = f.uploaded_by THEN 'CLIENT'
        WHEN o.designer_id = f.uploaded_by THEN 'DESIGNER'
        ELSE 'TEAM'
      END
  FROM orders o
  WHERE o.id = f.order_id;

ALTER TABLE file_versions ALTER COLUMN uploader_party SET NOT NULL;

-- -------------------------------------------------------------- threads --

CREATE TABLE message_threads (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id   text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  -- legacy = the pre-v1 client<->designer thread, frozen and admin-only.
  kind       text        NOT NULL CHECK (kind IN ('client_team', 'internal', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);

-- The alias each person posts under in a thread. Never readable by app users
-- (no grant, policies/0029): the alias is copied onto each message instead.
CREATE TABLE thread_participants (
  thread_id  text        NOT NULL REFERENCES message_threads (id) ON DELETE RESTRICT,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  party      text        NOT NULL CHECK (party IN ('CLIENT', 'DESIGNER', 'TEAM')),
  alias      text        NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 60),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE OR REPLACE FUNCTION app.create_order_threads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.message_threads (order_id, kind)
  VALUES (NEW.id, 'client_team'), (NEW.id, 'internal')
  ON CONFLICT (order_id, kind) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_create_threads
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION app.create_order_threads();

INSERT INTO message_threads (order_id, kind)
SELECT o.id, k.kind FROM orders o CROSS JOIN (VALUES ('client_team'), ('internal')) AS k(kind)
ON CONFLICT (order_id, kind) DO NOTHING;

-- Messages join a thread and carry the sender's alias.
ALTER TABLE messages
  ADD COLUMN thread_id    text REFERENCES message_threads (id) ON DELETE RESTRICT,
  ADD COLUMN sender_alias text CHECK (sender_alias IS NULL OR char_length(sender_alias) BETWEEN 1 AND 60);

ALTER TABLE messages DROP CONSTRAINT messages_sender_party_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_party_check
  CHECK (sender_party IN ('CLIENT', 'DESIGNER', 'TEAM'));

-- Existing messages were a direct client<->designer conversation, which
-- DECISIONS §11 no longer allows. They are kept (dispute evidence) in a
-- legacy thread only an admin can read.
INSERT INTO message_threads (order_id, kind)
SELECT DISTINCT order_id, 'legacy' FROM messages
ON CONFLICT (order_id, kind) DO NOTHING;

ALTER TABLE messages DISABLE TRIGGER messages_no_update;
UPDATE messages m
  SET thread_id = t.id,
      sender_alias = CASE m.sender_party WHEN 'CLIENT' THEN 'Client' ELSE 'Designer' END
  FROM message_threads t
  WHERE t.order_id = m.order_id AND t.kind = 'legacy';
ALTER TABLE messages ENABLE TRIGGER messages_no_update;

ALTER TABLE messages
  ALTER COLUMN thread_id    SET NOT NULL,
  ALTER COLUMN sender_alias SET NOT NULL;

CREATE INDEX messages_thread_idx ON messages (thread_id, created_at);

-- Who may read a thread. Designers never see client_team, whatever else is
-- true (DECISIONS §11: enforced in the database).
CREATE OR REPLACE FUNCTION app.can_read_thread(p_thread_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.message_threads t
    JOIN public.orders o ON o.id = t.order_id
    WHERE t.id = p_thread_id
      AND CASE t.kind
        WHEN 'client_team' THEN
          app.current_user_role() IS DISTINCT FROM 'DESIGNER'
          AND (o.client_id = app.current_clerk_id()
               OR app.is_admin()
               OR (o.pod_id IS NOT NULL AND o.pod_id = ANY (app.current_pod_ids())))
        WHEN 'internal' THEN
          (o.designer_id = app.current_clerk_id() AND app.current_user_role() = 'DESIGNER')
          OR app.is_admin()
          OR (o.pod_id IS NOT NULL AND o.pod_id = ANY (app.current_pod_ids()))
        WHEN 'legacy' THEN
          app.is_admin()
        ELSE false
      END
  )
$$;

GRANT EXECUTE ON FUNCTION app.can_read_thread(text) TO authenticated, service_role;

-- Post to a thread. The party and alias come from who you are, never from the
-- caller. The sender's id is stored for audit and is not selectable.
CREATE OR REPLACE FUNCTION public.post_thread_message(p_thread_id text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_thread   public.message_threads%ROWTYPE;
  v_order    public.orders%ROWTYPE;
  v_party    text;
  v_alias    text;
  v_id       text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'message body is empty';
  END IF;

  SELECT * INTO v_thread FROM public.message_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_thread.kind = 'legacy' THEN
    RAISE EXCEPTION 'this conversation is closed';
  END IF;
  IF v_thread.kind = 'client_team' AND app.current_user_role() = 'DESIGNER' THEN
    RAISE EXCEPTION 'designers cannot post in client threads';
  END IF;
  IF NOT app.can_read_thread(p_thread_id) THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_thread.order_id;

  SELECT party, alias INTO v_party, v_alias
  FROM public.thread_participants WHERE thread_id = p_thread_id AND user_id = v_clerk_id;
  IF NOT FOUND THEN
    IF v_order.client_id = v_clerk_id THEN
      v_party := 'CLIENT';  v_alias := 'Client';
    ELSIF v_order.designer_id = v_clerk_id AND app.current_user_role() = 'DESIGNER' THEN
      v_party := 'DESIGNER'; v_alias := 'Designer';
    ELSE
      v_party := 'TEAM';
      v_alias := 'Team' || coalesce(
        ' · ' || (SELECT first_name FROM public.staff_profiles WHERE user_id = v_clerk_id), '');
    END IF;
    INSERT INTO public.thread_participants (thread_id, user_id, party, alias)
    VALUES (p_thread_id, v_clerk_id, v_party, v_alias);
  END IF;

  INSERT INTO public.messages (order_id, thread_id, sender_id, sender_party, sender_alias, body)
  VALUES (v_thread.order_id, p_thread_id, v_clerk_id, v_party, v_alias, btrim(p_body))
  RETURNING id INTO v_id;

  PERFORM audit.log_event(
    'MESSAGE_POSTED', 'order', v_thread.order_id, v_clerk_id, app.current_user_role(),
    jsonb_build_object('message_id', v_id, 'party', v_party,
                       'thread_id', p_thread_id, 'thread_kind', v_thread.kind)
  );

  RETURN jsonb_build_object('message_id', v_id, 'party', v_party, 'thread_id', p_thread_id);
END
$$;

REVOKE ALL ON FUNCTION public.post_thread_message(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_thread_message(text, text) TO authenticated, service_role;

-- The order-level door the current UI uses: a client posts to the team, a
-- designer posts to the internal thread. Staff pick a thread explicitly.
CREATE OR REPLACE FUNCTION public.post_message(p_order_id text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel    text;
  v_thread text;
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_rel := app.order_relation(p_order_id);
  IF v_rel IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_rel NOT IN ('CLIENT', 'DESIGNER') THEN
    RAISE EXCEPTION 'staff post to a specific thread: use post_thread_message()';
  END IF;

  SELECT id INTO v_thread FROM public.message_threads
  WHERE order_id = p_order_id
    AND kind = CASE v_rel WHEN 'CLIENT' THEN 'client_team' ELSE 'internal' END;

  RETURN public.post_thread_message(v_thread, p_body);
END
$$;

-- Messages on an order that the caller may read, with "is this mine" worked
-- out here so the sender id never leaves the database.
CREATE OR REPLACE FUNCTION public.order_messages(p_order_id text)
RETURNS TABLE (
  id           text,
  thread_id    text,
  thread_kind  text,
  sender_party text,
  sender_alias text,
  is_mine      boolean,
  body         text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id, m.thread_id, t.kind, m.sender_party, m.sender_alias,
         m.sender_id = app.current_clerk_id(), m.body, m.created_at
  FROM public.messages m
  JOIN public.message_threads t ON t.id = m.thread_id
  WHERE m.order_id = p_order_id
    AND app.can_read_thread(m.thread_id)
  ORDER BY m.created_at, m.id
$$;

-- The threads on an order the caller may read (so the UI knows where to post).
CREATE OR REPLACE FUNCTION public.order_threads(p_order_id text)
RETURNS TABLE (id text, kind text, can_post boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.kind, t.kind <> 'legacy'
  FROM public.message_threads t
  WHERE t.order_id = p_order_id AND app.can_read_thread(t.id)
  ORDER BY t.kind
$$;

REVOKE ALL ON FUNCTION public.order_messages(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_threads(text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_messages(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_threads(text)  TO authenticated, service_role;

-- ------------------------------------------------------------- timeline --

-- Same as 0016, with two changes: visibility follows app.order_relation (so
-- admins and pod leads see it, and the old QC pool does not), and a designer
-- gets no amounts — the quote and the hold are the price.
CREATE OR REPLACE FUNCTION public.order_timeline(p_order_id text)
RETURNS TABLE (
  seq         bigint,
  created_at  timestamptz,
  action      text,
  actor_role  public.role,
  from_status text,
  to_status   text,
  amount      integer,
  detail      text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_rel text;
BEGIN
  IF app.current_clerk_id() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_rel := app.order_relation(p_order_id);
  IF v_rel IS NULL THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;

  RETURN QUERY
  SELECT
    a.seq,
    a.created_at,
    a.action,
    a.actor_role,
    a.payload ->> 'from',
    coalesce(
      a.payload ->> 'to',
      CASE WHEN a.action = 'ORDER_CREATED' THEN 'DRAFT' END,
      CASE WHEN a.action = 'DISPUTE_RESOLVED' AND a.payload ->> 'resolution' = 'REWORK' THEN 'IN_PROGRESS' END,
      CASE WHEN a.action = 'DISPUTE_RESOLVED' AND a.payload ->> 'resolution' = 'REFUND' THEN 'REFUNDED' END
    ),
    CASE
      WHEN v_rel = 'DESIGNER'           THEN NULL
      WHEN a.action = 'ORDER_QUOTED'    THEN (a.payload ->> 'price_total')::integer
      WHEN a.action = 'ESCROW_HELD'     THEN (a.payload ->> 'amount')::integer
      WHEN a.action = 'ESCROW_REFUNDED' THEN (a.payload ->> 'amount')::integer
      ELSE NULL
    END,
    CASE
      WHEN a.action = 'DISPUTE_RESOLVED' THEN a.payload ->> 'resolution'
      ELSE NULL
    END
  FROM audit.audit_log a
  WHERE a.entity_type = 'order'
    AND a.entity_id = p_order_id
    AND a.action IN (
      'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'ORDER_QUOTED',
      'ESCROW_HELD', 'ESCROW_RELEASED', 'ESCROW_REFUNDED',
      'DISPUTE_RAISED', 'DISPUTE_RESOLVED'
    )
  ORDER BY a.seq ASC;
END
$$;

-- ------------------------------------------------------- notifications --

-- Same fan-out as 0015, re-routed for threads: a client message goes to the
-- pod lead, not the designer; a designer message goes to the pod lead, not
-- the client. Nobody is told a thread they cannot read has activity.
CREATE OR REPLACE FUNCTION app.fanout_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client   text;
  v_designer text;
  v_pod_lead text;
  v_other    text;
  v_to       text;
BEGIN
  IF NEW.entity_type <> 'order' OR NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id, designer_id, pod_lead_id INTO v_client, v_designer, v_pod_lead
  FROM public.orders WHERE id = NEW.entity_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_other := CASE
    WHEN NEW.actor_id IS NOT DISTINCT FROM v_client   THEN v_designer
    WHEN NEW.actor_id IS NOT DISTINCT FROM v_designer THEN v_client
    ELSE NULL
  END;

  IF NEW.action = 'MESSAGE_POSTED' THEN
    IF NEW.payload ->> 'thread_kind' = 'client_team' THEN
      IF NEW.actor_id IS NOT DISTINCT FROM v_client THEN
        PERFORM app.notify(v_pod_lead, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the client.');
      ELSE
        PERFORM app.notify(v_client, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the team.');
      END IF;
    ELSIF NEW.payload ->> 'thread_kind' = 'internal' THEN
      IF NEW.actor_id IS NOT DISTINCT FROM v_designer THEN
        PERFORM app.notify(v_pod_lead, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the designer.');
      ELSE
        PERFORM app.notify(v_designer, NEW.actor_id, 'MESSAGE', NEW.entity_id, 'New message from the team.');
      END IF;
    END IF;
  ELSIF NEW.action = 'FILE_VERSION_ADDED' THEN
    PERFORM app.notify(v_other, NEW.actor_id, 'FILE', NEW.entity_id, 'A new file was added to your order.');
  ELSIF NEW.action = 'ORDER_QUOTED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'QUOTED', NEW.entity_id, 'Your order has been quoted.');
  ELSIF NEW.action = 'ESCROW_RELEASED' THEN
    PERFORM app.notify(v_designer, NEW.actor_id, 'PAYOUT', NEW.entity_id, 'Your payout has been released.');
  ELSIF NEW.action = 'ESCROW_REFUNDED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'REFUNDED', NEW.entity_id, 'Your order has been refunded.');
  ELSIF NEW.action = 'DISPUTE_RAISED' THEN
    PERFORM app.notify(v_designer, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute was raised on your order.');
  ELSIF NEW.action = 'DISPUTE_RESOLVED' THEN
    PERFORM app.notify(v_client, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute on your order was resolved.');
    PERFORM app.notify(v_designer, NEW.actor_id, 'DISPUTE', NEW.entity_id, 'A dispute on your order was resolved.');
  ELSIF NEW.action = 'ORDER_STATUS_CHANGED' THEN
    v_to := NEW.payload ->> 'to';
    IF v_to = 'ASSIGNED' THEN
      PERFORM app.notify(v_designer, NEW.actor_id, 'ASSIGNED', NEW.entity_id, 'You have been assigned to an order.');
    ELSIF v_to = 'CLIENT_PREVIEW' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'PREVIEW', NEW.entity_id, 'Your order is ready to preview.');
    ELSIF v_to = 'DELIVERED' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'DELIVERED', NEW.entity_id, 'Your order has been delivered.');
    ELSIF v_to = 'DESIGNER_SUBMITTED' THEN
      PERFORM app.notify(v_client, NEW.actor_id, 'SUBMITTED', NEW.entity_id, 'Work has been submitted on your order.');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- notifications are best-effort; never break the business action
END
$$;

-- ------------------------------------------------- transitions + QC --

-- Same as 0020's transition_order, with the role lookup taking every role the
-- caller holds (0033), so an admin whose primary role is SALES can still make
-- OPS moves. The role recorded is the one the move was made as.
CREATE OR REPLACE FUNCTION public.transition_order(
  p_order_id   text,
  p_new_status order_status,
  p_payload    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text;
  v_role     public.role;
  v_order    public.orders%ROWTYPE;
  v_scope    text;
  v_designer text;
BEGIN
  v_clerk_id := app.current_clerk_id();
  IF v_clerk_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF app.current_user_role() IS NULL THEN
    RAISE EXCEPTION 'no role: complete onboarding first';
  END IF;

  IF p_new_status IN ('QUOTED', 'PAYMENT_HELD', 'PAYOUT_RELEASED', 'REFUNDED') THEN
    RAISE EXCEPTION 'money-bearing transition to %: use quote_order / hold_escrow / release_escrow / refund_escrow',
      p_new_status;
  END IF;
  IF p_new_status = 'DISPUTED' THEN
    RAISE EXCEPTION 'raising a dispute requires a reason: use raise_dispute()';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_order.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'a disputed order must be resolved via resolve_dispute()';
  END IF;

  IF v_order.status = 'QC_REVIEW'
     AND p_new_status IN ('CLIENT_PREVIEW', 'REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'a QC decision must be recorded via record_qc_decision()';
  END IF;

  -- Prefer the caller's primary role when it can make the move, so a single-
  -- role user is recorded exactly as before.
  SELECT t.actor_scope, t.actor_role INTO v_scope, v_role
  FROM public.order_transitions t
  WHERE t.from_status = v_order.status
    AND t.to_status   = p_new_status
    AND t.actor_role  = ANY (app.current_roles())
  ORDER BY (t.actor_role = app.current_user_role()) DESC, t.actor_role
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'illegal transition: % -> % by role %',
      v_order.status, p_new_status, app.current_user_role();
  END IF;

  IF v_scope = 'CLIENT_PARTY' AND v_order.client_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the client of this order';
  ELSIF v_scope = 'DESIGNER_PARTY' AND v_order.designer_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the assigned designer of this order';
  END IF;

  IF p_new_status = 'ASSIGNED' THEN
    v_designer := p_payload ->> 'designer_id';
    IF v_designer IS NULL THEN
      RAISE EXCEPTION 'ASSIGNED requires a designer_id in the payload';
    END IF;
    IF NOT app.designer_is_assignable(v_designer) THEN
      RAISE EXCEPTION 'designer is not assignable: must be an ACTIVE designer who has accepted the agreement';
    END IF;
    IF v_order.qc_reviewer_id IS NOT DISTINCT FROM v_designer THEN
      RAISE EXCEPTION 'independent QC: cannot assign the order to its own reviewer';
    END IF;
    UPDATE public.orders
      SET designer_id = v_designer, status = p_new_status
      WHERE id = p_order_id;
  ELSE
    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
  END IF;

  -- The designer's id is no longer copied into the payload. Nothing reads it
  -- from there (the actor and the order row already say who), and payloads
  -- feed client-facing surfaces (timeline, notifications), where one careless
  -- field would let a client recognise the same designer across orders.
  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, v_role,
    jsonb_build_object('from', v_order.status, 'to', p_new_status)
      || (coalesce(p_payload, '{}'::jsonb) - 'designer_id')
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_new_status);
END
$$;

-- Same as 0020's record_qc_decision, but a decision belongs to the pod lead
-- of the order's pod (DECISIONS §2). The QC pool is gone.
CREATE OR REPLACE FUNCTION public.record_qc_decision(
  p_order_id text,
  p_outcome  text,
  p_notes    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text;
  v_order    public.orders%ROWTYPE;
  v_to       public.order_status;
BEGIN
  v_clerk_id := app.current_clerk_id();
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT app.has_role('QC') THEN
    RAISE EXCEPTION 'only QC may record a review decision';
  END IF;

  IF p_outcome IS NULL OR p_outcome NOT IN ('PASS', 'REVISION') THEN
    RAISE EXCEPTION 'outcome must be PASS or REVISION';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF NOT app.is_pod_lead_of(v_order.pod_id) THEN
    RAISE EXCEPTION 'only the pod lead of this order''s pod may review it';
  END IF;

  IF v_order.status <> 'QC_REVIEW' THEN
    RAISE EXCEPTION 'can only review an order in QC_REVIEW (is %)', v_order.status;
  END IF;

  IF v_order.designer_id IS NOT DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'independent QC: you cannot review work you produced';
  END IF;
  IF v_order.client_id IS NOT DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'independent QC: you cannot review your own order';
  END IF;

  v_to := CASE p_outcome WHEN 'PASS' THEN 'CLIENT_PREVIEW' ELSE 'REVISION_REQUESTED' END;

  UPDATE public.orders
    SET status = v_to, qc_reviewer_id = v_clerk_id
    WHERE id = p_order_id;

  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, 'QC',
    jsonb_build_object('from', v_order.status, 'to', v_to, 'qc_outcome', p_outcome)
      || CASE WHEN p_notes IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('notes', p_notes) END
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', v_to);
END
$$;

-- ------------------------------------------------ two open money readers --

-- Found by tests/db/client_anonymity.test.ts: both functions were executable
-- by every role (Postgres grants EXECUTE to PUBLIC by default) and answered
-- for ANY order id — so a designer could read their job's price, and anyone
-- signed in could read any order's money by guessing its id. Nothing in the
-- app calls either; the service-role scripts and the SECURITY DEFINER money
-- functions (which run as the owner) keep working.
REVOKE ALL ON FUNCTION app.escrow_held(text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settlement_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.escrow_held(text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.settlement_state(text) TO service_role;
