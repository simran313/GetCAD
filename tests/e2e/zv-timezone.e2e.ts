import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { PERSONAS, readState, type Persona } from "./state";

/**
 * Team screens in a US time zone throw nothing in the browser.
 *
 * WHY. The marketing-shots run (a browser in New York time) logged
 * "Minified React error #310" (more hooks than the last render) for the
 * admin and the pod lead after they signed in; the rest of the suite runs in
 * UTC and never saw it. A device in another zone reports it once and the
 * page re-reads itself in that zone (components/time-zone.tsx), so this
 * covers both the first visit, when that happens, and later visits, when
 * the zone is already known.
 *
 * Browser errors are mapped back to their source (the e2e build has source
 * maps, tests/e2e/stack/build.mjs), so a failure names the component.
 */
const ZONE = "America/New_York";
const state = readState();
const order = state.fixtures.crawlOrders.sameClient[0];

const PAGES: Partial<Record<Persona, string[]>> = {
  admin: ["/admin", "/admin/orders", `/orders/${order}`, "/messages", "/account"],
  podLead: ["/qc", "/qc/orders", "/pod/board", "/messages", "/account"],
};

const maps = new Map<string, TraceMap | null>();
function where(stack: string): string[] {
  const out: string[] = [];
  for (const line of stack.split("\n").slice(0, 14)) {
    const m = line.match(/\/_next\/(static\/[^\s:)]+\.js):(\d+):(\d+)/);
    if (!m) continue;
    const file = join(process.cwd(), ".next", `${m[1]}.map`);
    if (!maps.has(file)) maps.set(file, existsSync(file) ? new TraceMap(readFileSync(file, "utf8")) : null);
    const map = maps.get(file);
    const pos = map ? originalPositionFor(map, { line: Number(m[2]), column: Number(m[3]) - 1 }) : null;
    out.push(pos?.source ? `${pos.source.replace(/^.*?\/(app|components|lib|core)\//, "$1/")}:${pos.line} ${pos.name ?? ""}`.trim() : `${m[1]}:${m[2]}`);
  }
  return out.filter((l) => !/node_modules|next\/dist|react-dom/.test(l)).slice(0, 6);
}

/**
 * Sign in in New York time and visit each page, catching the browser's
 * errors from the very first load (sign-in included), each with the address
 * it happened on and where in the code.
 */
async function visit(browser: Browser, who: Persona, label: string, paths: string[], zoneKnown: boolean): Promise<string[]> {
  const context = await browser.newContext({ timezoneId: ZONE, locale: "en-US" });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    const path = new URL(page.url()).pathname;
    errors.push(`${label} ${path}: ${e.message.slice(0, 90)}\n    ${where(e.stack ?? "").join("\n    ") || "(no app frames)"}`);
  });
  await page.goto("/sign-in");
  if (zoneKnown) await context.addCookies([{ name: "tcp_tz", value: ZONE, url: page.url() }]);
  await clerk.signIn({ page, emailAddress: PERSONAS[who].email });
  await page.goto("/home");
  await clerk.loaded({ page });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    // The time-zone report and its re-read happen just after load.
    await page.waitForTimeout(1_500);
  }
  await context.close();
  return errors;
}

test.describe.configure({ mode: "serial", timeout: 240_000 });

for (const who of Object.keys(PAGES) as Persona[]) {
  test(`team screens in New York time throw nothing in the browser: ${who}`, async ({ browser }) => {
    const errors = [
      // First visit: the device's zone is not known yet, so the page reports it and re-reads.
      ...(await visit(browser, who, `${who} (first visit)`, PAGES[who]!, false)),
      // Later visits: the zone is already known (the cookie), so nothing re-reads.
      ...(await visit(browser, who, `${who} (zone known)`, PAGES[who]!, true)),
    ];
    if (errors.length) console.log(`\n## Browser errors in ${ZONE}\n${errors.join("\n")}\n`);
    expect(errors, "browser errors (see the log above for where)").toEqual([]);
  });
}
