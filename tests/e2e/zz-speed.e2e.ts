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
 *             (the progress bar appearing counts)
 *   ready   — after the click, until the new page's heading is there
 *   shown / saved — a chat message: on screen as sending, then saved
 *   team → client — from the team pressing Send to the message being on
 *             the client's open chat (how live the chat is)
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
  return (await loadTimes(page, path)).server;
}

/**
 * A full load: the server's time for the HTML, then two of the Web Vitals
 * as a browser reports them: the largest paint (LCP) and how much the
 * layout moved while loading (CLS).
 */
async function loadTimes(page: Page, path: string): Promise<{ server: number; lcp: number; cls: number }> {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return page.evaluate(
    () =>
      new Promise<{ server: number; lcp: number; cls: number }>((done) => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = Math.max(lcp, e.startTime)))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) cls += shift.value;
          }),
        ).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => done({ server: Math.round(n.responseStart - n.requestStart), lcp: Math.round(lcp), cls: Math.round(cls * 1000) / 1000 }), 50);
      }),
  );
}

/**
 * The slowest response to a press or a key on this page so far: from the
 * input to the next paint, as the browser's Event Timing reports it (what
 * INP is made of). Installed before any page script runs.
 */
const WATCH_INTERACTIONS = () => {
  const w = window as unknown as { __worst: number };
  w.__worst = 0;
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__worst = Math.max(w.__worst, e.duration)))).observe({
    type: "event",
    durationThreshold: 16,
    buffered: true,
  } as PerformanceObserverInit);
};
const worstInteraction = (page: Page) => page.evaluate(() => Math.round((window as unknown as { __worst?: number }).__worst ?? 0));

/** Click a link inside the app (or go Back) and time the first change and the new heading. */
async function softNav(page: Page, link: ReturnType<Page["locator"]> | "back", heading: RegExp): Promise<{ first: number; ready: number }> {
  // Timed in the page itself: Playwright's own waiting polls at 100, 250
  // and 500 ms, which would round every "ready" up to those steps.
  await page.evaluate(
    ({ source, flags }) => {
      const w = window as unknown as { __t0: number; __first: number | null; __ready: number | null };
      w.__first = null;
      w.__ready = null;
      const want = new RegExp(source, flags);
      // React puts the new page in before it changes the address, so
      // "ready" is a matching heading that was not there before the click.
      // (or one React kept and gave new words).
      const before = new Map([...document.querySelectorAll("h1")].map((h) => [h, h.textContent]));
      // First: anything the person can see change (the progress bar, a
      // pending button or the new page). Ready: the new page's heading.
      new MutationObserver((_, obs) => {
        const now = performance.now();
        if (w.__first === null) w.__first = now;
        const h1 = [...document.querySelectorAll("h1")].find((h) => before.get(h) !== h.textContent && want.test(h.textContent?.trim() ?? ""));
        if (w.__ready === null && h1) {
          w.__ready = now;
          obs.disconnect();
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    },
    { source: heading.source, flags: heading.flags },
  );
  // What the click asked the server for, and how long each took: the log
  // under the table says where the time goes.
  const started = Date.now();
  const calls: string[] = [];
  const onDone = (r: import("@playwright/test").Request) => {
    const t = r.timing();
    const u = new URL(r.url());
    if (u.origin === new URL(page.url()).origin && !u.pathname.startsWith("/_next/static")) calls.push(`${r.method()} ${u.pathname}${u.search.includes("_rsc") ? " (rsc)" : ""} ${Math.round(t.responseEnd)} ms`);
  };
  page.on("requestfinished", onDone);
  if (link === "back") {
    await page.evaluate(() => ((window as unknown as { __t0: number }).__t0 = performance.now()));
    await page.goBack();
  } else {
    // The clock starts as the press lands, not when Playwright decides to press.
    await page.evaluate(() =>
      document.addEventListener("click", () => ((window as unknown as { __t0: number }).__t0 = performance.now()), { capture: true, once: true }),
    );
    await link.click();
  }
  await page.getByRole("heading", { level: 1, name: heading }).first().waitFor({ timeout: 30_000 });
  page.off("requestfinished", onDone);
  const href = link === "back" ? "Back" : await link.getAttribute("href").catch(() => "?");
  details.push(`${href} (${Date.now() - started} ms): ${calls.join("; ") || "no requests"}`);
  return page.evaluate(() => {
    const w = window as unknown as { __t0: number; __first: number | null; __ready: number | null };
    const now = performance.now();
    return { first: Math.round((w.__first ?? now) - w.__t0), ready: Math.round((w.__ready ?? now) - w.__t0) };
  });
}

/**
 * Send a chat message and time, from the press: "shown" (the bubble is on
 * screen, as sending) and "saved" (the server has it: the bubble is no
 * longer marked as sending).
 */
async function chatSend(page: Page, text: string): Promise<{ shown: number; saved: number; pressedAt: number }> {
  await page.evaluate((text) => {
    const w = window as unknown as { __t0: number; __wall: number; __shown: number | null; __saved: number | null };
    w.__shown = null;
    w.__saved = null;
    document.addEventListener(
      "click",
      () => {
        w.__t0 = performance.now();
        w.__wall = Date.now();
      },
      { capture: true, once: true },
    );
    new MutationObserver((_, obs) => {
      const log = document.querySelector('[role="log"][aria-label="Messages"]');
      const has = log?.textContent?.includes(text) ?? false;
      const now = performance.now();
      if (has && w.__shown === null) w.__shown = now;
      if (has && w.__saved === null && !log!.textContent!.includes("Sending")) {
        w.__saved = now;
        obs.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, text);
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(() => (window as unknown as { __saved: number | null }).__saved !== null, undefined, { timeout: 30_000 });
  return page.evaluate(() => {
    const w = window as unknown as { __t0: number; __wall: number; __shown: number; __saved: number };
    return { shown: Math.round(w.__shown - w.__t0), saved: Math.round(w.__saved - w.__t0), pressedAt: w.__wall };
  });
}

test.afterAll(async () => {
  await latency(0);
  console.log([`\n## Portal speed (database latency ${LATENCY} ms per call)`, "", "| Who | What | server ms | first ms | ready ms | LCP ms | CLS |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |", ...rows, "", "Requests per click:", ...details.map((d) => `- ${d}`), ""].join("\n"));
});

test("portal speed: client", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await latency(LATENCY);
  await page.context().addInitScript(WATCH_INTERACTIONS);
  const paths = ["/home", "/orders", "/orders/new", "/messages", "/files", "/account", ...(journey ? [`/orders/${journey}`, `/messages/${journey}`] : [])];
  for (const p of paths) {
    const t = await loadTimes(page, p);
    rows.push(`| client | load ${p.replace(journey ?? "~", "<order>")} | ${t.server} | | | ${t.lcp} | ${t.cls} |`);
  }

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
  // A tab seen a moment ago: what a return visit costs.
  for (const [label, heading] of [
    ["Orders", /^Orders$/],
    ["Messages", /^Messages$/],
    ["Orders", /^Orders$/],
  ] as const) {
    const t = await softNav(page, nav.getByRole("link", { name: label, exact: true }), heading);
    rows.push(`| client | click ${label} again | | ${t.first} | ${t.ready} |`);
  }
  if (journey) {
    await page.goto("/orders");
    const t = await softNav(page, page.locator(`a[href="/orders/${journey}"]`).filter({ visible: true }).first(), /.+/);
    rows.push(`| client | click an order | | ${t.first} | ${t.ready} |`);
    const b = await softNav(page, "back", /^Orders$/);
    rows.push(`| client | Back to the list | | ${b.first} | ${b.ready} |`);

    await page.goto(`/messages/${journey}`);
    for (let i = 1; i <= 3; i++) {
      const m = await chatSend(page, `Speed check ${i} ${Date.now()}`);
      rows.push(`| client | send a message (${i}): shown / saved | | ${m.shown} | ${m.saved} |`);
    }
    rows.push(`| client | slowest press or key in the chat (INP) | | ${await worstInteraction(page)} | |`);
  }
  await latency(0);
  await page.context().close();
});

test("portal speed: client on a phone (CPU 4x slower)", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await latency(LATENCY);
  for (const p of ["/home", "/orders", ...(journey ? [`/orders/${journey}`, `/messages/${journey}`] : [])]) {
    const t = await loadTimes(page, p);
    rows.push(`| phone | load ${p.replace(journey ?? "~", "<order>")} | ${t.server} | | | ${t.lcp} | ${t.cls} |`);
  }
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first();
  for (const [label, heading] of [
    ["Orders", /^Orders$/],
    ["Messages", /^Messages$/],
    ["Orders", /^Orders$/],
  ] as const) {
    const t = await softNav(page, nav.getByRole("link", { name: label, exact: true }), heading);
    rows.push(`| phone | click ${label} | | ${t.first} | ${t.ready} |`);
  }
  await latency(0);
  await page.context().close();
});

test("portal speed: a message reaches the other side", async ({ browser }) => {
  test.skip(!journey, "needs the journey's order");
  const client = await signedIn(browser, "client");
  const admin = await signedIn(browser, "admin");
  await latency(LATENCY);
  await client.goto(`/messages/${journey}`);
  await admin.goto(`/messages/${journey}`);
  const tab = admin.getByRole("tab", { name: "Client" });
  if ((await tab.count()) > 0) await tab.click();
  for (let i = 1; i <= 3; i++) {
    const text = `Team speed check ${i} ${Date.now()}`;
    await client.evaluate((text) => {
      const w = window as unknown as { __arrived: number | null };
      w.__arrived = null;
      new MutationObserver((_, obs) => {
        if (document.querySelector('[role="log"][aria-label="Messages"]')?.textContent?.includes(text)) {
          w.__arrived = Date.now();
          obs.disconnect();
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }, text);
    const { pressedAt: sentAt } = await chatSend(admin, text);
    await client.waitForFunction(() => (window as unknown as { __arrived: number | null }).__arrived !== null, undefined, { timeout: 30_000 });
    const arrived = await client.evaluate(() => (window as unknown as { __arrived: number }).__arrived);
    rows.push(`| team → client | message on the client's screen (${i}) | | | ${arrived - sentAt} |`);
  }
  await latency(0);
  await client.context().close();
  await admin.context().close();
});

test("website speed", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Median of three: a single load of a page is noisy.
  for (const p of ["/", "/pricing", "/how-it-works", "/faq"]) {
    const runs = [await loadTimes(page, p), await loadTimes(page, p), await loadTimes(page, p)].sort((a, b) => a.server - b.server);
    const mid = runs[1]!;
    rows.push(`| visitor | load ${p} | ${mid.server} | | | ${mid.lcp} | ${mid.cls} |`);
  }
  await context.close();
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
