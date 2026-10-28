import { expect, test } from "@playwright/test";

import { withDb } from "./db";
import { signedIn } from "./helpers";
import { readState } from "./state";

/**
 * Phase 12: the portal keeps pages it has just shown in memory for a few
 * seconds (next.config staleTimes) and prefetches the main tabs. Two guards
 * come with that, checked here:
 *
 *   - signing out reloads the page, so nothing shown to one person is kept
 *     in memory for the next one on the same device;
 *   - a second tap on "Start a design" cannot make a second draft.
 */
const state = readState();
const client2 = state.users.client2;
const drafts = () =>
  withDb(async (db) => Number((await db.query("SELECT count(*) FROM orders WHERE client_id = $1 AND status = 'DRAFT'", [client2])).rows[0].count));

test("signing out reloads the page: no page is kept for the next person", async ({ browser }) => {
  const page = await signedIn(browser, "client2");
  await page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first().getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/account");
  // Anything set on this page survives an in-app move, and is gone after a full load.
  await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForLoadState("load");
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept ?? false), "signing out moved in-app; pages may still be in memory").toBe(false);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.context().close();
});

test("a double tap on Start a design makes one draft", async ({ browser }) => {
  const page = await signedIn(browser, "client2");
  await page.goto("/orders/new");
  const before = await drafts();
  await page.getByRole("button", { name: /CAD design/ }).dblclick();
  await page.waitForURL(/\/orders\/[^/]+\/brief/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  // An untouched draft is reused, so the count goes up by one at most.
  expect(await drafts()).toBeLessThanOrEqual(before + 1);
  await page.context().close();
});
