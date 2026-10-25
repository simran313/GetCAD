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
 *   $49, once, and the next at $55.
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
  "/results",
  "/jewelry-cad",
  "/faq",
  "/contact",
  "/apply-designer",
  "/privacy",
  "/terms",
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
});

test("a new jeweler signs up from a campaign and must say how they heard about us", async ({ browser }) => {
  userId = (await backend().users.createUser({ emailAddress: [email], firstName: "Nina", skipPasswordRequirement: true })).id;

  // They land on the pricing page from the campaign, browse, then sign up.
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/pricing?${utm}`);
  await page.goto("/how-it-works");
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });

  // Home sends a new client to Welcome until their business is on file.
  await page.goto("/home");
  await page.waitForURL("**/welcome");
  await page.getByLabel("Business name").fill("Nina Atelier");
  await page.getByLabel("Your name").fill("Nina Rao");
  const heard = page.getByLabel("How did you hear about us?");

  // Required by the browser…
  expect(await heard.evaluate((el) => (el as HTMLSelectElement).validity.valueMissing)).toBe(true);
  // …and by the server, for a form that skips the browser's check.
  await heard.evaluate((el) => el.removeAttribute("required"));
  await refused(page, page.getByRole("button", { name: "Continue" }));
  expect(await withDb(async (db) => (await db.query("SELECT 1 FROM client_profiles WHERE user_id = $1", [userId])).rowCount)).toBe(0);

  await page.goto("/welcome");
  await page.getByLabel("Business name").fill("Nina Atelier");
  await page.getByLabel("Your name").fill("Nina Rao");
  await page.getByLabel("How did you hear about us?").selectOption("instagram");
  await act(page, page.getByRole("button", { name: "Continue" }));
  await settled(page, "profile saved", (timeout) => expect(page.getByRole("heading", { name: "Welcome, Nina Atelier" })).toBeVisible({ timeout }));

  // The campaign they first came from, with their answer.
  const attribution = await withDb(
    async (db) => (await db.query("SELECT heard_about, first_touch FROM marketing_attribution WHERE user_id = $1", [userId])).rows[0],
  );
  expect(attribution?.heard_about).toBe("instagram");
  expect(attribution?.first_touch).toMatchObject({ ...UTM, landing_path: "/pricing" });
  await page.context().close();
});

test("the first design is $49, once; the next is $55", async ({ browser }) => {
  test.skip(!userId, "the sign-up step did not run");
  const [first, second] = await withDb(async (db) => [
    await submittedBrief(db, userId, "Nina first ring"),
    await submittedBrief(db, userId, "Nina second ring"),
  ]);
  const admin = await signedIn(browser, "admin");
  for (const [orderId, price] of [
    [first, "$49.00"],
    [second, "$55.00"],
  ] as const) {
    await admin.goto(`/orders/${orderId}`);
    await act(admin, admin.getByRole("button", { name: "Set quote" }));
    const shown = admin.locator("dt", { hasText: /^Price$/ }).locator("xpath=following-sibling::dd[1]");
    await settled(admin, `quoted ${price}`, (timeout) => expect(shown).toHaveText(price, { timeout }));
  }
  await admin.context().close();
});
