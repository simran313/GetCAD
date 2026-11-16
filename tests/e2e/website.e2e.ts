import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { submittedBrief, withDb } from "./db";
import { act, refused, settled, signedIn } from "./helpers";

/**
 * Phase 8b — the website to a first price (SPEC-ADDENDUM A9.8, A9.6):
 *
 *   every page loads with UTM tags on; a new jeweler who arrived by an
 *   email campaign signs up, must say how they heard about us, and the
 *   campaign is saved with that answer; their first design is quoted at
 *   $35 (0063: the first design is the same $35 as the next).
 *
 * The new jeweler is a new Clerk user made by Clerk's API (Clerk's own
 * sign-up form, with its bot check and email code, is Clerk's to test),
 * and is deleted after the run.
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

const PAGES = [
  "/",
  "/how-it-works",
  "/pricing",
  "/quality",
  "/guarantee",
  "/jewelry-cad",
  "/faq",
  "/contact",
  "/apply-designer",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/delivery-policy",
  "/engagement-ring-cad",
  "/for-jewelers",
  "/jewelry-rendering",
  "/jewelry-stl-3dm-files",
  "/sketch-to-cad",
  "/cad-file-repair",
  "/jewelry-cad-cost",
  "/compare",
  "/sign-up",
  "/sign-in",
];
const UTM = { utm_source: "e2e-newsletter", utm_medium: "email", utm_campaign: "autumn-launch" };
const utm = new URLSearchParams(UTM).toString();

const email = `e2e-signup-${Date.now()}+clerk_test@getcad.dev`;
let userId = "";
const backend = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

test.afterAll(async () => {
  if (userId) await backend().users.deleteUser(userId);
});

test("every page of the website loads with UTM tags on", async ({ page }) => {
  for (const path of PAGES) {
    const res = await page.goto(`${path}?${utm}`);
    expect(res?.status(), path).toBe(200);
  }
  // Add. A7: the public numbers page shows nothing until the owner turns
  // on public_stats (off in a fresh database).
  expect((await page.goto(`/results?${utm}`))?.status(), "/results while public_stats is off").toBe(404);
});

test("a new jeweler signs up from a campaign and must say how they heard about us", async ({ browser }) => {
  userId = (await backend().users.createUser({ emailAddress: [email], firstName: "Nina", skipPasswordRequirement: true })).id;

  // They land on the pricing page from the campaign, browse, then sign up.
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/pricing?${utm}`);
  await page.goto("/how-it-works");
  await page.goto("/");
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email });

  // A new sign-up sees only the verification screen, never the portal (0068).
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Tell us who you are" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New order" })).toHaveCount(0);
  await page.getByLabel("Business name").fill("Nina Atelier");
  await page.getByLabel("Your name").fill("Nina Rao");
  const heard = page.getByLabel("How did you hear about us?");

  // Required by the browser…
  expect(await heard.evaluate((el) => (el as HTMLSelectElement).validity.valueMissing)).toBe(true);
  // …and by the server, for a form that skips the browser's check.
  await heard.evaluate((el) => el.removeAttribute("required"));
  await refused(page, page.getByRole("button", { name: "Continue" }));
  expect(await withDb(async (db) => (await db.query("SELECT 1 FROM client_profiles WHERE user_id = $1", [userId])).rowCount)).toBe(0);

  await page.goto("/home");
  await page.getByLabel("Business name").fill("Nina Atelier");
  await page.getByLabel("Your name").fill("Nina Rao");
  await page.getByLabel("How did you hear about us?").selectOption("instagram");
  await act(page, page.getByRole("button", { name: "Continue" }));
  await settled(page, "profile saved", (timeout) => expect(page.getByRole("heading", { name: "Verify your business" })).toBeVisible({ timeout }));

  // Still closed: any portal address shows the same screen, and the database
  // refuses an order from an unverified business.
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Verify your business" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unlocks once you're verified" })).toBeVisible();
  await expect(withDb((db) => submittedBrief(db, userId, "Too early"))).rejects.toThrow(/not verified yet/);

  // The business and one proof of registration.
  await page.getByLabel("What kind of business is it?").selectOption("RETAIL_JEWELER");
  await page.getByLabel("Website or Instagram").fill("ninaatelier.example");
  await page.getByLabel("Business address").fill("12 Main St, Austin, TX 78701");
  await page.getByLabel("What is it?").selectOption("EIN_LETTER");
  await page.getByLabel("Proof file").setInputFiles({ name: "ein-letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e\n") });
  await act(page, page.getByRole("button", { name: "Submit for verification" }));
  await settled(page, "submitted", (timeout) => expect(page.getByRole("heading", { name: "We're checking your business" })).toBeVisible({ timeout }));

  // An admin reviews it under Access and approves; the portal opens.
  const admin = await signedIn(browser, "admin");
  await admin.goto("/admin/access#pending");
  await expect(admin.getByRole("link", { name: "ein-letter.pdf" })).toBeVisible();
  await act(admin, admin.getByRole("button", { name: "Approve Nina Atelier" }));
  await admin.context().close();
  expect(await withDb(async (db) => (await db.query("SELECT status FROM users WHERE id = $1", [userId])).rows[0].status)).toBe("ACTIVE");
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Welcome, Nina Atelier" })).toBeVisible();

  // The campaign they first came from, with their answer.
  const attribution = await withDb(
    async (db) => (await db.query("SELECT heard_about, first_touch FROM marketing_attribution WHERE user_id = $1", [userId])).rows[0],
  );
  expect(attribution?.heard_about).toBe("instagram");
  expect(attribution?.first_touch).toMatchObject({ ...UTM, landing_path: "/pricing" });
  await page.context().close();
});

test("the first design and the next are both quoted $35", async ({ browser }) => {
  test.skip(!userId, "the sign-up step did not run");
  const [first, second] = await withDb(async (db) => [
    await submittedBrief(db, userId, "Nina first ring"),
    await submittedBrief(db, userId, "Nina second ring"),
  ]);
  const admin = await signedIn(browser, "admin");
  for (const [orderId, price] of [
    [first, "$35.00"],
    [second, "$35.00"],
  ] as const) {
    await admin.goto(`/orders/${orderId}`);
    await act(admin, admin.getByRole("button", { name: "Set quote" }));
    const shown = admin.locator("dt", { hasText: /^Price$/ }).locator("xpath=following-sibling::dd[1]");
    await settled(admin, `quoted ${price}`, (timeout) => expect(shown).toHaveText(price, { timeout }));
  }
  await admin.context().close();
});
