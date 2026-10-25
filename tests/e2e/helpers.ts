import { clerk } from "@clerk/testing/playwright";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";

import { slotFile } from "./files";
import { PERSONAS, type Persona } from "./state";

/** A fresh browser context signed in as one persona (Clerk sign-in token). */
export async function signedIn(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: PERSONAS[persona].email });
  return page;
}

/**
 * Press a button that runs a server action and wait for the action's answer.
 * A server action that throws answers 500: fail here, at the step, rather
 * than at the next assertion.
 */
export async function act(page: Page, button: Locator) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]),
    button.click(),
  ]);
  expect(res.status(), `server action failed on ${page.url()}`).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
}

/** Submit the form a control lives in, by that form's button. */
export async function submitFormOf(page: Page, control: Locator, button: string | RegExp) {
  await act(page, page.locator("form", { has: control }).getByRole("button", { name: button }));
}

/**
 * Tick every box of one checklist column (19), one server action at a time.
 * The sign-off line only opens once the 18 checks are ticked, so after each
 * press wait for the count of unticked boxes to drop before the next.
 */
export async function tickAll(page: Page, column: "Designer" | "QC") {
  const unticked = page.getByRole("button", { name: new RegExp(`^Tick ${column} · line`) });
  for (let i = 0; i < 25; i++) {
    const n = await unticked.count();
    if (n === 0) return;
    await act(page, unticked.first());
    await expect(unticked).toHaveCount(n - 1);
  }
  throw new Error(`${column} checklist did not complete`);
}

export const REQUIRED_SLOTS = ["3DM", "STL", "TV", "PV", "RV", "FV", "BV", "M", "DD", "GW"] as const;

/** The designer's whole version: start, volume, ten files, 19 ticks, submit. */
export async function doDesignerVersion(page: Page, orderId: string) {
  await page.goto(`/work/${orderId}`);
  const start = page.getByRole("button", { name: "Start work" });
  if (await start.isVisible()) {
    await act(page, start);
    await expect(page.getByRole("button", { name: "Start work" })).toHaveCount(0);
  }

  const volume = page.getByLabel("Model volume in cubic millimetres");
  await volume.fill("312.5");
  await submitFormOf(page, volume, "Save");
  await expect(volume).toHaveValue("312.5");

  for (const code of REQUIRED_SLOTS) {
    const input = page.getByLabel(`File for ${code}`, { exact: true });
    await input.setInputFiles(await slotFile(code));
    await submitFormOf(page, input, /Upload|Replace/);
    await expect(page.locator("form", { has: page.getByLabel(`File for ${code}`, { exact: true }) }).getByRole("button", { name: "Replace" })).toBeVisible();
  }

  await page.goto(`/work/${orderId}/checklist`);
  await tickAll(page, "Designer");
  await expect(page.getByText("Ticked 19 / 19")).toBeVisible();

  await page.goto(`/work/${orderId}`);
  const submit = page.getByRole("button", { name: "Submit to QC" });
  await expect(submit).toBeEnabled();
  await act(page, submit);
  // Submitted versions go straight to the pod lead's review.
  await expect(submit).toBeDisabled();
}

/** The order id from a URL like /orders/{id}/… */
export function orderIdFrom(url: string): string {
  const m = new URL(url).pathname.match(/^\/orders\/([^/]+)/);
  if (!m) throw new Error(`not an order URL: ${url}`);
  return m[1]!;
}
