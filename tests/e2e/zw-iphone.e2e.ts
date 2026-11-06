import { expect, test, type Page } from "@playwright/test";

import { signedIn } from "./helpers";
import type { Persona } from "./state";

/**
 * The app on a newer iPhone (revamp R1, owner report 6 Nov 2026): the top bar
 * clears the status bar and Dynamic Island, the tab bar clears the home
 * indicator, the top bar stays put while the page scrolls (with the client's
 * WhatsApp and call buttons on it), and no fixed or sticky bar covers
 * another bar or the end of the page.
 *
 * Chromium has no notch (env(safe-area-inset-*) is 0), so the iPhone 15/16
 * Pro insets are put into the two tokens every bar reads (app/globals.css):
 * 59px status bar, 34px home indicator, on a 393 x 852 screen.
 */
const SAFE_TOP = 59;
const SAFE_BOTTOM = 34;

async function asIphone(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(
    ([top, bottom]) => {
      const add = () => {
        const s = document.createElement("style");
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`;
        document.head.appendChild(s);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    },
    [SAFE_TOP, SAFE_BOTTOM],
  );
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Scroll to the end, then measure the bars and the last thing on the page. */
async function measure(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
    };
    const header = document.querySelector("[data-shell] > div > header");
    const nav = document.querySelector('[data-shell] nav[aria-label="Main"].fixed');
    // Bars pinned to the bottom of the screen above the tab bar (order actions,
    // brief Next, save bars), but not toasts, dialogs or the tab bar itself.
    const pinned = [...document.querySelectorAll("#content *")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "sticky") return false;
        if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top > window.innerHeight / 2 && r.bottom > 0;
      })
      .map((el) => box(el)!)
      .filter(Boolean);
    // The last thing a person reads (not a spacer kept for a fixed bar).
    const main = document.querySelector("#content main");
    const last = main ? ([...main.children].filter((el) => el.getAttribute("aria-hidden") !== "true").at(-1) ?? null) : null;
    const actions = header ? [...header.querySelectorAll("a, button")].map((el) => box(el)).filter(Boolean) : [];
    return { header: box(header), nav: box(nav), pinned, last: box(last), actions, height: window.innerHeight };
  });
}

const PAGES: Record<string, { start: string; follow?: RegExp }> = {
  client: { start: "/home", follow: /^\/orders\/[A-Za-z0-9_-]{10,}$/ },
  designer: { start: "/work", follow: /^\/work\/[A-Za-z0-9_-]{10,}$/ },
  podLead: { start: "/qc" },
  admin: { start: "/admin" },
};
const MORE: Record<string, string[]> = {
  client: ["/orders", "/messages", "/files", "/account"],
  designer: ["/messages", "/account"],
  podLead: ["/messages", "/account"],
  admin: ["/admin/orders", "/account"],
};

test.describe.configure({ mode: "serial", timeout: 300_000 });

for (const who of Object.keys(PAGES) as Persona[]) {
  test(`on an iPhone the bars clear the notch and each other: ${who}`, async ({ browser }) => {
    const page = await signedIn(browser, who);
    await asIphone(page);
    const { start, follow } = PAGES[who]!;
    await page.goto(start);
    const paths = [start, ...MORE[who]!];
    if (follow) {
      const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
      const one = hrefs.find((h) => follow.test(h));
      if (one) paths.push(one);
    }

    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      const m = await measure(page);
      const at = `${who} ${path}`;

      // The top bar is on screen after scrolling (sticky), and every button on
      // it is below the status bar / Dynamic Island.
      if (m.header) {
        expect(m.header.top, `${at}: the top bar scrolled away`).toBeGreaterThanOrEqual(-1);
        expect(m.header.top, `${at}: the top bar scrolled away`).toBeLessThanOrEqual(1);
        for (const a of m.actions) expect(a!.top, `${at}: a top-bar button is under the status bar`).toBeGreaterThanOrEqual(SAFE_TOP - 1);
      }
      if (who === "client") expect(m.header, `${at}: the client's top bar (WhatsApp, call) is missing`).not.toBeNull();

      // The tab bar's buttons are above the home indicator.
      if (m.nav) expect(m.nav.bottom, `${at}: the tab bar is not at the bottom`).toBeGreaterThanOrEqual(m.height - 1);

      // Nothing pinned at the bottom sits on the tab bar.
      if (m.nav) {
        for (const p of m.pinned) {
          if (p.top >= m.nav.top - 1) continue; // the tab bar's own row
          expect(p.bottom, `${at}: a bottom bar overlaps the tab bar`).toBeLessThanOrEqual(m.nav.top + 1);
        }
      }

      // The end of the page can be scrolled clear of every bar at the bottom.
      if (m.last) {
        const floor = Math.min(m.nav?.top ?? m.height, ...m.pinned.map((p) => p.top));
        expect(m.last.bottom, `${at}: the end of the page is hidden behind a bottom bar`).toBeLessThanOrEqual(floor + 1);
      }
    }
    await page.context().close();
  });
}
