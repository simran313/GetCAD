#!/usr/bin/env node
/**
 * Builds the user guides (docs/guides/src/*.md) into branded HTML and PDF.
 *
 *   node docs/guides/build.mjs            # every guide
 *   node docs/guides/build.mjs admin      # only files whose name contains "admin"
 *
 * Output: docs/guides/dist/<name>.html and <name>.pdf.
 *
 * No dependencies beyond the repository's own Playwright (Chromium prints
 * the PDF) and pdfjs-dist (reads it back to find each heading's page). The
 * Markdown understood here is a small, fixed subset; see README.md.
 *
 * The PDF is printed twice. The first print carries an invisible marker in
 * every chapter and section heading; reading its text back gives the page
 * each heading landed on. The second print writes those numbers into the
 * table of contents. The markers sit in absolutely positioned boxes, so they
 * never move anything and both prints lay out identically.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const REPO = resolve(ROOT, "../..");
// Relative to dist/, so the HTML works from any checkout.
const FONT = relative(DIST, join(REPO, "app/fonts/Geist-Variable.woff2"));
const FONT_MONO = relative(DIST, join(REPO, "app/fonts/GeistMono-Variable.woff2"));

// ---------------------------------------------------------------- Markdown

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ALLOWED_TAGS = /&lt;(\/?)(kbd|br|span|sup|sub)((?:\s+[a-z-]+="[^"]*")*)\s*\/?&gt;/g;

function inline(text) {
  const codes = [];
  // Code may wrap only after / or _, never inside a word.
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c).replace(/([/_])/g, "$1<wbr>")) - 1}\u0000`);
  s = esc(s).replace(ALLOWED_TAGS, (_, close, tag, attrs) => `<${close}${tag}${attrs.replace(/&quot;/g, '"')}>`);
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}"${/^https?:/.test(href) ? ' rel="noreferrer"' : ""}>${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?=[^*\w]|$)/g, "$1<em>$2</em>")
    .replace(/ → /g, " <span class=\"arrow\">→</span> ");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function slugify(s, used) {
  const base =
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/&[a-z]+;/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** Expands <!-- include: path --> (relative to the including file), recursively. */
function expandIncludes(file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`include loop at ${file}`);
  const text = readFileSync(file, "utf8");
  return text.replace(/^<!--\s*include:\s*(\S+)\s*-->\s*$/gm, (_, p) => expandIncludes(resolve(dirname(file), p), new Set([...seen, file])));
}

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: text };
  const meta = Object.fromEntries(
    m[1]
      .split("\n")
      .filter((l) => l.includes(":"))
      .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
  );
  return { meta, body: text.slice(m[0].length) };
}

const CALLOUT = { NOTE: "Note", TIP: "Tip", WARNING: "Before you commit", IMPORTANT: "Important", LIMIT: "Known limit" };

function convert(md) {
  const lines = md.split("\n");
  const out = [];
  const headings = [];
  const anchors = [];
  const used = new Set();
  let i = 0;
  const isBlank = (l) => l === undefined || l.trim() === "";
  const blockStart = (l) => /^(#{1,4}\s|```|>|\|)/.test(l) || /^\s*([-*]|\d+\.)\s+/.test(l) || /^!\[/.test(l) || /^<!--/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    // Directives.
    const dir = line.match(/^<!--\s*(pagebreak|toc)\s*-->\s*$/);
    if (dir) {
      out.push(dir[1] === "toc" ? "\u0001TOC\u0001" : '<div class="pagebreak"></div>');
      i++;
      continue;
    }
    // A link target that is not a heading: <!-- anchor: some-id -->.
    const anchor = line.match(/^<!--\s*anchor:\s*([\w-]+)\s*-->\s*$/);
    if (anchor) {
      if (used.has(anchor[1])) throw new Error(`duplicate anchor ${anchor[1]}`);
      used.add(anchor[1]);
      anchors.push(anchor[1]);
      out.push(`<span id="${anchor[1]}" class="anchor"></span>`);
      i++;
      continue;
    }
    if (/^<!--/.test(line)) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }
    // Fenced code.
    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // Headings, with an optional {#id}.
    const h = line.match(/^(#{1,4})\s+(.*?)(?:\s+\{#([\w-]+)\})?\s*$/);
    if (h) {
      const level = h[1].length;
      const html = inline(h[2]);
      const id = h[3] ? (used.add(h[3]), h[3]) : slugify(h[2], used);
      headings.push({ level, id, html, text: h[2].replace(/[*`]/g, "") });
      const marker = level <= 2 ? `<span class="pm" aria-hidden="true">@@PM-${id}@@</span>` : "";
      out.push(`<h${level} id="${id}">${marker}${html}</h${level}>`);
      i++;
      continue;
    }
    // Callouts and quotes.
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      const head = buf[0].match(/^\[!(\w+)\]\s*(.*)$/);
      const kind = head && CALLOUT[head[1]] ? head[1] : null;
      const body = convert((kind ? buf.slice(1) : buf).join("\n")).html;
      if (kind) {
        const title = head[2] ? inline(head[2]) : CALLOUT[kind];
        out.push(`<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${title}</p>${body}</aside>`);
      } else out.push(`<blockquote>${body}</blockquote>`);
      continue;
    }
    // Tables.
    if (line.startsWith("|") && /^\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const cells = (l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split(/(?<!\\)\|/)
          .map((c) => inline(c.trim().replace(/\\\|/g, "|")));
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      const cls = head.length >= 6 ? ' class="wide"' : "";
      const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ""}>${c}</${tag}>`;
      out.push(
        `<div class="table"><table${cls}><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c, k) => td("td", c, k)).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    // Figures: an image alone on its line, optional {.narrow} / {.phone}.
    const fig = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{\.([\w-]+)\})?\s*$/);
    if (fig) {
      out.push(
        `<figure class="${fig[3] ?? ""}"><img src="${fig[2]}" alt="${esc(fig[1])}" loading="eager">${fig[1] ? `<figcaption>${inline(fig[1])}</figcaption>` : ""}</figure>`,
      );
      i++;
      continue;
    }
    // Lists, nested by indentation.
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), start: parseInt(m[2], 10), text: m[3] });
        else items[items.length - 1].text += ` ${lines[i].trim()}`;
        i++;
      }
      out.push(renderList(items, 0, items.length));
      continue;
    }
    // Paragraph.
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !(buf.length && blockStart(lines[i]))) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings, anchors };
}

function renderList(items, from, to) {
  const base = items[from].indent;
  const ordered = items[from].ordered;
  const start = ordered && items[from].start > 1 ? ` start="${items[from].start}"` : "";
  let html = ordered ? `<ol${start}>` : "<ul>";
  let k = from;
  while (k < to) {
    const it = items[k];
    let end = k + 1;
    while (end < to && items[end].indent > base) end++;
    const kids = end > k + 1 ? renderList(items, k + 1, end) : "";
    html += `<li>${inline(it.text)}${kids}</li>`;
    k = end;
  }
  return html + (ordered ? "</ol>" : "</ul>");
}

// ---------------------------------------------------------------- Page

const MARK = `<svg viewBox="0 0 78 78" aria-hidden="true" fill="currentColor"><rect x="0" y="0" width="12" height="78" rx="2.4"/><rect x="33" y="0" width="12" height="78" rx="2.4"/><rect x="66" y="0" width="12" height="78" rx="2.4"/></svg>`;

function toc(headings, pages, depth) {
  const rows = headings
    .filter((h) => h.level <= depth && h.level >= 1 && !h.html.includes("data-no-toc"))
    .map(
      (h) =>
        `<li class="toc-l${h.level}"><a href="#${h.id}"><span class="toc-text">${h.html}</span><span class="toc-dots"></span><span class="toc-page">${pages?.get(h.id) ?? "000"}</span></a></li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="Contents"><h1 class="toc-title" id="contents">Contents</h1><ol>${rows}</ol></nav>`;
}

function page({ meta, html, headings, pages, markers }) {
  const footer = `${meta.short ?? meta.title}`.replace(/"/g, "'");
  const body = html.replace("\u0001TOC\u0001", toc(headings, pages, Number(meta.tocDepth ?? 2)));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.subtitle ?? "")}">
<style>
@font-face { font-family: "Geist"; src: url("${FONT}") format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Geist Mono"; src: url("${FONT_MONO}") format("woff2"); font-weight: 100 900; font-display: block; }
:root {
  --ink: #0A0A0A; --paper: #FFFFFF; --fill: #F5F5F5; --card: #FAFAFA; --muted: #525252; --hairline: #E5E5E5; --strong: #D4D4D4;
  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --mono: "Geist Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); }
body { margin: 0; font: 400 10pt/1.55 var(--sans); -webkit-font-smoothing: antialiased; font-feature-settings: "ss01"; }
main { max-width: 780px; margin: 0 auto; padding: 0 16px 64px; }
h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; break-after: avoid; position: relative; }
h1 { font-size: 22pt; margin: 0 0 14pt; padding-top: 4pt; break-before: page; }
h1 + p { font-size: 11pt; color: var(--muted); }
h2 { font-size: 14pt; margin: 22pt 0 8pt; padding-top: 10pt; border-top: 1px solid var(--hairline); }
h3 { font-size: 11.5pt; margin: 16pt 0 6pt; }
h4 { font-size: 10pt; margin: 12pt 0 4pt; text-transform: none; color: var(--ink); }
p, ul, ol { margin: 0 0 8pt; }
ul, ol { padding-left: 18pt; }
li { margin: 2pt 0; }
li > ul, li > ol { margin: 3pt 0 4pt; }
ol > li::marker { font-weight: 600; font-variant-numeric: tabular-nums; }
a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--strong); text-underline-offset: 2px; }
strong { font-weight: 600; }
code { font: 500 0.88em var(--mono); background: var(--fill); border: 1px solid var(--hairline); border-radius: 4px; padding: 0 3px; }
pre { background: var(--card); border: 1px solid var(--hairline); border-radius: 6px; padding: 8pt 10pt; overflow-x: auto; font-size: 8.5pt; break-inside: avoid; }
pre code { background: none; border: 0; padding: 0; }
kbd { font: 500 0.85em var(--mono); border: 1px solid var(--strong); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--paper); }
.arrow { color: var(--muted); }
.pm { position: absolute; left: 0; top: 0; font-size: 1px; line-height: 1px; color: transparent; white-space: nowrap; }
.pagebreak { break-after: page; height: 0; }
/* Tables */
.table { margin: 6pt 0 12pt; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 8.6pt; line-height: 1.4; }
th { text-align: left; font-weight: 600; background: var(--fill); }
th, td { border: 1px solid var(--hairline); padding: 4pt 6pt; vertical-align: top; }
tr { break-inside: avoid; }
table.wide { font-size: 8pt; }
td code, th code { font-size: 0.85em; word-break: normal; overflow-wrap: normal; }
code { word-break: normal; }
/* Callouts */
.callout { border: 1px solid var(--hairline); border-left: 3px solid var(--ink); background: var(--card); border-radius: 6px; padding: 7pt 10pt 3pt; margin: 8pt 0 12pt; break-inside: avoid; }
.callout-title { font-weight: 600; margin-bottom: 3pt; }
.callout-note, .callout-tip { border-left-color: var(--muted); }
.callout-limit { border-left-color: var(--strong); background: var(--paper); border-style: dashed; border-left-style: solid; }
.callout p:last-child, .callout ul:last-child, .callout ol:last-child { margin-bottom: 5pt; }
blockquote { margin: 8pt 0; padding-left: 10pt; border-left: 2px solid var(--hairline); color: var(--muted); }
/* Figures */
figure { margin: 8pt 0 14pt; break-inside: avoid; }
figure img { display: block; max-width: 100%; max-height: 120mm; object-fit: contain; margin: 0 auto; border: 1px solid var(--hairline); border-radius: 6px; }
figure.narrow img { max-width: 62%; max-height: 90mm; }
figure.phone img { max-width: 45%; max-height: 135mm; }
figure.half img { max-width: 58%; }
figcaption { margin-top: 5pt; font-size: 8.5pt; color: var(--muted); text-align: center; }
/* Cover */
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; padding: 6mm 0 0; }
.cover .brand { display: flex; align-items: center; gap: 10pt; font-weight: 600; font-size: 15pt; letter-spacing: -0.02em; }
.cover .brand svg { width: 22pt; height: 22pt; }
.cover .mark-big { width: 78pt; height: 78pt; margin-bottom: 26pt; }
.cover .eyebrow { font-size: 10pt; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 8pt; }
.cover h1.cover-title { break-before: auto; font-size: 34pt; line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 12pt; padding: 0; }
.cover .subtitle { font-size: 13pt; color: var(--muted); max-width: 120mm; margin: 0; }
.cover .meta { border-top: 1px solid var(--ink); padding-top: 8pt; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; font-size: 8.5pt; color: var(--muted); }
.cover .meta strong { display: block; color: var(--ink); font-size: 9pt; }
/* Contents */
.toc { break-after: page; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc a { display: flex; align-items: baseline; gap: 4pt; text-decoration: none; padding: 2.2pt 0; }
.toc-l1 { margin-top: 7pt; font-weight: 600; font-size: 10.5pt; }
.toc-l2 { padding-left: 14pt; font-size: 9pt; }
.toc-l3 { padding-left: 28pt; font-size: 8.5pt; color: var(--muted); }
.toc-dots { flex: 1; border-bottom: 1px dotted var(--strong); transform: translateY(-3pt); }
.toc-page { width: 22pt; text-align: right; font-variant-numeric: tabular-nums; }
/* Task index */
.tasks { columns: 2; column-gap: 18pt; }
.tasks li { break-inside: avoid; }
@media print {
  main { max-width: none; padding: 0; }
  a[href^="http"]::after { content: ""; }
}
@media screen and (max-width: 640px) {
  body { font-size: 15px; }
  h1 { font-size: 26px; } h2 { font-size: 19px; }
  .tasks { columns: 1; }
  .cover { height: auto; min-height: 90vh; gap: 40px; }
  .cover .meta { grid-template-columns: 1fr; }
  figure.phone img, figure.narrow img, figure.half img { max-width: 100%; }
}
@page { size: A4; margin: 17mm 16mm 19mm 16mm;
  @bottom-left { content: "The CAD Pillar  |  ${footer}"; font: 400 7.5pt "Geist", sans-serif; color: #525252; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 400 7.5pt "Geist", sans-serif; color: #525252; }
}
@page :first { @bottom-left { content: none; } @bottom-right { content: none; } }
${markers ? "" : ".pm { display: none; }"}
</style>
</head>
<body>
<main>
<section class="cover" aria-label="Cover">
  <div class="brand">${MARK}<span>The CAD Pillar</span></div>
  <div>
    <div class="mark-big">${MARK}</div>
    <p class="eyebrow">${esc(meta.eyebrow ?? "Platform documentation")}</p>
    <h1 class="cover-title" data-no-toc>${esc(meta.title)}</h1>
    <p class="subtitle">${esc(meta.subtitle ?? "")}</p>
  </div>
  <div class="meta">
    <div><strong>For</strong>${esc(meta.audience ?? "")}</div>
    <div><strong>Edition</strong>${esc(meta.edition ?? "")}</div>
    <div><strong>Publisher</strong>Ichizu Private Limited · The CAD Pillar</div>
  </div>
</section>
${body}
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------- PDF

async function headingPages(pdfPath, ids) {
  const pdfjs = await import(pathToFileURL(join(REPO, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0 }).promise;
  const pages = new Map();
  for (let p = 1; p <= doc.numPages; p++) {
    const text = (await (await doc.getPage(p)).getTextContent()).items.map((t) => t.str).join("");
    for (const m of text.matchAll(/@@PM-([\w-]+)@@/g)) if (!pages.has(m[1])) pages.set(m[1], p);
  }
  const missing = ids.filter((id) => !pages.has(id));
  if (missing.length) console.warn(`  ! no page found for: ${missing.join(", ")}`);
  return { pages, count: doc.numPages };
}

async function build(file, browser) {
  const name = file.replace(/\.md$/, "");
  const { meta, body } = frontMatter(expandIncludes(join(SRC, file)));
  meta.title ??= name;
  // Images are written relative to src/; the HTML lives in dist/.
  const rebased = body.replace(/\]\((?!https?:|#)([^)\s]+)\)/g, (_, p) => `](${relative(DIST, resolve(SRC, p))})`);
  const { html, headings, anchors } = convert(rebased);
  const dupes = headings.map((h) => h.id).filter((id, k, a) => a.indexOf(id) !== k);
  if (dupes.length) throw new Error(`${file}: duplicate heading ids ${dupes.join(", ")}`);
  // Links to #anchors that do not exist are a broken guide.
  const ids = new Set(headings.map((h) => h.id).concat("contents", ...anchors));
  const broken = [...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]).filter((id) => !ids.has(id));
  if (broken.length) throw new Error(`${file}: links to missing sections: ${[...new Set(broken)].join(", ")}`);
  const missingImages = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]).filter((src) => !existsSync(resolve(DIST, src)));
  if (missingImages.length && !process.env.GUIDES_ALLOW_MISSING) throw new Error(`${file}: missing images: ${missingImages.join(", ")}`);
  if (missingImages.length) console.warn(`  ! ${missingImages.length} missing images: ${missingImages.map((m) => m.split("/").pop()).join(", ")}`);

  mkdirSync(DIST, { recursive: true });
  const htmlPath = join(DIST, `${name}.html`);
  const pdfPath = join(DIST, `${name}.pdf`);
  const pdfPage = await browser.newPage();
  const print = async (pages, markers) => {
    writeFileSync(htmlPath, page({ meta, html, headings, pages, markers }));
    await pdfPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await pdfPage.evaluate(() => document.fonts.ready);
    await pdfPage.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  };
  await print(null, true);
  const tocIds = headings.filter((h) => h.level <= Number(meta.tocDepth ?? 2)).map((h) => h.id);
  const first = await headingPages(pdfPath, tocIds);
  await print(first.pages, false);
  // The second print must land every heading where the first did.
  const check = await print2Check(pdfPath, meta, html, headings, first.pages, pdfPage, htmlPath);
  await pdfPage.close();
  console.log(`  ${name}: ${first.count} pages, ${headings.length} headings, ${check}`);
  return { name, pages: first.count };
}

/** Re-print with markers and the final numbers; every heading must stay on its page. */
async function print2Check(pdfPath, meta, html, headings, pages, pdfPage, htmlPath) {
  const probe = pdfPath.replace(/\.pdf$/, ".check.pdf");
  writeFileSync(htmlPath, page({ meta, html, headings, pages, markers: true }));
  await pdfPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await pdfPage.evaluate(() => document.fonts.ready);
  await pdfPage.pdf({ path: probe, preferCSSPageSize: true, printBackground: true });
  const again = await headingPages(probe, [...pages.keys()]);
  const moved = [...pages].filter(([id, p]) => again.pages.get(id) !== p).map(([id]) => id);
  // Leave the clean HTML (no markers) for reading on screen.
  writeFileSync(htmlPath, page({ meta, html, headings, pages, markers: false }));
  const { unlinkSync } = await import("node:fs");
  unlinkSync(probe);
  if (moved.length) throw new Error(`contents page numbers moved for: ${moved.join(", ")}`);
  return "contents page numbers checked";
}

const filter = process.argv[2] ?? "";
const files = readdirSync(SRC).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f.includes(filter));
const browser = await chromium.launch();
try {
  for (const f of files) await build(f, browser);
} finally {
  await browser.close();
}
