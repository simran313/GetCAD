#!/usr/bin/env node
/**
 * Renders the handbook's diagrams from their editable sources.
 *
 *   docs/diagrams/src/<name>.mjs   the source: boxes, groups and arrows as data (edit these)
 *   docs/diagrams/<name>.svg       vector, used by the Markdown (GitHub shows it) and the PDF
 *   docs/diagrams/png/<name>.png   2x raster, used by the Word document
 *
 *   node docs/document-generation/diagrams.mjs
 *
 * A source exports `default { title, width, height, groups?, nodes, edges }`.
 * Coordinates are in pixels from the top left. A node is a box
 * { id, x, y, w, h, label, sub?, kind? }; kind picks the style (app, data,
 * external, actor, state, terminal, note, warn). An edge is
 * { from, to, label?, dashed?, via?: [[x, y], ...], fromSide?, toSide? }:
 * without `via` it runs straight between the nearest sides.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "docs/diagrams/src");
const OUT = join(ROOT, "docs/diagrams");

export const PALETTE = {
  ink: "#0A0A0A",
  muted: "#525252",
  line: "#404040",
  hair: "#D4D4D4",
  kinds: {
    app: { fill: "#FFFFFF", stroke: "#0A0A0A", text: "#0A0A0A" },
    data: { fill: "#EEF2F6", stroke: "#334155", text: "#0F172A" },
    external: { fill: "#F7F3EC", stroke: "#7A5C2E", text: "#3B2A12" },
    actor: { fill: "#F5F5F5", stroke: "#737373", text: "#171717" },
    state: { fill: "#FFFFFF", stroke: "#0A0A0A", text: "#0A0A0A" },
    terminal: { fill: "#0A0A0A", stroke: "#0A0A0A", text: "#FFFFFF" },
    off: { fill: "#FDF2F2", stroke: "#9B2C2C", text: "#7F1D1D" },
    note: { fill: "#FFFFFF", stroke: "#A3A3A3", text: "#525252" },
    warn: { fill: "#FFF7ED", stroke: "#B54708", text: "#7A2E0E" },
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function anchor(n, toward, side) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const s = side ?? (Math.abs(toward[0] - cx) / n.w > Math.abs(toward[1] - cy) / n.h ? (toward[0] > cx ? "r" : "l") : toward[1] > cy ? "b" : "t");
  return { r: [n.x + n.w, cy], l: [n.x, cy], b: [cx, n.y + n.h], t: [cx, n.y] }[s];
}

export function toSvg(d) {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}" font-family="Geist, 'Helvetica Neue', Arial, sans-serif" role="img" aria-label="${esc(d.title)}">`,
    `<title>${esc(d.title)}</title>`,
    `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${PALETTE.line}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#FFFFFF"/>`,
  );
  for (const g of d.groups ?? []) {
    out.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="10" fill="${g.fill ?? "#FAFAFA"}" stroke="${PALETTE.hair}" stroke-dasharray="${g.solid ? "" : "5 4"}"/>`);
    out.push(`<text x="${g.x + 12}" y="${g.y + 20}" font-size="11" font-weight="600" letter-spacing="0.06em" fill="${PALETTE.muted}">${esc(g.label.toUpperCase())}</text>`);
  }
  for (const e of d.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) throw new Error(`${d.title}: edge ${e.from} -> ${e.to} names a missing node`);
    const pts = e.via?.length
      ? [anchor(a, e.via[0], e.fromSide), ...e.via, anchor(b, e.via[e.via.length - 1], e.toSide)]
      : [anchor(a, [b.x + b.w / 2, b.y + b.h / 2], e.fromSide), anchor(b, [a.x + a.w / 2, a.y + a.h / 2], e.toSide)];
    out.push(`<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${e.color ?? PALETTE.line}" stroke-width="1.4" ${e.dashed ? 'stroke-dasharray="5 4"' : ""} marker-end="url(#arr)"/>`);
    if (e.label) {
      const i = Math.floor((pts.length - 1) / 2);
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const lx = e.labelAt?.[0] ?? (x1 + x2) / 2;
      const ly = e.labelAt?.[1] ?? (y1 + y2) / 2;
      const lines = String(e.label).split("\n");
      const w = Math.max(...lines.map((l) => l.length)) * 5.6 + 10;
      out.push(`<rect x="${lx - w / 2}" y="${ly - 8 - (lines.length - 1) * 6}" width="${w}" height="${14 + (lines.length - 1) * 12}" rx="3" fill="#FFFFFF" opacity="0.92"/>`);
      lines.forEach((l, k) =>
        out.push(`<text x="${lx}" y="${ly + 3 - (lines.length - 1) * 6 + k * 12}" font-size="10" fill="${PALETTE.muted}" text-anchor="middle">${esc(l)}</text>`),
      );
    }
  }
  for (const n of d.nodes) {
    const k = PALETTE.kinds[n.kind ?? "app"];
    const rx = n.kind === "state" || n.kind === "terminal" || n.kind === "off" ? n.h / 2 : n.kind === "actor" ? 18 : 6;
    if (n.kind === "data") {
      out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.4"/>`);
      out.push(`<line x1="${n.x}" y1="${n.y + 7}" x2="${n.x + n.w}" y2="${n.y + 7}" stroke="${k.stroke}" stroke-width="0.8" opacity="0.5"/>`);
    } else {
      out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="${n.kind === "note" ? 1 : 1.4}" ${n.kind === "note" ? 'stroke-dasharray="3 3"' : ""}/>`);
    }
    const lines = String(n.label).split("\n");
    const subs = n.sub ? String(n.sub).split("\n") : [];
    const total = lines.length * 15 + subs.length * 12;
    let y = n.y + n.h / 2 - total / 2 + 11;
    for (const l of lines) {
      out.push(`<text x="${n.x + n.w / 2}" y="${y}" font-size="${n.size ?? 12.5}" font-weight="600" fill="${k.text}" text-anchor="middle">${esc(l)}</text>`);
      y += 15;
    }
    for (const l of subs) {
      out.push(`<text x="${n.x + n.w / 2}" y="${y - 1}" font-size="10" fill="${n.kind === "terminal" ? "#D4D4D4" : PALETTE.muted}" text-anchor="middle">${esc(l)}</text>`);
      y += 12;
    }
  }
  if (d.caption) out.push(`<text x="${d.width - 12}" y="${d.height - 10}" font-size="9.5" fill="#A3A3A3" text-anchor="end">${esc(d.caption)}</text>`);
  out.push("</svg>");
  return out.join("\n");
}

export async function renderAll({ png = true } = {}) {
  mkdirSync(join(OUT, "png"), { recursive: true });
  const names = readdirSync(SRC).filter((f) => f.endsWith(".mjs")).sort();
  const svgs = [];
  for (const f of names) {
    const spec = (await import(pathToFileURL(join(SRC, f)).href + `?t=${Date.now()}`)).default;
    const svg = toSvg(spec);
    const name = f.replace(/\.mjs$/, "");
    writeFileSync(join(OUT, `${name}.svg`), svg + "\n");
    svgs.push({ name, svg, spec });
  }
  if (png) {
    const { chromium } = await import("playwright");
    const font = pathToFileURL(join(ROOT, "app/fonts/Geist-Variable.woff2")).href;
    const tmp = mkdtempSync(join(tmpdir(), "diag-"));
    const browser = await chromium.launch();
    try {
      for (const { name, svg, spec } of svgs) {
        const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 2 });
        writeFileSync(join(tmp, "d.html"), `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Geist;src:url("${font}") format("woff2");font-weight:100 900}html,body{margin:0;background:#fff}</style></head><body>${svg}</body></html>`);
        await page.goto(pathToFileURL(join(tmp, "d.html")).href);
        await page.evaluate(() => document.fonts.ready);
        await page.locator("svg").screenshot({ path: join(OUT, "png", `${name}.png`) });
        await page.close();
      }
    } finally {
      await browser.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return svgs.map((s) => s.name);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = await renderAll();
  console.log(`rendered ${names.length} diagrams: ${names.join(", ")}`);
}
