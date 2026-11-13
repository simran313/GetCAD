#!/usr/bin/env node
/**
 * The social sharing image (Open Graph / X): 1200 × 630, the pillar mark and
 * the name in Geist on white, as on the website. Rendered with the
 * repository's Playwright Chromium, so it uses the real font files.
 *
 *   node scripts/og-image.mjs   →  public/og/the-cad-pillar-jewelry-cad.png
 *
 * Words come from content/claims.ts (confirmed claims only). Re-run after
 * changing them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/og/the-cad-pillar-jewelry-cad.png");
const font = pathToFileURL(join(ROOT, "app/fonts/Geist-Variable.woff2")).href;

const mark = (size) =>
  `<svg viewBox="0 0 78 78" width="${size}" height="${size}" fill="#0A0A0A" aria-hidden="true"><rect x="0" y="0" width="12" height="78" rx="2.4"/><rect x="33" y="0" width="12" height="78" rx="2.4"/><rect x="66" y="0" width="12" height="78" rx="2.4"/></svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url("${font}") format("woff2"); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #FFFFFF; color: #0A0A0A; font-family: Geist, sans-serif; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; }
.brand { display: flex; align-items: center; gap: 20px; font-size: 40px; font-weight: 600; letter-spacing: -0.02em; }
h1 { font-size: 76px; line-height: 1.02; font-weight: 600; letter-spacing: -0.035em; max-width: 960px; }
.sub { margin-top: 24px; font-size: 32px; color: #525252; letter-spacing: -0.01em; }
.foot { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #0A0A0A; padding-top: 24px; font-size: 26px; color: #525252; }
.foot b { color: #0A0A0A; font-weight: 600; }
</style></head><body>
<div class="brand">${mark(44)}<span>The CAD Pillar</span></div>
<div><h1>Jewelry CAD design services for the trade.</h1>
<p class="sub">Castable 3DM and STL files · first look within 6 hours · from $35 a design</p></div>
<div class="foot"><span>Checked twice by senior designers · white-label, NDA by default</span><b>thecadpillar.com</b></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// Loaded from a file so the page may read the font file (setContent cannot).
const tmp = mkdtempSync(join(tmpdir(), "og-"));
writeFileSync(join(tmp, "og.html"), html);
await page.goto(pathToFileURL(join(tmp, "og.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, type: "png" });
await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${OUT}`);
