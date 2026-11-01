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
  // The website does not load Clerk; the sign-in screen does.
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: PERSONAS[persona].email });
  await page.goto("/home");
  await clerk.loaded({ page });
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
 * Press a button whose server action must be refused (a second credit, an
 * order without a screenshot): the server answers with an error.
 */
export async function refused(page: Page, button: Locator) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 30_000 }),
    button.click(),
  ]);
  expect(res.status(), `server action was accepted on ${page.url()}`).toBeGreaterThanOrEqual(400);
}

/**
 * Set one admin setting on the Settings screen (Phase 8b). Since the
 * redesign the field is found by its key and saved with the page's one save
 * bar; the value is typed in the unit the screen shows (g/cm³ for densities).
 */
export async function setSetting(page: Page, key: string, value: string) {
  await page.goto("/admin/settings");
  const input = page.locator(`input[name="${key}"]`);
  if ((await input.inputValue()) === value) return;
  await input.fill(value);
  await act(page, page.getByRole("button", { name: "Save changes" }));
  await settled(page, `${key} saved`, (timeout) => expect(input).toHaveValue(value, { timeout }));
}

/** A feature switch on the Settings screen, by its label (redesign). */
export function featureSwitch(page: Page, label: string) {
  return page.getByRole("switch", { name: label });
}

/**
 * Check the screen after an action. It should show the new state at once;
 * the order, job and QC pages also re-check every 5 s, so allow 10 s.
 *
 * On failure, say whether a reload shows it (the screen was stale: what
 * app/(app)/orders/loading.tsx used to cause on the team order page) or not
 * (the action did not happen), with what the page showed.
 */
export async function settled(page: Page, what: string, check: (timeout: number) => Promise<void>) {
  try {
    await check(10_000);
  } catch {
    const before = (await page.locator("main").innerText().catch(() => "")).slice(0, 1500);
    await page.reload();
    const afterReload = await check(5_000).then(
      () => "the screen was stale: a reload shows it",
      () => "not even after a reload",
    );
    throw new Error(`${what}: ${afterReload}, on ${page.url()}.\nPage showed:\n${before}`);
  }
}

export const expectGone = (page: Page, locator: Locator) =>
  settled(page, `${locator} gone`, (timeout) => expect(locator).toHaveCount(0, { timeout }));

/** Submit the form a control lives in, by that form's button. */
export async function submitFormOf(page: Page, control: Locator, button: string | RegExp) {
  await act(page, page.locator("form", { has: control }).getByRole("button", { name: button }));
}

/**
 * Pass every line of the QC sheet this viewer may mark (0059: the designer
 * check on /work/…/checklist, the QC manager check on /qc/…), one server
 * action at a time: after each press, wait for the count of lines not yet
 * passed to drop before the next.
 */
export async function passAll(page: Page) {
  const open = page.getByRole("button", { name: /^Pass · /, pressed: false });
  for (let i = 0; i < 20; i++) {
    const n = await open.count();
    if (n === 0) return;
    await act(page, open.first());
    await settled(page, `${n - 1} lines left`, (timeout) => expect(open).toHaveCount(n - 1, { timeout }));
  }
  throw new Error("the QC sheet did not complete");
}

export const REQUIRED_SLOTS = ["3DM", "STL", "RENDER", "TECH"] as const;

/** The designer's whole version: start, volume, four files, the designer check, submit. */
export async function doDesignerVersion(page: Page, orderId: string) {
  await page.goto(`/work/${orderId}`);
  // Assigned, or sent back by QC: either way the version starts here.
  const start = page.getByRole("button", { name: "Start work" });
  await settled(page, "Start work offered", (timeout) => expect(start).toBeVisible({ timeout }));
  await act(page, start);
  await expectGone(page, start);

  // Pause and resume (Phase 13b): one tap each, recorded.
  await act(page, page.getByRole("button", { name: "Pause" }));
  await settled(page, "paused", (timeout) => expect(page.getByRole("button", { name: "Resume" })).toBeVisible({ timeout }));
  await act(page, page.getByRole("button", { name: "Resume" }));
  await settled(page, "resumed", (timeout) => expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout }));

  const volume = page.getByLabel("Model volume in cubic millimetres");
  await volume.fill("312.5");
  await submitFormOf(page, volume, "Save");
  await settled(page, "volume saved", (timeout) => expect(volume).toHaveValue("312.5", { timeout }));

  // Choosing a file uploads it (Phase 13a): browser → storage → checked into the slot.
  for (const code of REQUIRED_SLOTS) {
    const input = page.getByLabel(`File for ${code}`, { exact: true });
    await input.setInputFiles(await slotFile(code));
    const row = page.locator("li", { has: page.getByLabel(`File for ${code}`, { exact: true }) });
    await settled(page, `${code} uploaded`, (timeout) => expect(row.getByRole("button", { name: "Replace" })).toBeVisible({ timeout }));
  }

  await page.goto(`/work/${orderId}/checklist`);
  await passAll(page);
  await expect(page.getByText("9 / 9 passed").first()).toBeVisible();

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
