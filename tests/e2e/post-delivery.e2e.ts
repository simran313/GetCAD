import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { formatMoney } from "../../lib/money";
import { generateId } from "../../core/ids/generateId";
import { asUser, withDb } from "./db";
import { png } from "./files";
import { act, expectGone, setSetting, settled, signedIn } from "./helpers";
import { pdfText } from "./pdf";
import { E2E_DIR, PERSONAS, readState } from "./state";

/**
 * Phase 8b — after delivery, on the order journey.e2e.ts approved
 * (SPEC-ADDENDUM A9.3–A9.5):
 *
 *   the admin releases the files → the client's preview link (their logo,
 *   nothing of ours; off and expired links read "not available"; only this
 *   order's files) → spec claims (an edited file is not covered, the
 *   delivered file is; upheld credits once; the window closes) → the weight
 *   sheet follows the densities on the Settings screen.
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

const journey = join(E2E_DIR, "journey.json");
let orderId = "";

test.beforeAll(() => {
  if (!existsSync(journey)) throw new Error("journey.e2e.ts did not run first: no approved order to carry on");
  orderId = (JSON.parse(readFileSync(journey, "utf8")) as { orderId: string }).orderId;
});

/** The delivered STL as the client downloads it from Files. */
async function deliveredStl(page: Page): Promise<Buffer> {
  await page.goto("/files");
  const href = await page.locator("li", { hasText: "For your caster" }).first().getByRole("link", { name: "Download" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  return Buffer.from(await res.body());
}

async function openClaim(page: Page, file: Buffer) {
  await page.goto(`/orders/${orderId}/claim`);
  await page.getByLabel("What is wrong").selectOption("wall");
  await page.getByLabel("Describe it").fill("The shank wall measured 0.7 mm at the back.");
  await page.getByLabel("Casting details").fill("Our caster, 18K yellow, 1.5% shrinkage, file unchanged.");
  await page.getByLabel("The file you cast from").setInputFiles({ name: "ring.stl", mimeType: "model/stl", buffer: file });
  await page.getByLabel("Photos of the piece").setInputFiles({ name: "piece.png", mimeType: "image/png", buffer: png([150, 120, 60], 24) });
  await act(page, page.getByRole("button", { name: "Send the claim" }));
  await page.waitForURL(`**/orders/${orderId}*`);
}

const anonymous = async (browser: Browser) => (await browser.newContext()).newPage();

test("the admin releases the files", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  await page.goto(`/orders/${orderId}`);
  const deliver = page.getByRole("button", { name: "Delivered", exact: true });
  await act(page, deliver);
  await expectGone(page, deliver);
  await page.context().close();
});

test("the preview link shows the jeweler's logo, nothing of ours, and only this order", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto("/account");
  await page.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png([20, 60, 140], 48) });
  await act(page, page.getByRole("button", { name: "Upload" }));
  await settled(page, "logo saved", (timeout) => expect(page.getByAltText("Your logo")).toBeVisible({ timeout }));

  await page.goto(`/orders/${orderId}`);
  await act(page, page.getByRole("button", { name: "Create link" }));
  const link = await page.getByLabel("Preview link").inputValue();
  expect(link).toMatch(/\/p\/[A-Za-z0-9_-]{32}$/);
  const path = new URL(link).pathname;

  const viewer = await anonymous(browser);
  await viewer.goto(path);
  await expect(viewer.getByText(PERSONAS.client.business, { exact: true })).toBeVisible();
  await expect(viewer.locator("header img")).toHaveCount(1);
  // Nothing of ours: not in the tab, the page or the favicon.
  await expect(viewer).toHaveTitle("Design preview");
  expect(await viewer.locator("body").innerText()).not.toMatch(/CAD Pillar|GetCAD|\bTCP\b/i);
  await expect(viewer.locator('link[rel~="icon"]')).toHaveCount(0);
  // Every file the page can open is this order's (or the jeweler's logo).
  const html = await viewer.content();
  const objects = [...html.matchAll(/object\/sign\/[^/]+\/([^?"\\]+)/g)].map((m) => decodeURIComponent(m[1]!));
  expect(objects.length).toBeGreaterThan(1);
  for (const key of objects) expect(key, "a file outside this order").toMatch(new RegExp(`^(${orderId}/|logos/)`));
  // A made-up token reaches nothing.
  await viewer.goto(`/p/${"x".repeat(32)}`);
  await expect(viewer.getByText("This preview is not available")).toBeVisible();

  // Turned off: not available.
  await page.goto(`/orders/${orderId}`);
  await act(page, page.getByRole("button", { name: "Turn off" }));
  await viewer.goto(path);
  await expect(viewer.getByText("This preview is not available")).toBeVisible();

  // Expired: not available. (A link lasts at least 7 days: its end date is moved.)
  await act(page, page.getByRole("button", { name: "Create link" }));
  const second = new URL(await page.getByLabel("Preview link").inputValue()).pathname;
  await viewer.goto(second);
  await expect(viewer.getByText(PERSONAS.client.business, { exact: true })).toBeVisible();
  await withDb((db) =>
    db.query("UPDATE preview_links SET expires_at = now() - interval '1 minute' WHERE order_id = $1 AND revoked_at IS NULL", [orderId]),
  );
  await viewer.goto(second);
  await expect(viewer.getByText("This preview is not available")).toBeVisible();

  await viewer.context().close();
  await page.context().close();
});

test("spec claims: an edited file is not covered, the delivered one is, and upheld credits once", async ({ browser }) => {
  const client = await signedIn(browser, "client");
  const stl = await deliveredStl(client);

  // A9.5: a hash mismatch blocks the claim.
  const edited = Buffer.from(stl);
  edited[90] = (edited[90]! + 1) % 256;
  await openClaim(client, edited);
  await expect(client.getByText("Not covered", { exact: true })).toBeVisible();
  await expect(client.getByText(/does not match any file we delivered/)).toBeVisible();

  // The delivered file: open, for the pod lead to re-measure.
  await openClaim(client, stl);
  await expect(client.getByText("Being re-measured", { exact: true })).toBeVisible();

  // The pod lead upholds it.
  const lead = await signedIn(browser, "podLead");
  await lead.goto(`/orders/${orderId}`);
  await lead.getByLabel("Re-measured value").fill("0.74 mm");
  await lead.getByLabel("Decision note").fill("Archived file measures 0.74 mm at the back of the shank.");
  const uphold = lead.getByRole("button", { name: "Uphold · free fix + credit" });
  await act(lead, uphold);
  await expectGone(lead, uphold);
  await lead.context().close();

  // Deciding it again is refused. (Not by a second press in a stale tab:
  // the order page re-checks every 5 s and takes the button away first.)
  const again = await withDb(async (db) => {
    const claim = (await db.query("SELECT id FROM spec_claims WHERE order_id = $1 AND status = 'upheld'", [orderId])).rows[0].id;
    return asUser(db, readState().users.podLead, "SELECT public.decide_spec_claim($1, true, '{}'::jsonb, 'again', $2)", [
      claim,
      generateId(),
    ]).then(
      () => "accepted",
      (e: Error) => e.message,
    );
  });
  expect(again).toMatch(/not yours to decide now/);

  // One credit: the CAD fee paid for this order, once.
  const { credits, paid } = await withDb(async (db) => ({
    credits: Number((await db.query("SELECT count(*) FROM client_credits WHERE order_id = $1 AND kind = 'claim_credit'", [orderId])).rows[0].count),
    paid: Number((await db.query("SELECT coalesce(sum(amount) FILTER (WHERE kind = 'HOLD'), 0) AS paid FROM escrow_ledger WHERE order_id = $1", [orderId])).rows[0].paid),
  }));
  expect(credits).toBe(1);
  await client.goto("/wallet");
  await expect(client.getByText(formatMoney(paid, "USD"), { exact: true }).first()).toBeVisible();
  await client.goto(`/orders/${orderId}`);
  await expect(client.getByText("Upheld", { exact: true })).toBeVisible();
  await client.context().close();
});

test("the claim button goes once the claim window has passed", async ({ browser }) => {
  const client = await signedIn(browser, "client");
  const claimLink = client.getByRole("link", { name: /Open a claim/ });
  await client.goto(`/orders/${orderId}`);
  await expect(claimLink).toBeVisible();

  // Rather than wait 30 days: the window is a setting; at 0 days delivery
  // is already past it.
  const admin = await signedIn(browser, "admin");
  await setSetting(admin, "claim_window_days", "0");
  try {
    await client.goto(`/orders/${orderId}`);
    await expect(client.getByText("Spec guarantee", { exact: true })).toBeVisible();
    await expect(claimLink).toHaveCount(0);
    await client.goto(`/orders/${orderId}/claim`);
    await expect(client.getByText(/Claims are open for 0 days after delivery/)).toBeVisible();
  } finally {
    await setSetting(admin, "claim_window_days", "30");
  }
  await admin.context().close();
  await client.context().close();
});

test("the weight sheet shows 5 alloys and follows the densities on the Settings screen", async ({ browser }) => {
  const client = await signedIn(browser, "client");
  const sheet = async () => {
    const res = await client.request.get(`/api/orders/${orderId}/weight-sheet`);
    expect(res.status()).toBe(200);
    return pdfText(Buffer.from(await res.body()));
  };
  // 312.5 mm³ (the designer's volume) at the default densities.
  const before = await sheet();
  for (const [alloy, grams] of [
    ["10\\s*K gold", "3.63"],
    ["14\\s*K gold", "4.09"],
    ["18\\s*K gold", "4.88"],
    ["Platinum 950", "6.69"],
    ["Sterling silver 925", "3.25"],
  ] as const) {
    expect(before, alloy).toMatch(new RegExp(`${alloy} ${grams.replace(".", "\\.")} g`));
  }

  const admin = await signedIn(browser, "admin");
  await setSetting(admin, "density_14k_mg_cm3", "14200");
  try {
    expect(await sheet()).toMatch(/14\s*K gold 4\.44 g/);
  } finally {
    await setSetting(admin, "density_14k_mg_cm3", "13100");
  }
  await admin.context().close();
  await client.context().close();
});
