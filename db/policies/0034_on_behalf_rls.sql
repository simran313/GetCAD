-- 0034_on_behalf_rls.sql
-- orders.received_at (0043) is when the email / WhatsApp / call came in. Not
-- an identifier; it joins the column grant of 0029.
GRANT SELECT (received_at) ON orders TO authenticated;

-- Screenshots of the request show the client's name, number or email: the
-- client and the team only, never a designer (owner answer, Phase 4). 0030's
-- policy already leaned on the orders policies; this says it outright.
DROP POLICY order_screenshots_read ON order_screenshots;
CREATE POLICY order_screenshots_read ON order_screenshots
  FOR SELECT TO authenticated
  USING (app.can_see_screenshots(order_id));
