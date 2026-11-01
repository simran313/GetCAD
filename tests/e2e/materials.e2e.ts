import { expect, test } from "@playwright/test";

import { png } from "./files";
import { act, expectGone, settled, signedIn } from "./helpers";

/**
 * Phase 13b — pod materials end to end: the pod lead shares a chart with a
 * description (straight to storage, then checked), the pod's designer reads
 * it and opens the file, the lead removes it and it is gone for the designer.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const TITLE = `Prong chart ${Date.now()}`;

test("the pod lead shares a chart with the pod", async ({ browser }) => {
  const page = await signedIn(browser, "podLead");
  await page.goto("/materials");
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel(/What it is for/).fill("Minimum prong sizes by stone size.");
  await page.getByLabel("File").setInputFiles({ name: "prongs.png", mimeType: "image/png", buffer: png([40, 40, 40], 32) });
  await act(page, page.getByRole("button", { name: "Share" }));
  await settled(page, "material listed", (timeout) => expect(page.getByText(TITLE)).toBeVisible({ timeout }));
  await page.context().close();
});

test("the pod's designer reads it and opens the file", async ({ browser }) => {
  const page = await signedIn(browser, "designer");
  await page.goto("/materials");
  const card = page.locator("li", { hasText: TITLE });
  await expect(card.getByText("Minimum prong sizes by stone size.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Remove" })).toHaveCount(0);
  const href = await card.getByRole("link", { name: "Open" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(1, 4).toString()).toBe("PNG");
  await page.context().close();
});

test("the lead removes it; the designer no longer sees it", async ({ browser }) => {
  const lead = await signedIn(browser, "podLead");
  await lead.goto("/materials");
  const card = lead.locator("li", { hasText: TITLE });
  await card.getByRole("button", { name: "Remove" }).click();
  await act(lead, lead.getByRole("dialog").getByRole("button", { name: "Remove" }));
  await expectGone(lead, lead.getByText(TITLE));
  await lead.context().close();

  const page = await signedIn(browser, "designer");
  await page.goto("/materials");
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await page.context().close();
});
