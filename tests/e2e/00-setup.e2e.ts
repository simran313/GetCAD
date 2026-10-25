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
