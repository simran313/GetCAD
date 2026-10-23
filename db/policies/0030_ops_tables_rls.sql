-- 0030_ops_tables_rls.sql
-- Read rules for the tables of 0037, from the visibility matrix (Spec §1):
--
--   Jobs          designer: assigned to me · pod lead: own pod · admin: all
--   Checklist     designer: own job (both columns) · pod lead: own pod · admin
--   Payouts       payee: own · admin / finance: all
--   Screenshots   client, pod lead, admin — never a designer
--   Credits       client: own, once decided · admin / finance: all
--
-- Columns naming the staff member who acted (assigned_by, designer_by, qc_by,
-- added_by, decided_by) and the client (client_id) are left out of every
-- grant, as in 0029. No table here has a write grant or a write policy.

ALTER TABLE job_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments    FORCE  ROW LEVEL SECURITY;
ALTER TABLE checklist_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items    FORCE  ROW LEVEL SECURITY;
ALTER TABLE order_checks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_checks       FORCE  ROW LEVEL SECURITY;
ALTER TABLE deliverable_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_slots  FORCE  ROW LEVEL SECURITY;
ALTER TABLE deliverables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables       FORCE  ROW LEVEL SECURITY;
ALTER TABLE order_screenshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_screenshots  FORCE  ROW LEVEL SECURITY;
ALTER TABLE sla_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_events         FORCE  ROW LEVEL SECURITY;
ALTER TABLE client_credits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_credits     FORCE  ROW LEVEL SECURITY;
ALTER TABLE payout_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_obligations FORCE  ROW LEVEL SECURITY;

-- Supabase gives anon/authenticated ALL on every new table by default
-- (ALTER DEFAULT PRIVILEGES). Start from nothing, then grant exactly what the
-- policies below are written for — otherwise the column restrictions would
-- hold locally and not in production.
REVOKE ALL ON job_assignments, checklist_items, order_checks, deliverable_slots, deliverables,
               order_screenshots, sla_events, client_credits, payout_obligations
  FROM anon, authenticated;

GRANT ALL ON job_assignments, checklist_items, order_checks, deliverable_slots, deliverables,
             order_screenshots, sla_events, client_credits, payout_obligations
  TO service_role;

GRANT SELECT ON checklist_items, deliverable_slots, sla_events TO authenticated;
GRANT SELECT (id, order_id, designer_id, assigned_at, override_reason, ended_at)
  ON job_assignments TO authenticated;
GRANT SELECT (order_id, version, item_id, designer_at, qc_at)
  ON order_checks TO authenticated;
GRANT SELECT (order_id, slot, version, file_version_id, file_name, created_at)
  ON deliverables TO authenticated;
GRANT SELECT (id, order_id, object_key, content_type, size_bytes, position, created_at)
  ON order_screenshots TO authenticated;
GRANT SELECT (id, order_id, kind, amount_cents, currency, status, decided_amount_cents,
              decision_reason, decided_at, applied_to_order_id, created_at)
  ON client_credits TO authenticated;
GRANT SELECT (id, order_id, party, amount_paise, status, created_at, exported_at, paid_at)
  ON payout_obligations TO authenticated;

-- Reference data.
CREATE POLICY checklist_items_read ON checklist_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deliverable_slots_read ON deliverable_slots
  FOR SELECT TO authenticated USING (true);

-- Assignments: the designer's own; the order's pod lead; admin.
CREATE POLICY job_assignments_read ON job_assignments
  FOR SELECT TO authenticated
  USING (
    (designer_id = app.current_clerk_id() AND app.current_user_role() = 'DESIGNER')
    OR app.is_admin()
    OR app.order_in_my_pods(order_id)
  );

-- Checklist ticks: the assigned designer, the pod lead, admin. Not the client:
-- they get the signed certificate (Add. A2), not the working sheet.
CREATE POLICY order_checks_read ON order_checks
  FOR SELECT TO authenticated
  USING (
    app.is_assigned_designer(order_id)
    OR app.is_admin()
    OR app.order_in_my_pods(order_id)
  );

-- Deliverables: whoever can see the order, plus the assigned designer.
-- Downloading is still decided by the file gate (core/files/downloadGate).
CREATE POLICY deliverables_read ON deliverables
  FOR SELECT TO authenticated
  USING (
    app.is_assigned_designer(order_id)
    OR EXISTS (SELECT 1 FROM orders o WHERE o.id = deliverables.order_id)
  );

-- Screenshots: the orders policy already excludes designers (0029).
CREATE POLICY order_screenshots_read ON order_screenshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_screenshots.order_id));

-- SLA history: whoever can see the order (client, pod lead, admin, staff).
CREATE POLICY sla_events_read ON sla_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = sla_events.order_id));

-- Credits: a client sees their own once an admin has decided to give them
-- something; pending and rejected credits are the team's business until the
-- team says otherwise. Admin and finance see everything.
CREATE POLICY client_credits_read ON client_credits
  FOR SELECT TO authenticated
  USING (
    (client_id = app.current_clerk_id() AND status IN ('apply_next', 'refunded', 'partial', 'applied'))
    OR app.is_admin()
    OR app.has_role('FINANCE')
  );

-- What I am owed; admin and finance see all of it.
CREATE POLICY payout_obligations_read ON payout_obligations
  FOR SELECT TO authenticated
  USING (
    payee_id = app.current_clerk_id()
    OR app.is_admin()
    OR app.has_role('FINANCE')
  );
