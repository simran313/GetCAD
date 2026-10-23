-- 0027_roles_pods_rls.sql
-- Who sees orders now that roles stack and work lives in pods (0033).
--
--   ADMIN (Sales + Ops + Finance) sees every order (A2 "All orders").
--   POD LEAD sees every order in a pod they lead, at any status (Spec §1),
--   and nothing in another pod (DECISIONS §2). The old QC pool policy, which
--   showed every QC user every order in review, is dropped.
--   SALES / OPS / FINANCE held on their own keep the queue rule of 0006: an
--   order is visible while their role has a legal move on it. QC is taken out
--   of that rule, because QC's moves are now pod-scoped.

DROP POLICY orders_qc_select ON orders;

CREATE POLICY orders_pod_lead_select ON orders
  FOR SELECT TO authenticated
  USING (pod_id IS NOT NULL AND pod_id = ANY (app.current_pod_ids()));

DROP POLICY orders_staff_select ON orders;

CREATE POLICY orders_staff_select ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM order_transitions t
      WHERE t.from_status = orders.status
        AND t.actor_role  = ANY (app.current_roles())
        AND t.actor_role  <> 'QC'
        AND t.actor_scope = 'STAFF'
    )
  );

CREATE POLICY orders_admin_select ON orders
  FOR SELECT TO authenticated
  USING (app.is_admin());

-- ------------------------------------------------------- new tables --

ALTER TABLE user_roles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles     FORCE  ROW LEVEL SECURITY;
ALTER TABLE pods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods           FORCE  ROW LEVEL SECURITY;
ALTER TABLE pod_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_members    FORCE  ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE  ROW LEVEL SECURITY;

-- Supabase gives anon/authenticated ALL on every new table by default
-- (ALTER DEFAULT PRIVILEGES). Start from nothing, then grant exactly what the
-- policies below are written for — otherwise the column restrictions would
-- hold locally and not in production.
REVOKE ALL ON user_roles, pods, pod_members, staff_profiles FROM anon, authenticated;
GRANT SELECT ON user_roles, pods, pod_members, staff_profiles TO authenticated;
GRANT ALL    ON user_roles, pods, pod_members, staff_profiles TO service_role;

-- Your own grants; OPS sees everyone's (the Access screen, A4).
CREATE POLICY user_roles_read ON user_roles
  FOR SELECT TO authenticated
  USING (user_id = app.current_clerk_id() OR app.has_role('OPS'));

-- Pods: admin sees all; a member sees their own pod.
CREATE POLICY pods_read ON pods
  FOR SELECT TO authenticated
  USING (
    app.is_admin()
    OR EXISTS (SELECT 1 FROM pod_members pm
               WHERE pm.pod_id = pods.id AND pm.user_id = app.current_clerk_id())
  );

-- Membership: admin sees all; a pod lead sees their pod's roster; anyone sees
-- their own row. A designer never sees who else is in the pod.
CREATE POLICY pod_members_read ON pod_members
  FOR SELECT TO authenticated
  USING (
    app.is_admin()
    OR user_id = app.current_clerk_id()
    OR pod_id = ANY (app.current_pod_ids())
  );

-- Staff names: your own, and OPS. Clients and designers get names only as the
-- alias copied into a thread (0035), never by reading this table.
CREATE POLICY staff_profiles_read ON staff_profiles
  FOR SELECT TO authenticated
  USING (user_id = app.current_clerk_id() OR app.has_role('OPS'));
