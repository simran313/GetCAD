import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { expect, test, type Page } from "@playwright/test";

import { signedIn } from "./helpers";
import { readState, type Persona } from "./state";

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

/** Visit each page; the browser's errors, each with the page and where in the code. */
async function visit(page: Page, paths: string[], label: string): Promise<string[]> {
  const errors: string[] = [];
  let at = "sign-in";
  page.on("pageerror", (e) => errors.push(`${label} ${at}: ${e.message.slice(0, 90)}\n    ${where(e.stack ?? "").join("\n    ")}`));
  for (const path of paths) {
    at = path;
    await page.goto(path);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    // The time-zone report and its re-read happen just after load.
    await page.waitForTimeout(1_500);
  }
  return errors;
}

test.describe.configure({ mode: "serial", timeout: 240_000 });

for (const who of Object.keys(PAGES) as Persona[]) {
  test(`team screens in New York time throw nothing in the browser: ${who}`, async ({ browser }) => {
    const errors: string[] = [];
    // First visit: the device's zone is not known yet, so the page reports it and re-reads.
    const fresh = await signedIn(browser, who, { timezoneId: ZONE, locale: "en-US" });
    errors.push(...(await visit(fresh, PAGES[who]!, `${who} (first visit)`)));
    await fresh.context().close();

    // Later visits: the zone is already known (the cookie), so nothing re-reads.
    const known = await signedIn(browser, who, { timezoneId: ZONE, locale: "en-US" });
    await known.context().addCookies([{ name: "tcp_tz", value: ZONE, url: known.url() }]);
    errors.push(...(await visit(known, PAGES[who]!, `${who} (zone known)`)));
    await known.context().close();

    if (errors.length) console.log(`\n## Browser errors in ${ZONE}\n${errors.join("\n")}\n`);
    expect(errors, "browser errors (see the log above for where)").toEqual([]);
  });
}
