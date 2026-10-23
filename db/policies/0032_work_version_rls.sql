-- 0032_work_version_rls.sql
-- orders.work_version (0041) is not an identifier; it joins the column grant
-- of 0029 so screens can show which attempt an order is on.

GRANT SELECT (work_version) ON orders TO authenticated;
