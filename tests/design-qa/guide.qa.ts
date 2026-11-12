import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { clerk } from "@clerk/testing/playwright";
import { test, type Browser, type Page } from "@playwright/test";

import { withDb } from "../e2e/db";
import { PERSONAS, readState, type Persona } from "../e2e/state";

/**
 * Screenshots for the user guides (docs/guides): the states a full-page
 * route capture cannot show — open menus, the notification panel, the
 * command palette, "Other actions" expanded, a confirmation dialog, the
 * phone's More sheet. Runs only when the design-QA stage starts with
 * "guide" ([design-qa:guide] in the commit message), on the same throwaway
 * stack and fictional e2e data as screens.qa.ts.
 *
 * Nothing here commits a change: every menu and dialog is opened, shot and
 * closed with Escape. Shots go to design-qa/<stage>/guide/<name>.png.
 */
const STAGE = process.env.DESIGN_QA_STAGE || "local";
const OUT = join(process.cwd(), "design-qa", STAGE, "guide");
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(!STAGE.startsWith("guide"), "guide shots run only for a [design-qa:guide…] stage");
test.describe.configure({ timeout: 600_000 });

const state = readState();

/** The first order matching a condition, by SQL against the throwaway database. */
async function orderWhere(where: string, params: unknown[] = []): Promise<string | null> {
  return withDb(async (db) => ((await db.query(`SELECT id FROM orders WHERE ${where} ORDER BY created_at LIMIT 1`, params)).rows[0]?.id as string) ?? null);
}

async function signedIn(browser: Browser, persona: Persona): Promise<Page> {
  const page = await (await browser.newContext({ viewport: DESK })).newPage();
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: PERSONAS[persona].email });
  await page.goto("/home");
  return page;
}

type Step = { name: string; path: string | null; size?: { width: number; height: number }; full?: boolean; then?: (page: Page) => Promise<void> };

async function shoot(page: Page, s: Step) {
  if (!s.path) {
    console.log(`guide ${s.name}: no order in that state, skipped`);
    return;
  }
  try {
    await page.setViewportSize(s.size ?? DESK);
    await page.goto(s.path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    if (s.then) await s.then(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, `${s.name}.png`), fullPage: !!s.full, animations: "disabled" });
    console.log(`guide ${s.name}: ${s.path}`);
  } catch (e) {
    console.log(`! guide ${s.name}: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
  }
}

const click = (name: RegExp, role: "button" | "link" | "menuitem" = "button") => async (page: Page) => {
  await page.getByRole(role, { name }).first().click({ timeout: 5_000 });
};
const expand = (summary: RegExp) => async (page: Page) => {
  await page.locator("summary", { hasText: summary }).first().click({ timeout: 5_000 });
};

test("guide: admin", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  const ready = await orderWhere("status = 'PAYMENT_HELD' AND confirmed_at IS NOT NULL AND designer_id IS NULL");
  const unconfirmed = await orderWhere("status = 'PAYMENT_HELD' AND confirmed_at IS NULL");
  const withDesigner = await orderWhere("status IN ('ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED')");
  const submitted = await orderWhere("status = 'SUBMITTED'");
  const quoted = await orderWhere("status = 'QUOTED'");
  const delivered = await orderWhere("status = 'DELIVERED'");
  const closed = await orderWhere("status = 'CLOSED'");
  const steps: Step[] = [
    { name: "admin-queue", path: "/admin" },
    { name: "admin-user-menu", path: "/admin", then: click(/Asha/) },
    { name: "admin-notifications", path: "/admin", then: click(/^Notifications/) },
    { name: "admin-command-palette", path: "/admin", then: async (p) => { await p.keyboard.press("Control+k"); await p.getByRole("dialog").waitFor({ timeout: 5_000 }); } },
    { name: "admin-order-quote", path: submitted && `/orders/${submitted}`, full: true },
    { name: "admin-order-mark-paid", path: quoted && `/orders/${quoted}`, full: true },
    { name: "admin-order-confirm", path: unconfirmed && `/orders/${unconfirmed}`, full: true, then: expand(/^Other actions/) },
    { name: "admin-order-ready-to-assign", path: ready && `/orders/${ready}`, full: true, then: expand(/^Other actions/) },
    { name: "admin-order-with-designer", path: withDesigner && `/orders/${withDesigner}`, full: true, then: expand(/^Other actions/) },
    { name: "admin-order-delivered", path: delivered && `/orders/${delivered}`, full: true },
    { name: "admin-order-closed", path: closed && `/orders/${closed}`, full: true },
    { name: "admin-orders", path: "/admin/orders" },
    { name: "admin-access", path: "/admin/access" },
    { name: "admin-access-row-menu", path: "/admin/access", then: click(/^More for /) },
    {
      name: "admin-access-suspend-dialog",
      path: "/admin/access",
      then: async (p) => {
        await p.getByRole("button", { name: /^More for / }).nth(1).click({ timeout: 5_000 });
        await p.getByRole("menuitem", { name: /^Suspend/ }).click({ timeout: 5_000 });
        await p.getByRole("dialog").waitFor({ timeout: 5_000 });
      },
    },
    { name: "admin-pods", path: "/admin/access/pods", full: true },
    { name: "admin-designers", path: "/admin/designers", full: true },
    { name: "admin-designer-detail", path: `/admin/designers/${state.users.designer}`, full: true },
    { name: "admin-clients", path: "/admin/clients", full: true },
    { name: "admin-settings", path: "/admin/settings", full: true },
    { name: "admin-payouts", path: "/admin/payouts", full: true },
    { name: "admin-billing", path: "/admin/billing" },
    { name: "admin-credits", path: "/admin/credits" },
    { name: "admin-new-order", path: "/admin/new-order", full: true },
    { name: "admin-messages-order", path: ready && `/messages/${ready}` },
    { name: "admin-phone-queue", path: "/admin", size: PHONE },
    { name: "admin-phone-more", path: "/admin", size: PHONE, then: click(/^More$/) },
  ];
  for (const s of steps) await shoot(page, s);
  await page.context().close();
});

test("guide: pod lead", async ({ browser }) => {
  const page = await signedIn(browser, "podLead");
  const ready = await orderWhere("status = 'PAYMENT_HELD' AND confirmed_at IS NOT NULL AND designer_id IS NULL");
  const qc = await orderWhere("status = 'QC_REVIEW'");
  const steps: Step[] = [
    { name: "pod-qc-queue", path: "/qc" },
    { name: "pod-board", path: "/pod/board", full: true },
    { name: "pod-board-job-actions", path: "/pod/board", full: true, then: expand(/^Move, take back or escalate/) },
    { name: "pod-order-assign", path: ready && `/orders/${ready}`, full: true },
    { name: "pod-qc-review", path: qc && `/qc/${qc}`, full: true },
    { name: "pod-performance", path: "/pod/performance", full: true },
    { name: "pod-materials", path: "/materials", full: true },
    { name: "pod-phone-qc", path: "/qc", size: PHONE },
  ];
  for (const s of steps) await shoot(page, s);
  await page.context().close();
});

test("guide: designer", async ({ browser }) => {
  const page = await signedIn(browser, "designer");
  const job = await orderWhere("designer_id = $1 AND status IN ('IN_PROGRESS', 'ASSIGNED', 'REVISION_REQUESTED')", [state.users.designer]);
  const steps: Step[] = [
    { name: "designer-home", path: "/home" },
    { name: "designer-jobs", path: "/work" },
    { name: "designer-job", path: job && `/work/${job}`, full: true },
    { name: "designer-render-composer", path: job && `/work/${job}`, then: click(/From 4 views/) },
    { name: "designer-final-review", path: job && `/work/${job}/review` },
    { name: "designer-phone-job", path: job && `/work/${job}`, size: PHONE },
  ];
  for (const s of steps) await shoot(page, s);
  await page.context().close();
});

test("guide: client", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  const mine = (status: string) => orderWhere("client_id = $1 AND status = $2", [state.users.client, status]);
  const preview = await mine("CLIENT_PREVIEW");
  const delivered = (await mine("DELIVERED")) ?? (await mine("CLOSED"));
  const working = await orderWhere("client_id = $1 AND status IN ('IN_PROGRESS', 'ASSIGNED', 'PAYMENT_HELD')", [state.users.client]);
  const steps: Step[] = [
    { name: "client-home", path: "/home" },
    { name: "client-new-order", path: "/orders/new" },
    { name: "client-order-working", path: working && `/orders/${working}`, full: true },
    { name: "client-order-menu", path: working && `/orders/${working}`, then: click(/^More for /) },
    { name: "client-review", path: preview && `/orders/${preview}/review`, full: true },
    { name: "client-order-delivered", path: delivered && `/orders/${delivered}`, full: true },
    { name: "client-files", path: "/files", full: true },
    { name: "client-messages", path: working && `/messages/${working}` },
    { name: "client-phone-order", path: working && `/orders/${working}`, size: PHONE },
  ];
  for (const s of steps) await shoot(page, s);
  await page.context().close();
});
