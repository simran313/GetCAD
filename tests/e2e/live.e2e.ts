import { expect, test } from "@playwright/test";

import { withDb } from "./db";
import { signedIn } from "./helpers";
import { readState } from "./state";

/**
 * The app notices news (revamp R3): with the client's home open, a new
 * notification for them shows as a toast with "Open" within one poll
 * (20 s), the bell counts it, the bell's list shows it, and opening it from
 * the list marks it read.
 */
test.describe.configure({ timeout: 120_000 });

test("a new notification arrives as a toast, on the bell, and is read from the list", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.setViewportSize({ width: 390, height: 844 });
  const clientId = readState().users.client;
  const summary = `Live check ${Date.now()}: your price is ready.`;

  await page.goto("/home");
  // The first look is silent; wait for it, so the next one sees the new row as news.
  await page.waitForResponse((r) => r.url().includes("/api/notifications") && r.ok(), { timeout: 30_000 });

  await withDb((db) =>
    db.query("INSERT INTO notifications (user_id, kind, order_id, summary) VALUES ($1, 'QUOTED', NULL, $2)", [clientId, summary]),
  );

  // Within one poll: a toast with the summary and "Open".
  const toastLine = page.getByText(summary);
  await expect(toastLine.first()).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole("link", { name: "Open" }).first()).toBeVisible();

  // The bell counts it and lists it; choosing it marks it read.
  const bell = page.getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await dialog.getByRole("button", { name: new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect
    .poll(
      async () =>
        withDb(async (db) => (await db.query("SELECT read_at FROM notifications WHERE user_id = $1 AND summary = $2", [clientId, summary])).rows[0]?.read_at),
      { timeout: 15_000 },
    )
    .not.toBeNull();
  await page.context().close();
});
