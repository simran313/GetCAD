import { expect, test } from "@playwright/test";

import { signedIn } from "./helpers";

/**
 * Phase 13e — the calculators: the gold casting weight per metal and the
 * diamond weight from the charts, worked out on the page, as the owner's
 * spreadsheets do. A client never sees them.
 */
test.describe.configure({ timeout: 120_000 });

test("a designer works out the gold casting weight and the diamond weight", async ({ browser }) => {
  const page = await signedIn(browser, "designer");
  await page.goto("/tools");
  await page.getByLabel("18K cast weight (g)").fill("5");
  const gold = page.getByRole("table", { name: "Cast weight per metal" });
  // 18K: 5 + 0.1 casting; with post + 1. 14K: 5.1 ÷ 14 × 12.
  await expect(gold.getByRole("row", { name: /^18K/ })).toContainText("5.10 g");
  await expect(gold.getByRole("row", { name: /^18K/ })).toContainText("6.10 g");
  await expect(gold.getByRole("row", { name: /^14K/ })).toContainText("4.37 g");

  // 20 × round 1.5 mm (0.015 ct) = 0.3 ct = 0.06 g.
  await page.getByLabel("Size (mm)").selectOption("1.5");
  await page.getByLabel("Pieces").fill("20");
  const shapes = page.getByRole("table", { name: "Total by shape" });
  await expect(shapes.getByRole("row", { name: /^Total/ })).toContainText("0.300 ct");
  await expect(shapes.getByRole("row", { name: /^Total/ })).toContainText("0.060 g");

  // A centre stone on a second line.
  await page.getByRole("button", { name: "Add stones" }).click();
  await page.getByLabel("Chart · line 2").selectOption("centre");
  await page.getByLabel("Size (mm)").nth(1).selectOption("6.5");
  await expect(shapes.getByRole("row", { name: /^Total/ })).toContainText("1.300 ct");
  await page.context().close();
});

test("a client is sent home", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto("/tools");
  await page.waitForURL("**/home");
  await page.context().close();
});
