import { clerk } from "@clerk/testing/playwright";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";

import { slotFile } from "./files";
import { PERSONAS, type Persona } from "./state";

/** A fresh browser context signed in as one persona (Clerk sign-in token). */
export async function signedIn(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Browser-side errors go to the CI log: a page that throws in the browser
  // is otherwise invisible from here.
  page.on("pageerror", (e) => console.log(`[browser:${persona}] ${e.message}`));
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
    page
      .waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 30_000 })
      .catch(() => {
        // Usually the browser refusing to submit: a required field it thinks is empty.
        throw new Error(`pressing ${button} sent nothing to the server within 30 s on ${page.url()}`);
      }),
    button.click(),
  ]);
  expect(res.status(), `server action failed on ${page.url()}`).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
}

/**
 * Check the screen after an action.
 *
 * Known issue (Phase 8a): the order, job and QC pages sometimes keep showing
 * the state from before an action, though the action was saved. So: give the
 * screen 30 s to update by itself (those pages poll every 5 s); if it has not,
 * reload, and log a STALE SCREEN line so every case shows in the CI log while
 * the journey carries on. Still wrong after a reload means the action did not
 * happen: fail, with what the page showed.
 */
export async function settled(page: Page, what: string, check: (timeout: number) => Promise<void>) {
  const started = Date.now();
  try {
    await check(30_000);
    const s = Math.round((Date.now() - started) / 1000);
    if (s > 3) console.log(`SLOW SCREEN: ${what} after ${s} s on ${page.url()}`);
    return;
  } catch {
    const before = (await page.locator("main").innerText().catch(() => "")).slice(0, 1500);
    await page.reload();
    try {
      await check(5_000);
    } catch {
      throw new Error(`${what}: not so even after a reload.\nPage showed:\n${before}`);
    }
    console.log(`STALE SCREEN: ${what} only after a reload on ${page.url()}`);
  }
}

export const expectGone = (page: Page, locator: Locator) =>
  settled(page, `${locator} gone`, (timeout) => expect(locator).toHaveCount(0, { timeout }));

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
    await settled(page, `${n - 1} ${column} boxes left`, (timeout) => expect(unticked).toHaveCount(n - 1, { timeout }));
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
    await expectGone(page, page.getByRole("button", { name: "Start work" }));
  }

  const volume = page.getByLabel("Model volume in cubic millimetres");
  await volume.fill("312.5");
  await submitFormOf(page, volume, "Save");
  await settled(page, "volume saved", (timeout) => expect(volume).toHaveValue("312.5", { timeout }));

  for (const code of REQUIRED_SLOTS) {
    const input = page.getByLabel(`File for ${code}`, { exact: true });
    await input.setInputFiles(await slotFile(code));
    await submitFormOf(page, input, /Upload|Replace/);
    const replace = page.locator("form", { has: page.getByLabel(`File for ${code}`, { exact: true }) }).getByRole("button", { name: "Replace" });
    await settled(page, `${code} uploaded`, (timeout) => expect(replace).toBeVisible({ timeout }));
  }

  await page.goto(`/work/${orderId}/checklist`);
  await tickAll(page, "Designer");
  await expect(page.getByText("Ticked 19 / 19")).toBeVisible();

  await page.goto(`/work/${orderId}`);
  const submit = page.getByRole("button", { name: "Submit to QC" });
  await expect(submit).toBeEnabled();
  await act(page, submit);
  // Submitted versions go straight to the pod lead's review.
  await settled(page, "submitted to QC", (timeout) => expect(submit).toBeDisabled({ timeout }));
}

/** The order id from a URL like /orders/{id}/… */
export function orderIdFrom(url: string): string {
  const m = new URL(url).pathname.match(/^\/orders\/([^/]+)/);
  if (!m) throw new Error(`not an order URL: ${url}`);
  return m[1]!;
}
