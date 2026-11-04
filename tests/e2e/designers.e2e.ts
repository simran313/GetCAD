import { expect, test } from "@playwright/test";

import { withDb } from "./db";
import { png } from "./files";
import { act, settled, signedIn } from "./helpers";

/**
 * Designers added by the team (owner, 4 Nov 2026): the admin pastes
 * "email - Name", records bank details, uploads a PAN card and opens it,
 * and places the designer in a pod. A pod lead cannot open the page.
 *
 * The designer goes into a second pod with no lead, so Pod One (the
 * journeys' pod) keeps exactly one designer.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const EMAIL = "e2e-newdesigner+clerk_test@getcad.dev";

test("the admin adds a designer, their bank details, a document and a pod", async ({ browser }) => {
  await withDb((db) => db.query("INSERT INTO pods (name) VALUES ('Pod Two') ON CONFLICT DO NOTHING"));
  const page = await signedIn(browser, "admin");
  await page.goto("/admin/designers");
  await page.getByLabel("Designers, one per line").fill(`${EMAIL} - Neha Designer\nno email here`);
  await page.getByRole("button", { name: "Add designers" }).click();
  await expect(page.getByText(/Line 2 \(no email here\): no email on this line/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/(Added 1|Already on file):/)).toBeVisible();

  await page.getByRole("link", { name: /Neha Designer/ }).click();
  await page.waitForURL(/\/admin\/designers\/user_/);
  await expect(page.getByText("Waiting to sign in")).toBeVisible();

  // Diagnostics (CI only shows logs): every action and page refresh, and the browser console.
  const t0 = Date.now();
  page.on("request", (r) => {
    const h = r.headers();
    if (r.method() === "POST" || h["rsc"]) console.log(`[req +${Date.now() - t0}ms] ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")} action=${h["next-action"] ?? "-"} rsc=${h["rsc"] ?? "-"}`);
  });
  page.on("response", (r) => {
    const h = r.request().headers();
    if (r.request().method() === "POST" || h["rsc"]) console.log(`[res +${Date.now() - t0}ms] ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")} revalidated=${r.headers()["x-action-revalidated"] ?? "-"} redirect=${r.headers()["x-action-redirect"] ?? "-"}`);
  });
  page.on("console", (m) => console.log(`[console +${Date.now() - t0}ms] ${m.type()}: ${m.text().slice(0, 300)}`));

  await page.getByLabel("PAN", { exact: true }).fill("abcde1234f");
  await page.getByLabel("Account number", { exact: true }).fill("123456789012");
  await page.getByLabel("IFSC", { exact: true }).fill("sbin0001234");
  await page.getByLabel("Checked against the bank proof and PAN card").check();
  console.log(`[step +${Date.now() - t0}ms] press save`);
  await act(page, page.getByRole("button", { name: /bank details$/ }));
  console.log(`[step +${Date.now() - t0}ms] action answered; pill now: ${await page.locator("text=/No bank details|Verified|To check/").first().textContent().catch(() => "?")}`);
  await settled(page, "bank saved", (timeout) => expect(page.getByText("Verified ··9012")).toBeVisible({ timeout }));
  // Read on the press, in place: the address stays the same.
  await page.getByRole("button", { name: "Show in full" }).click();
  await expect(page.getByText("ABCDE1234F", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide" }).click();

  await page.getByLabel("Files (JPG, PNG, WebP or PDF, up to 10 MB each)").setInputFiles({ name: "pan-card.png", mimeType: "image/png", buffer: png([30, 60, 120], 32) });
  await act(page, page.getByRole("button", { name: "Upload" }));
  await settled(page, "document listed", (timeout) => expect(page.getByText(/pan-card\.png/)).toBeVisible({ timeout }));
  const href = await page.getByRole("link", { name: "Open", exact: true }).first().getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(1, 4).toString()).toBe("PNG");

  await page.getByLabel("Pod lead who sees and assigns this designer").selectOption({ label: "Pod Two · no lead yet" });
  await act(page, page.getByRole("button", { name: "Save", exact: true }));
  await page.goto("/admin/designers");
  await expect(page.getByRole("link", { name: /Neha Designer/ })).toContainText("Pod Two");
  const designerPath = new URL(href!, page.url()).pathname;
  await page.context().close();

  // Nobody else sees it: a pod lead gets no list and no file.
  const lead = await signedIn(browser, "podLead");
  await lead.goto("/admin/designers");
  await expect(lead.getByText("Neha Designer")).toHaveCount(0);
  expect((await lead.request.get(designerPath, { maxRedirects: 0 })).status()).toBe(404);
  await lead.context().close();
});
