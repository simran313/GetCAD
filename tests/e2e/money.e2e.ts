import { expect, test, type Page } from "@playwright/test";

import { formatMoney } from "../../lib/money";
import { asService, submittedBrief, withDb } from "./db";
import { act, expectGone, refused, settled, signedIn } from "./helpers";
import { readState } from "./state";

/**
 * Phase 8b — money on screen (Spec §12.3 and §12.8, SPEC-ADDENDUM A9.6–A9.7):
 *
 *   a standard order that misses its first look is credited once (the
 *   sweep run twice, the admin deciding twice); designer and QC pay follow
 *   the category and price; payouts above 40 % of the price are flagged.
 *
 * The briefs are made in the database as the client (journey.e2e.ts drives
 * the brief screens); every quote, payment and decision is made on screen.
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

const state = readState();
const client2 = state.users.client2;

/** The admin quotes an order on its page: category, and price if not the band's. */
async function quote(page: Page, orderId: string, category: string, priceUsd?: number, deadlineHours?: number) {
  await page.goto(`/orders/${orderId}`);
  await page.locator('select[name="category"]').selectOption(category);
  if (priceUsd != null) await page.locator('input[name="price_usd"]').fill(String(priceUsd));
  if (deadlineHours != null) await page.locator('input[name="deadline_hours"]').fill(String(deadlineHours));
  await act(page, page.getByRole("button", { name: "Set quote" }));
  await settled(page, "quoted", (timeout) => expect(page.getByRole("button", { name: "Mark paid" })).toBeVisible({ timeout }));
}

/** The figure under a label in the Payment panel. */
const figure = (page: Page, label: string) =>
  page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");

test("a missed first look is credited once", async ({ browser }) => {
  const orderId = await withDb((db) => submittedBrief(db, client2, "E2E late ring"));
  const admin = await signedIn(browser, "admin");
  await quote(admin, orderId, "C");
  // C at the band price: payouts well under the limit.
  await expect(admin.getByText(/^Payouts are \d+% of the price\.$/)).toBeVisible();
  await act(admin, admin.getByRole("button", { name: "Mark paid" }));
  await expectGone(admin, admin.getByRole("button", { name: "Mark paid" }));
  await act(admin, admin.getByRole("button", { name: "Confirm order" }));
  await expectGone(admin, admin.getByRole("button", { name: "Confirm order" }));

  // Six hours pass without a first look: this order's deadline is moved
  // into the past, and the sweep (the server's job, every few minutes) runs
  // twice.
  const { credits, ref, paid } = await withDb(async (db) => {
    await db.query("UPDATE orders SET sla_due_at = now() - interval '1 minute' WHERE id = $1 AND sla_status = 'running'", [orderId]);
    await asService(db, "SELECT public.sla_sweep()");
    await asService(db, "SELECT public.sla_sweep()");
    return {
      credits: Number((await db.query("SELECT count(*) FROM client_credits WHERE order_id = $1 AND kind = 'sla_credit'", [orderId])).rows[0].count),
      ref: (await db.query("SELECT order_ref FROM orders WHERE id = $1", [orderId])).rows[0].order_ref as string,
      paid: Number((await db.query("SELECT coalesce(sum(amount) FILTER (WHERE kind = 'HOLD'), 0) AS paid FROM escrow_ledger WHERE order_id = $1", [orderId])).rows[0].paid),
    };
  });
  expect(credits, "the sweep run twice made one credit").toBe(1);

  // The admin decides it; the same decision from a second tab is refused.
  const stale = await admin.context().newPage();
  await stale.goto("/admin/credits");
  await admin.goto("/admin/credits");
  const row = (p: Page) => p.locator("li", { hasText: ref });
  await expect(row(admin)).toBeVisible();
  await expect(row(admin).getByText(formatMoney(paid, "USD"), { exact: true })).toBeVisible();
  await act(admin, row(admin).getByRole("button", { name: "Decide" }));
  await expectGone(admin, row(admin));
  await refused(stale, row(stale).getByRole("button", { name: "Decide" }));
  await admin.context().close();

  const decided = await withDb(async (db) =>
    Number((await db.query("SELECT count(*) FROM sla_events WHERE order_id = $1 AND kind = 'credit_decided'", [orderId])).rows[0].count),
  );
  expect(decided).toBe(1);
  const client = await signedIn(browser, "client2");
  await client.goto("/wallet");
  await expect(client.getByText(formatMoney(paid, "USD"), { exact: true }).first()).toBeVisible();
  await client.context().close();
});

test("designer and QC pay follow the category and price; above 40 % is flagged", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");
  const cases = [
    // [category, price $, deadline h, designer pay, QC pay, flagged]
    ["D", 20, undefined, "₹500", "₹500", true],
    ["D", 60, undefined, "₹500", "₹1,000", false],
    ["L", 180, 48, "₹4,000", "₹3,000", true],
  ] as const;
  for (const [category, price, deadline, designer, qc, flagged] of cases) {
    const orderId = await withDb((db) => submittedBrief(db, client2, `E2E ${category} at $${price}`));
    await quote(admin, orderId, category, price, deadline);
    await expect(figure(admin, "Price")).toHaveText(formatMoney(price * 100, "USD"));
    await expect(figure(admin, "Designer pay"), `${category} at $${price}`).toHaveText(designer);
    await expect(figure(admin, "QC pay"), `${category} at $${price}`).toHaveText(qc);
    const warning = admin.getByText(/above the 40% limit/);
    if (flagged) await expect(warning).toBeVisible();
    else await expect(warning).toHaveCount(0);
  }
  await admin.context().close();
});
