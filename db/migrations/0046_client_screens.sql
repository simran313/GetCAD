-- 0046_client_screens.sql
-- Phase 5b: what the redesigned client screens need from the database, and
-- one money fix found while building the Pay screen.
--
-- CURRENCY FIX. Client prices are US dollars (DECISIONS §4) and quote_order_v2
-- writes cents ($55 = 5500), but the portal's "New order" created drafts in
-- INR — so a quoted order showed, and Razorpay would have charged, ₹55. A
-- quote now always sets the currency to USD, and drafts, submitted and quoted
-- orders not yet paid are corrected. Payment attempts already opened for those
-- quoted orders were opened at the wrong amount and are marked FAILED; the
-- client simply pays again. Paid orders are left exactly as they are.
--
-- SERVICE. A new order starts as CAD or as renders (docs/design N0, N7); the
-- client sets it on their own draft.
--
-- SENDING A BRIEF. submit_brief() is how the redesigned Review screen (N5)
-- sends a draft: refused until the DECISIONS §11 minimum is there (product,
-- a reference picture, size, metal; size is not asked of a render order),
-- then the ordinary DRAFT → SUBMITTED transition.
--
-- CONVERSATIONS. The Messages screen (C7) lists every conversation the caller
-- may read, newest first, with the last message — never who sent it beyond
-- the alias already on the message.

-- ---------------------------------------------------------- currency --

CREATE OR REPLACE FUNCTION app.quote_in_usd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.currency := 'USD';
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_quote_in_usd
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'QUOTED' AND OLD.status IS DISTINCT FROM 'QUOTED')
  EXECUTE FUNCTION app.quote_in_usd();

UPDATE payment_intents pi
  SET status = 'FAILED'
  FROM orders o
  WHERE o.id = pi.order_id
    AND pi.status = 'PENDING'
    AND o.status = 'QUOTED'
    AND o.currency <> 'USD';

UPDATE orders
  SET currency = 'USD'
  WHERE currency <> 'USD'
    AND status IN ('DRAFT', 'SUBMITTED', 'QUOTED');

-- ----------------------------------------------------------- service --

CREATE OR REPLACE FUNCTION public.set_order_service(p_order_id text, p_service public.service_kind)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR (v_order.client_id IS DISTINCT FROM app.current_clerk_id()
                   AND NOT app.team_writes_brief(p_order_id)) THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'the service is fixed once the order has been quoted';
  END IF;
  UPDATE public.orders SET service = p_service WHERE id = p_order_id;
END
$$;

-- ------------------------------------------------------- send brief --

CREATE OR REPLACE FUNCTION public.submit_brief(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_missing text[];
BEGIN
  IF app.current_clerk_id() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.client_id IS DISTINCT FROM app.current_clerk_id() THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'this brief was already sent';
  END IF;

  v_missing := public.brief_missing(p_order_id);
  IF v_order.service = 'render' THEN
    v_missing := array_remove(v_missing, 'size');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'the brief still needs: %', array_to_string(v_missing, ', ');
  END IF;

  RETURN public.transition_order(p_order_id, 'SUBMITTED');
END
$$;

-- ------------------------------------------------------ conversations --

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (
  order_id    text,
  display_ref text,
  status      public.order_status,
  thread_id   text,
  kind        text,
  last_body   text,
  last_alias  text,
  last_mine   boolean,
  last_at     timestamptz,
  messages    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me text := app.current_clerk_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  WITH mine AS (
    SELECT o.id, o.status, o.order_ref, o.job_code, o.created_at, app.order_relation(o.id) AS rel
    FROM public.orders o
    WHERE o.deleted_at IS NULL AND o.status <> 'DRAFT'
  ),
  threads AS (
    SELECT t.id, t.kind, m.id AS order_id, m.status, m.created_at,
           CASE WHEN m.rel = 'DESIGNER' THEN m.job_code ELSE m.order_ref END AS ref
    FROM mine m
    JOIN public.message_threads t ON t.order_id = m.id
    WHERE m.rel IS NOT NULL
      AND t.kind <> 'legacy'
      AND app.can_read_thread(t.id)
  )
  SELECT th.order_id, th.ref, th.status, th.id, th.kind,
         lm.body, lm.sender_alias, lm.sender_id = v_me, lm.created_at,
         (SELECT count(*)::integer FROM public.messages c WHERE c.thread_id = th.id)
  FROM threads th
  LEFT JOIN LATERAL (
    SELECT msg.body, msg.sender_alias, msg.sender_id, msg.created_at
    FROM public.messages msg
    WHERE msg.thread_id = th.id
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT 1
  ) lm ON true
  ORDER BY coalesce(lm.created_at, th.created_at) DESC
  LIMIT 200;
END
$$;

REVOKE ALL ON FUNCTION app.quote_in_usd() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_service(text, public.service_kind) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_brief(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_brief(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_service(text, public.service_kind) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated, service_role;
