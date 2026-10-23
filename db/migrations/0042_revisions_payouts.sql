-- 0042_revisions_payouts.sql
-- Phase 3b: client revision rounds, changes as new linked orders, payout
-- obligations when an order closes, the bank-transfer export, the 60-minute
-- designer reminder, and the end of the old quote_order.
--
-- REVISIONS (DECISIONS §8). 2 rounds within 14 days of first look
-- (app_settings revision_rounds / revision_window_days). request_revision()
-- is the only way a client sends a preview back: it needs a note, counts the
-- round and opens a new work version. QC send-backs are not counted. Once the
-- rounds are used or the window has closed, a change is a new order.
--
-- CHANGE ORDERS (owner answer Q5). create_change_order() opens a new order
-- for the same client, product and pod, SUBMITTED with the original brief and
-- the change written into it (order_specs.based_on_order_id /
-- change_summary). It is quoted at its own category and pays its own way.
-- Asking for a paid change on a preview whose rounds are used approves that
-- preview: the change is built on it. Designers are never told which order a
-- change came from: two orders linked for a designer would be two orders of
-- one client (Phase 1 must-fix).
--
-- PAYOUTS (DECISIONS §5, owner answer Q2). When an order reaches CLOSED, the
-- designer and QC pay locked at quote become payout_obligations rows, once
-- each (UNIQUE (order_id, party)), so a QC send-back is never paid twice.
-- in_app_payouts is off in October: finance exports owed rows as a batch,
-- pays them by bank transfer and marks the batch paid.
--
-- REMINDER (Spec notifications). The designer hears 60 minutes before their
-- due time (SLA due − qc_buffer_minutes), once, from the every-minute sweep.

-- ------------------------------------------------------------ revisions --

CREATE TABLE revision_requests (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  round        integer     NOT NULL CHECK (round >= 1),
  note         text        NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 4000),
  requested_by text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  -- The version the designer works on for this round.
  work_version integer     NOT NULL,
  UNIQUE (order_id, round)
);

-- Supabase grants new tables to anon/authenticated by default; reads go
-- through order_revisions() only (policies/0033).
REVOKE ALL ON revision_requests FROM PUBLIC, anon, authenticated;

-- The client's way back is request_revision(), which counts the round.
DELETE FROM order_transitions
WHERE from_status = 'CLIENT_PREVIEW' AND to_status = 'REVISION_REQUESTED' AND actor_role = 'CLIENT';

-- Rounds included, used, and whether one can be asked for now.
CREATE OR REPLACE FUNCTION app.revision_allowance(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order    public.orders%ROWTYPE;
  v_included integer := coalesce(app.setting('revision_rounds'), 2);
  v_days     integer := coalesce(app.setting('revision_window_days'), 14);
  v_used     integer;
  v_ends     timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  SELECT count(*)::integer INTO v_used FROM public.revision_requests WHERE order_id = p_order_id;
  v_ends := v_order.first_look_at + make_interval(days => v_days);
  RETURN jsonb_build_object(
    'included',       v_included,
    'used',           v_used,
    'window_ends_at', v_ends,
    'open',           v_order.status = 'CLIENT_PREVIEW'
                      AND v_used < v_included
                      AND v_ends IS NOT NULL
                      AND now() <= v_ends
  );
END
$$;

REVOKE ALL ON FUNCTION app.revision_allowance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revision_allowance(text) TO service_role;

CREATE OR REPLACE FUNCTION public.revision_allowance(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.order_relation(p_order_id) IS NULL THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;
  RETURN app.revision_allowance(p_order_id);
END
$$;

-- The client sends a preview back with a note (DECISIONS §8).
CREATE OR REPLACE FUNCTION public.request_revision(p_order_id text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_order    public.orders%ROWTYPE;
  v_allow    jsonb;
  v_round    integer;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.acting_role('CLIENT') IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'only the client may ask for a revision';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the client of this order';
  END IF;
  IF v_order.status <> 'CLIENT_PREVIEW' THEN
    RAISE EXCEPTION 'a revision can be asked for on a preview only (is %)', v_order.status;
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'say what should change';
  END IF;
  IF char_length(btrim(p_note)) > 4000 THEN
    RAISE EXCEPTION 'keep the note under 4000 characters';
  END IF;

  v_allow := app.revision_allowance(p_order_id);
  IF NOT (v_allow ->> 'open')::boolean THEN
    RAISE EXCEPTION 'the % included revision rounds are used or the % day window has closed: order the change as a new order',
      v_allow ->> 'included', coalesce(app.setting('revision_window_days'), 14);
  END IF;
  v_round := (v_allow ->> 'used')::integer + 1;

  UPDATE public.orders
    SET status = 'REVISION_REQUESTED', work_version = work_version + 1
    WHERE id = p_order_id;

  INSERT INTO public.revision_requests (order_id, round, note, requested_by, work_version)
  VALUES (p_order_id, v_round, btrim(p_note), v_clerk_id, v_order.work_version + 1);

  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_order_id, v_clerk_id, 'CLIENT',
    jsonb_build_object('from', v_order.status, 'to', 'REVISION_REQUESTED', 'revision_round', v_round)
  );
  PERFORM app.notify(v_order.designer_id, NULL, 'REVISION', p_order_id,
                     format('Changes requested (round %s). See the revision notes on the job.', v_round));
  PERFORM app.notify(v_order.pod_lead_id, NULL, 'REVISION', p_order_id,
                     format('The client asked for changes (round %s).', v_round));

  RETURN jsonb_build_object('order_id', p_order_id, 'to', 'REVISION_REQUESTED', 'round', v_round);
END
$$;

-- The rounds and their notes, for everyone on the order. The note is the
-- client's brief for the round; who wrote it is not returned.
CREATE OR REPLACE FUNCTION public.order_revisions(p_order_id text)
RETURNS TABLE (round integer, note text, requested_at timestamptz, work_version integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.order_relation(p_order_id) IS NULL THEN
    RAISE EXCEPTION 'order not found or not visible';
  END IF;
  RETURN QUERY
  SELECT r.round, r.note, r.requested_at, r.work_version
  FROM public.revision_requests r
  WHERE r.order_id = p_order_id
  ORDER BY r.round;
END
$$;

-- -------------------------------------------------------- change orders --

CREATE OR REPLACE FUNCTION public.create_change_order(
  p_parent_id text,
  p_new_id    text,
  p_note      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clerk_id text := app.current_clerk_id();
  v_parent   public.orders%ROWTYPE;
  v_ref      text;
BEGIN
  IF v_clerk_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF app.acting_role('CLIENT') IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'only the client may order a change';
  END IF;
  IF p_new_id IS NULL OR btrim(p_new_id) = '' THEN
    RAISE EXCEPTION 'a new order id is required';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'say what should change';
  END IF;
  IF char_length(btrim(p_note)) > 4000 THEN
    RAISE EXCEPTION 'keep the note under 4000 characters';
  END IF;

  SELECT * INTO v_parent FROM public.orders WHERE id = p_parent_id FOR UPDATE;
  IF NOT FOUND OR v_parent.client_id IS DISTINCT FROM v_clerk_id THEN
    RAISE EXCEPTION 'not the client of this order';
  END IF;

  IF v_parent.status = 'CLIENT_PREVIEW' THEN
    IF (app.revision_allowance(p_parent_id) ->> 'open')::boolean THEN
      RAISE EXCEPTION 'this preview still has an included revision round: ask for a revision instead';
    END IF;
    -- The change is built on this design, so it is accepted.
    UPDATE public.orders SET status = 'APPROVED' WHERE id = p_parent_id;
    PERFORM audit.log_event(
      'ORDER_STATUS_CHANGED', 'order', p_parent_id, v_clerk_id, 'CLIENT',
      jsonb_build_object('from', 'CLIENT_PREVIEW', 'to', 'APPROVED', 'change_order', p_new_id)
    );
  ELSIF v_parent.status NOT IN ('APPROVED', 'DELIVERED', 'CLOSED') THEN
    RAISE EXCEPTION 'a change can be ordered once the design is approved (is %)', v_parent.status;
  END IF;

  -- Created as a DRAFT and submitted once the brief is copied, so the
  -- reference is minted from the brief's product (0035), like any order.
  INSERT INTO public.orders
    (id, client_id, product_type, status, currency, service, pod_id, pod_lead_id,
     price_total, designer_payout, qc_payout, platform_commission)
  VALUES
    (p_new_id, v_clerk_id, v_parent.product_type, 'DRAFT', v_parent.currency, v_parent.service,
     v_parent.pod_id, v_parent.pod_lead_id, 0, 0, 0, 0);

  -- The original brief, with the change written into it.
  INSERT INTO public.order_specs
  SELECT (jsonb_populate_record(
            NULL::public.order_specs,
            to_jsonb(s) || jsonb_build_object(
              'order_id', p_new_id,
              'based_on_order_id', p_parent_id,
              'change_summary', btrim(p_note))
         )).*
  FROM public.order_specs s
  WHERE s.order_id = p_parent_id;

  INSERT INTO public.order_spec_accents (order_id, position, shape, width_um, quantity, setting)
  SELECT p_new_id, a.position, a.shape, a.width_um, a.quantity, a.setting
  FROM public.order_spec_accents a
  WHERE a.order_id = p_parent_id
    AND EXISTS (SELECT 1 FROM public.order_specs WHERE order_id = p_new_id);

  UPDATE public.orders SET status = 'SUBMITTED' WHERE id = p_new_id
  RETURNING order_ref INTO v_ref;

  PERFORM audit.log_event(
    'ORDER_CREATED', 'order', p_new_id, v_clerk_id, 'CLIENT',
    jsonb_build_object('product_type', v_parent.product_type, 'currency', v_parent.currency,
                       'change_of', p_parent_id)
  );
  PERFORM audit.log_event(
    'ORDER_STATUS_CHANGED', 'order', p_new_id, v_clerk_id, 'CLIENT',
    jsonb_build_object('from', 'DRAFT', 'to', 'SUBMITTED')
  );
  PERFORM app.notify(v_parent.pod_lead_id, v_clerk_id, 'CHANGE_ORDER', p_new_id,
                     'A client ordered a change to an approved design. It needs a quote.');

  RETURN jsonb_build_object('order_id', p_new_id, 'order_ref', v_ref, 'parent_id', p_parent_id);
END
$$;

-- Where an order came from and what was ordered after it. Not for designers:
-- for them two linked orders are two orders of one client.
CREATE OR REPLACE FUNCTION public.order_lineage(p_order_id text)
RETURNS TABLE (direction text, order_id text, order_ref text, status public.order_status)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel text;
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_rel := app.order_relation(p_order_id);
  IF v_rel IS NULL THEN RAISE EXCEPTION 'order not found or not visible'; END IF;
  IF v_rel = 'DESIGNER' THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'parent'::text, o.id, o.order_ref, o.status
  FROM public.order_specs s
  JOIN public.orders o ON o.id = s.based_on_order_id
  WHERE s.order_id = p_order_id
  UNION ALL
  SELECT 'child'::text, o.id, o.order_ref, o.status
  FROM public.order_specs s
  JOIN public.orders o ON o.id = s.order_id
  WHERE s.based_on_order_id = p_order_id
  ORDER BY 1 DESC, 3;
END
$$;

-- -------------------------------------------------------------- payouts --

-- CLOSED → what we owe, once per party.
CREATE OR REPLACE FUNCTION app.create_payout_obligations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text;
BEGIN
  IF NEW.designer_id IS NOT NULL AND coalesce(NEW.designer_payout_paise, 0) > 0 THEN
    INSERT INTO public.payout_obligations (order_id, payee_id, party, amount_paise)
    VALUES (NEW.id, NEW.designer_id, 'DESIGNER', NEW.designer_payout_paise)
    ON CONFLICT (order_id, party) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      PERFORM audit.log_event('PAYOUT_OWED', 'order', NEW.id, NULL, NULL,
        jsonb_build_object('obligation_id', v_id, 'party', 'DESIGNER', 'amount_paise', NEW.designer_payout_paise));
    END IF;
  END IF;

  v_id := NULL;
  IF NEW.qc_reviewer_id IS NOT NULL AND coalesce(NEW.qc_payout_paise, 0) > 0 THEN
    INSERT INTO public.payout_obligations (order_id, payee_id, party, amount_paise)
    VALUES (NEW.id, NEW.qc_reviewer_id, 'QC', NEW.qc_payout_paise)
    ON CONFLICT (order_id, party) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      PERFORM audit.log_event('PAYOUT_OWED', 'order', NEW.id, NULL, NULL,
        jsonb_build_object('obligation_id', v_id, 'party', 'QC', 'amount_paise', NEW.qc_payout_paise));
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_payout_on_close
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'CLOSED' AND OLD.status IS DISTINCT FROM 'CLOSED')
  EXECUTE FUNCTION app.create_payout_obligations();

CREATE OR REPLACE FUNCTION app.require_finance()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (app.is_admin() OR app.has_role('FINANCE')) THEN
    RAISE EXCEPTION 'only finance or an admin may handle payouts';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION app.require_finance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_finance() TO authenticated, service_role;

-- Everything owed and exported, for the payouts screen.
CREATE OR REPLACE FUNCTION public.payout_list()
RETURNS TABLE (
  obligation_id text,
  order_id      text,
  order_ref     text,
  party         text,
  payee_id      text,
  payee_name    text,
  bank_status   text,
  amount_paise  integer,
  status        text,
  export_batch  text,
  created_at    timestamptz,
  exported_at   timestamptz,
  paid_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_finance();
  RETURN QUERY
  SELECT p.id, p.order_id, o.order_ref, p.party, p.payee_id,
         coalesce(d.legal_name, sp.first_name, p.payee_id),
         app.payout_account_status(p.payee_id),
         p.amount_paise, p.status, p.export_batch, p.created_at, p.exported_at, p.paid_at
  FROM public.payout_obligations p
  JOIN public.orders o ON o.id = p.order_id
  LEFT JOIN public.designer_profiles d ON d.user_id = p.payee_id AND d.deleted_at IS NULL
  LEFT JOIN public.staff_profiles sp ON sp.user_id = p.payee_id
  WHERE p.status IN ('owed', 'exported')
     OR p.paid_at > now() - interval '60 days'
  ORDER BY p.status, p.created_at, p.id;
END
$$;

-- Owed rows with bank details become one batch. Rows whose payee has no
-- usable bank account stay owed.
CREATE OR REPLACE FUNCTION public.export_payouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch text;
  v_count integer;
  v_total bigint;
BEGIN
  PERFORM app.require_finance();
  v_batch := 'PB-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD-HH24MISS-MS');

  WITH moved AS (
    UPDATE public.payout_obligations p
      SET status = 'exported', export_batch = v_batch, exported_at = now()
      WHERE p.status = 'owed'
        AND coalesce(app.payout_account_status(p.payee_id), 'REJECTED') <> 'REJECTED'
      RETURNING p.amount_paise
  )
  SELECT count(*)::integer, coalesce(sum(amount_paise), 0) INTO v_count, v_total FROM moved;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'nothing to export: no owed payouts with bank details';
  END IF;

  PERFORM audit.log_event('PAYOUTS_EXPORTED', 'payout_batch', v_batch, app.current_clerk_id(), 'FINANCE',
    jsonb_build_object('count', v_count, 'total_paise', v_total));
  RETURN jsonb_build_object('batch', v_batch, 'count', v_count, 'total_paise', v_total);
END
$$;

-- One batch as bank-transfer rows. The full account number leaves the
-- database only here, to finance, and every read is on the audit log.
CREATE OR REPLACE FUNCTION public.payout_batch_rows(p_batch text)
RETURNS TABLE (
  obligation_id    text,
  order_ref        text,
  party            text,
  beneficiary_name text,
  account_number   text,
  ifsc             text,
  account_type     text,
  bank_status      text,
  amount_paise     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.require_finance();
  IF NOT EXISTS (SELECT 1 FROM public.payout_obligations WHERE export_batch = p_batch) THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  PERFORM audit.log_event('PAYOUT_BATCH_READ', 'payout_batch', p_batch, app.current_clerk_id(), 'FINANCE',
    '{}'::jsonb, true);

  RETURN QUERY
  SELECT p.id, o.order_ref, p.party, a.beneficiary_name, a.account_number, a.ifsc, a.account_type,
         a.status, p.amount_paise
  FROM public.payout_obligations p
  JOIN public.orders o ON o.id = p.order_id
  LEFT JOIN public.payout_accounts a ON a.user_id = p.payee_id
  WHERE p.export_batch = p_batch
  ORDER BY a.beneficiary_name, o.order_ref, p.party;
END
$$;

-- Finance sent the transfers.
CREATE OR REPLACE FUNCTION public.mark_payout_batch_paid(p_batch text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   record;
  v_count integer := 0;
BEGIN
  PERFORM app.require_finance();
  FOR v_row IN
    UPDATE public.payout_obligations p
      SET status = 'paid', paid_at = now()
      WHERE p.export_batch = p_batch AND p.status = 'exported'
      RETURNING p.order_id, p.payee_id, p.amount_paise
  LOOP
    PERFORM app.notify(v_row.payee_id, NULL, 'PAYOUT', v_row.order_id,
                       format('Your pay of ₹%s for this job was sent.', to_char(v_row.amount_paise / 100.0, 'FM999,999,990.00')));
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no exported payouts in batch %', p_batch;
  END IF;
  PERFORM audit.log_event('PAYOUTS_PAID', 'payout_batch', p_batch, app.current_clerk_id(), 'FINANCE',
    jsonb_build_object('count', v_count));
  RETURN v_count;
END
$$;

-- ------------------------------------------------------------- reminder --

ALTER TABLE sla_events DROP CONSTRAINT sla_events_kind_check;
ALTER TABLE sla_events ADD CONSTRAINT sla_events_kind_check
  CHECK (kind IN ('started', 'met', 'breached', 'credit_pending', 'credit_decided', 'designer_reminder'));

-- 0040's sweep, plus the designer's 60-minute reminder. Returns breaches.
CREATE OR REPLACE FUNCTION public.sla_sweep(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_paid   integer;
  v_auto   boolean := app.flag('auto_sla_credit');
  v_buffer interval := make_interval(mins => coalesce(app.setting('qc_buffer_minutes'), 60));
  v_count  integer := 0;
BEGIN
  FOR v_order IN
    SELECT * FROM public.orders o
    WHERE o.sla_status = 'running' AND o.first_look_at IS NULL
      AND o.designer_id IS NOT NULL
      AND o.status IN ('ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED')
      AND p_now >= o.sla_due_at - v_buffer - interval '60 minutes'
      AND p_now <  o.sla_due_at - v_buffer
      AND NOT EXISTS (SELECT 1 FROM public.sla_events e
                      WHERE e.order_id = o.id AND e.kind = 'designer_reminder')
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.sla_events (order_id, kind, at, detail)
    VALUES (v_order.id, 'designer_reminder', p_now,
            jsonb_build_object('designer_due_at', v_order.sla_due_at - v_buffer));
    PERFORM app.notify(v_order.designer_id, NULL, 'DUE_SOON', v_order.id,
                       'Due in 60 minutes: submit this job for QC.');
  END LOOP;

  FOR v_order IN
    SELECT * FROM public.orders
    WHERE sla_status = 'running' AND first_look_at IS NULL AND sla_due_at < p_now
    ORDER BY sla_due_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders SET sla_status = 'breached' WHERE id = v_order.id;
    INSERT INTO public.sla_events (order_id, kind, at, detail)
    VALUES (v_order.id, 'breached', p_now, jsonb_build_object('due_at', v_order.sla_due_at));
    PERFORM audit.log_event('SLA_BREACHED', 'order', v_order.id, NULL, NULL,
                            jsonb_build_object('due_at', v_order.sla_due_at, 'tier', v_order.tier));
    PERFORM app.notify(v_order.pod_lead_id, NULL, 'SLA', v_order.id,
                       'The first-look deadline on an order in your pod has passed.');

    IF coalesce(v_order.tier, 'standard') = 'standard' THEN
      SELECT coalesce(sum(amount) FILTER (WHERE kind = 'HOLD'), 0)::integer INTO v_paid
      FROM public.escrow_ledger WHERE order_id = v_order.id;
      IF v_paid > 0 THEN
        INSERT INTO public.client_credits
          (client_id, order_id, kind, amount_cents, currency, status, decided_at, decided_amount_cents, decision_reason)
        VALUES
          (v_order.client_id, v_order.id, 'sla_credit', v_paid, v_order.currency,
           CASE WHEN v_auto THEN 'apply_next' ELSE 'pending' END,
           CASE WHEN v_auto THEN p_now END,
           CASE WHEN v_auto THEN v_paid END,
           CASE WHEN v_auto THEN 'automatic SLA credit' END)
        ON CONFLICT (order_id, kind) DO NOTHING;
        INSERT INTO public.sla_events (order_id, kind, at) VALUES (v_order.id, 'credit_pending', p_now);
      END IF;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.sla_sweep(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_sweep(timestamptz) TO service_role;

-- ------------------------------------------------------- notifications --

-- 0041's fan-out, plus approval: the designer and pod lead hear when the
-- client approves (Spec notifications).
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
    IF NEW.actor_id IS NOT DISTINCT FROM v_client THEN
      PERFORM app.notify(v_designer, NEW.actor_id, 'FILE', NEW.entity_id, 'A new file was added to your order.');
    END IF;
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
    ELSIF v_to = 'APPROVED' THEN
      PERFORM app.notify(v_designer, NEW.actor_id, 'APPROVED', NEW.entity_id, 'The client approved this job.');
      PERFORM app.notify(v_pod_lead, NEW.actor_id, 'APPROVED', NEW.entity_id, 'The client approved an order in your pod.');
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

-- ----------------------------------------------------- old quote_order --

-- Phase 2 replaced it with quote_order_v2 (category bands, INR pay); the app
-- stopped calling it then. Nothing may set a free USD split any more.
DROP FUNCTION IF EXISTS public.quote_order(text, integer, integer, integer, integer);

-- --------------------------------------------------------------- grants --

REVOKE ALL ON FUNCTION public.revision_allowance(text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_revision(text, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_revisions(text)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_change_order(text, text, text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_lineage(text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payout_list()                           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_payouts()                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payout_batch_rows(text)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_payout_batch_paid(text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_payout_obligations()                FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revision_allowance(text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_revision(text, text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_revisions(text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_change_order(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_lineage(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payout_list()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_payouts()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payout_batch_rows(text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_batch_paid(text)          TO authenticated, service_role;
