import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { signedIn } from "./helpers";
import { E2E_DIR } from "./state";

/**
 * Portal speed (Phase 11a). Runs last, after the journeys have filled the
 * database. Every database call is delayed by LATENCY ms at the gateway, so
 * the numbers show what a page costs when the database is a network hop away
 * (production): each sequential round trip adds LATENCY.
 *
 *   server  — the HTML response for a full load (layout + page, all queries)
 *   first   — after a click in the app, until the screen first changes
 *   ready   — after the click, until the new page's heading is there
 *
 * Report only: the numbers are printed (and kept in the job log) to compare
 * before and after a change. Nothing here fails the suite.
 */
const LATENCY = 60;
const GATEWAY = "http://127.0.0.1:54321";
const journey = existsSync(join(E2E_DIR, "journey.json"))
  ? (JSON.parse(readFileSync(join(E2E_DIR, "journey.json"), "utf8")) as { orderId: string }).orderId
  : null;

const rows: string[] = [];
const details: string[] = [];
const latency = (ms: number) => fetch(`${GATEWAY}/__latency?ms=${ms}`);

async function serverTime(page: Page, path: string): Promise<number> {
  await page.goto(path, { waitUntil: "load" });
  return page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return Math.round(n.responseStart - n.requestStart);
  });
}

/** Click a link inside the app and time the first change and the new heading. */
async function softNav(page: Page, link: ReturnType<Page["locator"]>, heading: RegExp): Promise<{ first: number; ready: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __t0: number; __first: number | null };
    w.__first = null;
    const target = document.getElementById("content") ?? document.body;
    new MutationObserver((_, obs) => {
      if (w.__first === null) w.__first = performance.now();
      obs.disconnect();
    }).observe(target, { childList: true, subtree: true, characterData: true });
  });
  // What the click asked the server for, and how long each took: the log
  // under the table says where the time goes.
  const started = Date.now();
  const calls: string[] = [];
  const onDone = (r: import("@playwright/test").Request) => {
    const t = r.timing();
    const u = new URL(r.url());
    if (u.origin === new URL(page.url()).origin) calls.push(`${r.method()} ${u.pathname}${u.search.includes("_rsc") ? " (rsc)" : ""} ${Math.round(t.responseEnd)} ms`);
  };
  page.on("requestfinished", onDone);
  await page.evaluate(() => ((window as unknown as { __t0: number }).__t0 = performance.now()));
  await link.click();
  await page.getByRole("heading", { level: 1, name: heading }).first().waitFor({ timeout: 30_000 });
  page.off("requestfinished", onDone);
  details.push(`${await link.getAttribute("href").catch(() => "?")} (${Date.now() - started} ms): ${calls.join("; ") || "no requests"}`);
  return page.evaluate(() => {
    const w = window as unknown as { __t0: number; __first: number | null };
    const now = performance.now();
    return { first: Math.round((w.__first ?? now) - w.__t0), ready: Math.round(now - w.__t0) };
  });
}

test.afterAll(async () => {
  await latency(0);
  console.log([`\n## Portal speed (database latency ${LATENCY} ms per call)`, "", "| Who | What | server ms | first ms | ready ms |", "| --- | --- | ---: | ---: | ---: |", ...rows, "", "Requests per click:", ...details.map((d) => `- ${d}`), ""].join("\n"));
});

test("portal speed: client", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await latency(LATENCY);
  const paths = ["/home", "/orders", "/orders/new", "/messages", "/files", "/account", ...(journey ? [`/orders/${journey}`, `/messages/${journey}`] : [])];
  for (const p of paths) rows.push(`| client | load ${p.replace(journey ?? "~", "<order>")} | ${await serverTime(page, p)} | | |`);

  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first();
  for (const [label, heading] of [
    ["Orders", /^Orders$/],
    ["Messages", /^Messages$/],
    ["Files", /^Files$/],
    ["Home", /Welcome|Home/],
  ] as const) {
    const t = await softNav(page, nav.getByRole("link", { name: label, exact: true }), heading);
    rows.push(`| client | click ${label} | | ${t.first} | ${t.ready} |`);
  }
  if (journey) {
    await page.goto("/orders");
    const t = await softNav(page, page.locator(`a[href="/orders/${journey}"]`).filter({ visible: true }).first(), /.+/);
    rows.push(`| client | click an order | | ${t.first} | ${t.ready} |`);
  }
  await latency(0);
  await page.context().close();
});

test("portal speed: admin", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  await latency(LATENCY);
  for (const p of ["/admin", "/admin/orders", ...(journey ? [`/orders/${journey}`] : [])]) {
    rows.push(`| admin | load ${p.replace(journey ?? "~", "<order>")} | ${await serverTime(page, p)} | | |`);
  }
  await latency(0);
  await page.context().close();
});
