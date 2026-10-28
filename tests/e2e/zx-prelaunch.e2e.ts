import { expect, test, type Page } from "@playwright/test";

import { signedIn } from "./helpers";
import type { Persona } from "./state";

/**
 * Pre-launch pass (Phase 11b). After the journeys have filled the database,
 * each role walks every portal page it can reach by following links, on a
 * phone-sized screen, and every page is checked for:
 *
 *   - a server error (5xx) or a page that fails to load,
 *   - a JavaScript error in the browser (uncaught, or logged as an error),
 *   - a page wider than the screen (sideways scrolling on a phone),
 *   - a picture that did not load,
 *   - a button or link with no name a screen reader could announce.
 *
 * Read-only: it follows links, never presses buttons or submits forms, and
 * skips downloads and anything under /api.
 */
const MAX_PAGES = 70;
const SKIP = [/^\/api\//, /^\/sign-(in|up)/, /^\/design-preview/, /\.(pdf|stl|3dm|zip|csv)$/i, /\/export(\?|$)/];

interface Finding {
  who: Persona;
  path: string;
  kind: string;
  detail: string;
}
const findings: Finding[] = [];
const visited: Record<string, number> = {};

async function walk(page: Page, who: Persona, start: string) {
  const seen = new Set<string>();
  const queue = [start];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Next logs a failed prefetch of a protected route as a network error; those are not page bugs.
    if (m.type() === "error" && !/Failed to load resource|net::ERR_ABORTED|_rsc=/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`);
  });

  while (queue.length > 0 && seen.size < MAX_PAGES) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    errors.length = 0;

    const res = await page.goto(path, { waitUntil: "load" }).catch((e: Error) => {
      findings.push({ who, path, kind: "load failed", detail: e.message.slice(0, 160) });
      return null;
    });
    if (!res) continue;
    if (res.status() >= 500) findings.push({ who, path, kind: `HTTP ${res.status()}`, detail: "server error" });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    const check = await page.evaluate(() => {
      const wide = document.documentElement.scrollWidth > window.innerWidth + 1;
      // The element that is too wide, not its containers: the innermost one
      // past the edge, unless a parent clips or scrolls it (that is by design).
      const past = (el: Element) => el.getBoundingClientRect().right > window.innerWidth + 1;
      const clipped = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.position === "fixed" || s.overflowX !== "visible") return true;
        }
        return false;
      };
      const bad = (el: Element) => past(el) && getComputedStyle(el).position !== "fixed" && !clipped(el);
      const offenders = wide
        ? [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => bad(el) && ![...el.children].some(bad))
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")} "${(el.textContent ?? "").trim().slice(0, 40)}" (${Math.round(el.getBoundingClientRect().right)} px)`)
        : [];
      const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.slice(-60));
      const unnamed = [...document.querySelectorAll<HTMLElement>("button, a[href], [role=button]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const name = (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.textContent ?? "").trim();
          const labelledBy = el.getAttribute("aria-labelledby");
          // A labelled picture inside (an icon with aria-label, an img with alt) names the control.
          return !name && !labelledBy && !el.querySelector("img[alt]:not([alt='']), [aria-label]:not([aria-label=''])");
        })
        .slice(0, 3)
        .map((el) => el.outerHTML.slice(0, 120));
      const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((a) => new URL(a.href, location.href))
        .filter((u) => u.origin === location.origin)
        .map((u) => u.pathname + u.search);
      return { wide, offenders, broken, unnamed, links };
    });

    if (check.wide && check.offenders.length > 0) findings.push({ who, path, kind: "wider than the screen", detail: check.offenders.join(", ") });
    for (const b of check.broken) findings.push({ who, path, kind: "picture did not load", detail: b });
    for (const u of check.unnamed) findings.push({ who, path, kind: "control with no name", detail: u });
    for (const e of new Set(errors)) findings.push({ who, path, kind: "browser error", detail: e });

    for (const l of check.links) {
      if (seen.has(l) || queue.includes(l) || SKIP.some((r) => r.test(l))) continue;
      // Marketing pages are crawled by website.e2e.ts; stay in the portal.
      if (!/^\/(home|orders|messages|files|wallet|account|work|qc|pod|admin|settings|welcome|onboarding)(\/|\?|$)/.test(l)) continue;
      queue.push(l);
    }
  }
  visited[who] = seen.size;
}

test.describe.configure({ mode: "serial", timeout: 600_000 });

for (const [who, start] of [
  ["client", "/home"],
  ["client2", "/home"],
  ["designer", "/work"],
  ["podLead", "/qc"],
  ["admin", "/admin"],
] as const) {
  test(`pre-launch pass: ${who}`, async ({ browser }) => {
    const page = await signedIn(browser, who);
    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, who, start);
    await page.context().close();
  });
}

test.afterAll(() => {
  const lines = [
    "",
    "## Pre-launch pass (390 x 844)",
    "",
    `Pages walked: ${Object.entries(visited).map(([w, n]) => `${w} ${n}`).join(", ")}`,
    "",
    findings.length === 0 ? "No findings." : "| Who | Page | Finding | Detail |\n| --- | --- | --- | --- |",
    ...findings.map((f) => `| ${f.who} | \`${f.path}\` | ${f.kind} | ${f.detail.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
    "",
  ];
  console.log(lines.join("\n"));
});

test("pre-launch pass: no server errors and no browser errors", () => {
  const blocking = findings.filter((f) => f.kind.startsWith("HTTP") || f.kind === "load failed" || f.kind === "browser error");
  expect(blocking, blocking.map((f) => `${f.who} ${f.path}: ${f.kind} ${f.detail}`).join("\n")).toEqual([]);
});
