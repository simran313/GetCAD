import { expect, test } from "@playwright/test";

import { asUser, submittedBrief, withDb } from "./db";
import { signedIn } from "./helpers";
import { readState } from "./state";

/**
 * Owner, 7 Nov 2026: the team forwards a client's message to the designer's
 * conversation (and back). The designer gets it as "Forwarded from the
 * client", posted by the team; the brief sits at the top of the chat.
 */
const state = readState();
const client2 = state.users.client2;

test("the team forwards a client's message to the designer", async ({ browser }) => {
  const text = `Thinner shank please ${Date.now()}`;
  const orderId = await withDb(async (db) => {
    const id = await submittedBrief(db, client2, "E2E forward");
    const thread = await db.query("SELECT id FROM message_threads WHERE order_id=$1 AND kind='client_team'", [id]);
    await asUser(db, client2, "SELECT public.post_thread_message($1, $2)", [thread.rows[0].id, text]);
    return id;
  });

  const admin = await signedIn(browser, "admin");
  await admin.goto(`/orders/${orderId}`);
  const card = admin.locator("section", { has: admin.getByRole("tablist", { name: "Conversations" }) });
  await expect(card.getByRole("article", { name: "The order brief" })).toBeVisible();
  const log = card.getByRole("log", { name: "Messages" });
  await expect(log.getByText(text)).toBeVisible();

  await log.getByRole("button", { name: "Forward to designer" }).click();
  const confirm = log.getByRole("group", { name: "Forward this message" });
  await expect(confirm).toContainText("names nobody");
  await confirm.getByRole("button", { name: "Forward to designer" }).click();
  await expect(admin.getByText("Forwarded to the designer.")).toBeVisible();

  const forwarded = await withDb((db) =>
    db.query(
      `SELECT m.body, m.sender_party FROM messages m JOIN message_threads t ON t.id = m.thread_id
        WHERE t.order_id = $1 AND t.kind = 'internal' ORDER BY m.created_at DESC LIMIT 1`,
      [orderId],
    ),
  );
  expect(forwarded.rows[0]).toEqual({ body: `Forwarded from the client:\n${text}`, sender_party: "TEAM" });
  await admin.context().close();
});
