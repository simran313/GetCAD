import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The fixed and sticky bars on a phone (revamp R1, owner report 6 Nov 2026).
 *
 * WHAT WENT WRONG WITHOUT THIS. On newer iPhones the top of the app was
 * blurred and its buttons (WhatsApp, call) sat under the Dynamic Island: the
 * installed app used the "black-translucent" status bar, which draws the
 * page beneath the status bar with white clock and battery, on a white app.
 * Under that, every bar that had to clear the top or bottom bar carried its
 * own pixel number (57px, 72px, 84px, top-14), none of which knew about the
 * status bar or the home indicator, and one action bar sat behind the tab
 * bar altogether.
 *
 * Now the bars read two tokens (app/globals.css): --chrome-top and
 * --chrome-bottom, which add the safe areas once. This keeps it that way.
 */

const PORTAL = ["app/(app)", "components/ui", "components/domain", "components/pwa", "components/shell", "components/support"];

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("the app chrome on a phone", () => {
  const files = PORTAL.flatMap(walk);

  it("the installed app keeps its status bar off the page (dark text on its own band)", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/statusBarStyle:\s*"default"/);
    expect(layout).not.toMatch(/statusBarStyle:\s*"black-translucent"/);
    expect(layout).toMatch(/viewportFit:\s*"cover"/);
  });

  it("the top bar clears the status bar and the tab bar clears the home indicator", () => {
    expect(read("components/shell/app-shell.tsx")).toMatch(/sticky top-0[^"]*pt-\[var\(--safe-top\)\]/);
    expect(read("components/shell/mobile-bottom-nav.tsx")).toMatch(/fixed inset-x-0 bottom-0[^"]*pb-\[var\(--safe-bottom\)\]/);
  });

  it("the chrome tokens are declared once, with the safe areas in them", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/--chrome-top:\s*calc\(var\(--topbar-h\) \+ var\(--safe-top\)\)/);
    expect(css).toMatch(/--chrome-bottom:\s*calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\)\)/);
  });

  it("no bar positions itself with a pixel guess at the bars around it", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const s = read(f);
      // bottom-[calc(57px+…)], bottom-[calc(env(…)+72px)], top-[57px], sticky top-14 …
      const bad = s.match(/(?:top|bottom)-\[(?:calc\()?(?:\d+px\+env|env\(safe-area[^)]*\)\+\d+px|\d{2}px)[^\]]*\]|sticky top-14|"top-14/g);
      if (bad) offenders.push(`${f}: ${bad.join(", ")}`);
    }
    expect(offenders, "use --chrome-top / --chrome-bottom (app/globals.css)").toEqual([]);
  });

  // R6: a transform on the page frame makes it the frame for every fixed bar
  // inside it, so the bars ride mid-page until the animation ends and then
  // jump (layout shift 0.096 on the phone order page).
  it("the page frame never animates or transforms (the fixed bars inside it would ride along)", () => {
    const page = read("components/ui/page.tsx");
    const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
    expect(main).not.toMatch(/animate-in|slide-in-from|translate-|transform|will-change/);
  });

  it("safe areas are read through the tokens, not env() in a class", () => {
    const offenders = files.filter((f) => /env\(safe-area-inset/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
