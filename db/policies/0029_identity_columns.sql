-- 0029_identity_columns.sql
-- The read side of 0036: no app user can select a raw user id that belongs to
-- someone else, and designers read their work only through functions.
--
-- COLUMN PRIVILEGES, NOT JUST ROW POLICIES. A row policy decides WHICH rows;
-- it cannot hide a column on a row you may see. So the id columns are left out
-- of the SELECT grant entirely: `SELECT client_id FROM orders` is "permission
-- denied" for every app user, whatever the row. Row policies may still refer
-- to those columns (they are evaluated by the database, not selected by the
-- caller), which is what keeps 0003's "your own orders" policy working.

-- --------------------------------------------------------------- orders --

-- Designers read jobs through visible_orders() / job_brief() only (0036).
DROP POLICY orders_designer_select ON orders;

REVOKE SELECT ON orders FROM authenticated;
GRANT SELECT (
  id, product_type, status, currency,
  price_total, designer_payout, qc_payout, platform_commission,
  deadline_at, current_version_id, created_at, deleted_at,
  service, order_no, order_ref, job_code, category, tier, complex_deadline_hours,
  paid_at, payment_method, sla_started_at, sla_due_at, first_look_at, sla_status,
  source, intake_mode, client_po, designer_payout_paise, qc_payout_paise
) ON orders TO authenticated;
-- Not granted: client_id, designer_id, qc_reviewer_id, org_id, pod_id,
-- pod_lead_id, created_on_behalf_by.

-- ---------------------------------------------------------------- files --

REVOKE SELECT ON file_versions FROM authenticated;
GRANT SELECT (
  id, order_id, version_no, object_key, content_type, size_bytes,
  created_at, deleted_at, kind, uploader_party
) ON file_versions TO authenticated;

-- The designer's way in, now that they cannot read the order row.
CREATE POLICY file_versions_designer_read ON file_versions
  FOR SELECT TO authenticated
  USING (app.is_assigned_designer(order_id));

-- Reference pictures and accent stones are the brief; a designer needs them.
-- Neither carries an identifier (opaque keys; metadata stripped at upload).
CREATE POLICY order_reference_images_designer_read ON order_reference_images
  FOR SELECT TO authenticated
  USING (app.is_assigned_designer(order_id));

CREATE POLICY order_spec_accents_designer_read ON order_spec_accents
  FOR SELECT TO authenticated
  USING (app.is_assigned_designer(order_id));

-- --------------------------------------------------------- disputes, money --

REVOKE SELECT ON disputes FROM authenticated;
GRANT SELECT (
  id, order_id, reason, status, resolution, resolution_notes, created_at, resolved_at
) ON disputes TO authenticated;

REVOKE SELECT ON escrow_ledger FROM authenticated;
GRANT SELECT (
  id, order_id, kind, party, amount, currency, created_at,
  external_ref, idempotency_key, fx_rate
) ON escrow_ledger TO authenticated;

-- ------------------------------------------------------------- messages --

REVOKE SELECT ON messages FROM authenticated;
GRANT SELECT (
  id, order_id, thread_id, sender_party, sender_alias, body, created_at
) ON messages TO authenticated;

DROP POLICY messages_read ON messages;
CREATE POLICY messages_read ON messages
  FOR SELECT TO authenticated
  USING (app.can_read_thread(thread_id));

ALTER TABLE message_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads     FORCE  ROW LEVEL SECURITY;
ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_participants FORCE  ROW LEVEL SECURITY;

-- Supabase gives anon/authenticated ALL on every new table by default
-- (ALTER DEFAULT PRIVILEGES). Start from nothing, then grant exactly what the
-- policies below are written for — otherwise the column restrictions would
-- hold locally and not in production.
REVOKE ALL ON message_threads, thread_participants FROM anon, authenticated;
GRANT SELECT ON message_threads TO authenticated;
GRANT ALL    ON message_threads, thread_participants TO service_role;
-- thread_participants: no grant and no policy. It maps aliases to user ids.

CREATE POLICY message_threads_read ON message_threads
  FOR SELECT TO authenticated
  USING (app.can_read_thread(id));
