import { expect, test } from "@playwright/test";

import { signedIn } from "./helpers";

/**
 * Phase 8a — the stack itself, before any journey: a Clerk session token
 * that the database will accept, and a signed-in page that reads from it.
 */
test("Clerk session tokens carry the database role", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  const claims = await page.evaluate(async () => {
    const token = await window.Clerk.session?.getToken();
    return token ? JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) : null;
  });
  expect(claims, "no Clerk session after sign-in").not.toBeNull();
  // Supabase (and PostgREST here) switch to this role. Without it every
  // read runs as anon and returns nothing: turn on Clerk's Supabase
  // integration for this development instance.
  expect(claims.role, "Clerk session token has no role=authenticated claim").toBe("authenticated");
  await page.context().close();
});

test("a signed-in client sees their home, and the database answers", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/account");
  await expect(page.getByLabel("Business name")).toHaveValue("Meera Jewels");
  await expect(page.getByText(/Client code MJ\d+/)).toBeVisible();
  await page.context().close();
});

test("a chosen time zone stays on this device until 'This device' is picked again", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto("/account");
  const zone = page.getByLabel("Time zone");
  await zone.selectOption("America/Los_Angeles");
  await page.reload();
  // The device's own zone (the CI browser's) must not undo the choice.
  await expect(page.getByLabel("Time zone")).toHaveValue("America/Los_Angeles");
  const cookies = Object.fromEntries((await page.context().cookies()).map((c) => [c.name, c.value]));
  expect(cookies.tcp_tz).toBe("America%2FLos_Angeles");
  expect(cookies.tcp_tz_manual).toBe("1");

  await page.getByLabel("Time zone").selectOption("device");
  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("device");
  expect((await page.context().cookies()).some((c) => c.name === "tcp_tz_manual" && c.value === "1")).toBe(false);
  await page.context().close();
});
