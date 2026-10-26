import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { generateId } from "../../core/ids/generateId";
import { asUser, withDb } from "../e2e/db";
import { E2E_DIR, PERSONAS, readState, type Persona } from "../e2e/state";

/**
 * Every route at 390 (phone), 768 (tablet) and 1440 (desk), signed in as
 * each role, into design-qa/<stage>/<who>/<route>@<width>.png. The stage
 * ("before", "after", …) comes from DESIGN_QA_STAGE.
 *
 * Each route is also run through axe (WCAG 2.2 A/AA) at the phone and desk
 * widths. Serious and critical findings go to design-qa/<stage>/<who>/axe.md
 * beside the screenshots; DESIGN_QA_AXE_STRICT=1 fails the run on any.
 * Clerk's own sign-in widget is left out (not ours to change).
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

interface Finding {
  path: string;
  width: number;
  rule: string;
  impact: string;
  help: string;
  targets: string[];
}
const findings = new Map<string, Finding[]>();

async function audit(page: Page, who: string, path: string, width: number) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude(".cl-rootBox")
    .analyze()
    .catch((e) => {
      console.log(`! axe ${who} ${path} @${width}: ${e}`);
      return null;
    });
  if (!result) return;
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const list = findings.get(who) ?? [];
  for (const v of serious) {
    list.push({ path, width, rule: v.id, impact: v.impact ?? "", help: v.help, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) });
  }
  findings.set(who, list);
  if (serious.length) console.log(`axe ${who} ${path} @${width}: ${serious.map((v) => `${v.id}×${v.nodes.length}`).join(", ")}`);
}

function writeAxeReport(who: string) {
  const list = findings.get(who) ?? [];
  const file = join(OUT, who, "axe.md");
  mkdirSync(dirname(file), { recursive: true });
  const lines = [`# axe: ${who}`, "", list.length === 0 ? "No serious or critical findings." : `${list.length} serious or critical findings.`, ""];
  for (const f of list) {
    lines.push(`- \`${f.path}\` @${f.width} — **${f.rule}** (${f.impact}): ${f.help}`);
    for (const t of f.targets) lines.push(`  - \`${t}\``);
  }
  writeFileSync(file, `${lines.join("\n")}\n`);
  return list.length;
}

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
    if (width !== 768) await audit(page, who, path, width);
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
  preview: {
    persona: null,
    paths: async () => [
      "/design-preview",
      "/design-preview/frame?view=marketing",
      "/design-preview/frame?view=portal",
      "/design-preview/frame?view=client",
    ],
  },
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
      // The brief wizard: a fresh draft, so the screens show it as a client first sees it.
      const draft = await withDb(async (db) => {
        const found = (await db.query("SELECT id FROM orders WHERE client_id = $1 AND status = 'DRAFT' LIMIT 1", [state.users.client2])).rows[0]?.id as string | undefined;
        if (found) return found;
        // None left by the journeys: open one the way the New order screen does.
        const id = generateId();
        await asUser(db, state.users.client2, "SELECT public.create_order($1, 'Brief for the screens', 'USD')", [id]);
        return id;
      });
      return [
        "/home", "/orders", ...orderPages(quoted), ...(quoted ? [`/orders/${quoted}/pay`] : []), "/wallet",
        ...(draft ? [`/orders/${draft}/brief`] : []),
      ];
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

// DESIGN_QA_ONLY=preview,admin limits a run to those groups.
const ONLY = (process.env.DESIGN_QA_ONLY ?? "").split(",").filter(Boolean);
for (const [who, { persona, paths }] of Object.entries(ROUTES).filter(([w]) => ONLY.length === 0 || ONLY.includes(w))) {
  test(`screens: ${who}`, async ({ browser }) => {
    const page = await as(browser, persona);
    for (const path of await paths()) await shoot(page, who, path);
    await page.context().close();
    const serious = writeAxeReport(who);
    console.log(`axe ${who}: ${serious} serious or critical`);
    if (process.env.DESIGN_QA_AXE_STRICT === "1") expect(serious, `axe findings for ${who}: see design-qa/${STAGE}/${who}/axe.md`).toBe(0);
  });
}
