import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { clerk } from "@clerk/testing/playwright";
import { test, type Browser, type Page } from "@playwright/test";

import { withDb } from "../e2e/db";
import { E2E_DIR, PERSONAS, readState, type Persona } from "../e2e/state";

/**
 * Every route at 390 (phone), 768 (tablet) and 1440 (desk), signed in as
 * each role, into design-qa/<stage>/<who>/<route>@<width>.png. The stage
 * ("before", "after", …) comes from DESIGN_QA_STAGE.
 */
const STAGE = process.env.DESIGN_QA_STAGE || "local";
const OUT = join(process.cwd(), "design-qa", STAGE);
const WIDTHS = [
  [390, 844],
  [768, 1024],
  [1440, 900],
] as const;

const state = readState();
const journey = existsSync(join(E2E_DIR, "journey.json"))
  ? (JSON.parse(readFileSync(join(E2E_DIR, "journey.json"), "utf8")) as { orderId: string }).orderId
  : null;
const [crawl] = state.fixtures.crawlOrders.sameClient;

const slug = (path: string) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/[/?=&]+/g, "_")).slice(0, 80);

async function shoot(page: Page, who: string, path: string) {
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    const res = await page.goto(path, { waitUntil: "load" }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    // Let fonts and late layout settle; animations are frozen by the screenshot.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const file = join(OUT, who, `${slug(path)}@${width}.png`);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" }).catch((e) => console.log(`! ${who} ${path}: ${e}`));
    console.log(`${who} ${path} @${width}: ${res?.status() ?? "no response"} → ${page.url().replace(/^https?:\/\/[^/]+/, "")}`);
  }
}

async function as(browser: Browser, persona: Persona | null): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  if (persona) await clerk.signIn({ page, emailAddress: PERSONAS[persona].email });
  return page;
}

const orderPages = (id: string | null | undefined) => (id ? [`/orders/${id}`] : []);

const ROUTES: Record<string, { persona: Persona | null; paths: () => Promise<string[]> }> = {
  marketing: {
    persona: null,
    paths: async () => [
      "/", "/how-it-works", "/pricing", "/quality", "/guarantee", "/results", "/jewelry-cad", "/faq",
      "/contact", "/apply-designer", "/privacy", "/terms", "/sign-in", "/sign-up", `/p/${"x".repeat(32)}`,
    ],
  },
  client: {
    persona: "client",
    paths: async () => [
      "/home", "/orders", "/orders?tab=action", "/orders/new", ...orderPages(journey), ...orderPages(crawl),
      ...(journey ? [`/orders/${journey}/claim`, `/messages/${journey}`] : []),
      "/files", "/messages", "/wallet", "/wallet/invoices", "/wallet/transactions",
      "/account", "/account/kit", "/account/security",
    ],
  },
  client2: {
    persona: "client2",
    paths: async () => {
      // A quoted order (pay screen) and a brief in progress, if the journeys left one.
      const quoted = await withDb(async (db) =>
        (await db.query("SELECT id FROM orders WHERE client_id = $1 AND status = 'QUOTED' LIMIT 1", [state.users.client2])).rows[0]?.id as string | undefined,
      );
      return ["/home", "/orders", ...orderPages(quoted), ...(quoted ? [`/orders/${quoted}/pay`] : []), "/wallet"];
    },
  },
  admin: {
    persona: "admin",
    paths: async () => [
      "/home", "/admin", "/admin/orders", "/admin/new-order", "/admin/credits", "/admin/clients", "/admin/access",
      "/admin/access/pods", "/admin/applications", "/admin/leads", "/admin/billing", "/admin/payouts", "/admin/users",
      "/admin/settings", "/dashboard", "/orders", ...orderPages(journey), ...orderPages(crawl), "/messages", "/account",
    ],
  },
  podLead: {
    persona: "podLead",
    paths: async () => [
      "/home", "/qc", "/qc/orders", "/qc/earnings", ...(crawl ? [`/qc/${crawl}`] : []), "/pod/board",
      ...orderPages(journey), "/messages", "/account",
    ],
  },
  designer: {
    persona: "designer",
    paths: async () => [
      "/home", "/work", ...(crawl ? [`/work/${crawl}`, `/work/${crawl}/checklist`] : []), "/work/earnings",
      "/settings/payouts", "/onboarding/designer", "/messages", "/account",
    ],
  },
};

for (const [who, { persona, paths }] of Object.entries(ROUTES)) {
  test(`screens: ${who}`, async ({ browser }) => {
    const page = await as(browser, persona);
    for (const path of await paths()) await shoot(page, who, path);
    await page.context().close();
  });
}
