/**
 * Builds the Sales Training Master outputs from SALES-TRAINING-MASTER.md:
 *   charts/*.png                       (from charts.mjs, via Chromium)
 *   TCP-Sales-Training-Master.docx     (A4, black-and-white brand, one callout accent)
 *   TCP-Sales-Training-Interactive.html (same text; live charts, quiz answers, search)
 *   TCP-Sales-Cheat-Sheet.pdf          (2 pages, from cheat-sheet.html)
 *
 * Run from the repo root:  node docs/sales-training/build/build.mjs
 * Needs: playwright (repo dev dependency) and the `docx` package (npm i -g docx).
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CHARTS } from "./charts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..");
const require = createRequire(import.meta.url);
const docx = require(require.resolve("docx", { paths: [process.cwd(), execSync("npm root -g").toString().trim(), "/opt/node-tools/node_modules"] }));
const { chromium } = require(require.resolve("playwright", { paths: [process.cwd()] }));

const INK = "0A0A0A", ACCENT = "9A7417", ACCENT_BG = "FAF6EA", RULE = "D4D4D4";
const md = readFileSync(join(OUT, "SALES-TRAINING-MASTER.md"), "utf8");
const answers = parseAnswers(readFileSync(join(OUT, "answer-key.md"), "utf8"));

// ---------------------------------------------------------------- markdown
function parse(src) {
  const lines = src.split("\n"), blocks = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("```")) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      blocks.push({ t: "code", lines: body }); i++; continue;
    }
    const h = l.match(/^(#{1,3}) (.*)$/);
    if (h) { blocks.push({ t: "h" + h[1].length, text: h[2] }); i++; continue; }
    const img = l.match(/^!\[(.*)\]\((charts\/([a-z0-9-]+)\.png)\)$/);
    if (img) { blocks.push({ t: "img", alt: img[1], path: img[2], key: img[3] }); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) rows.push(lines[i]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      blocks.push({ t: "table", head: cells(rows[0]), rows: rows.slice(2).map(cells) }); continue;
    }
    if (l.startsWith(">")) {
      const body = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) body.push(lines[i].replace(/^> ?/, ""));
      blocks.push({ t: "callout", lines: body }); continue;
    }
    if (/^- /.test(l)) {
      const items = [];
      for (; i < lines.length && /^- /.test(lines[i]); i++) items.push(lines[i].slice(2));
      blocks.push({ t: "ul", items }); continue;
    }
    if (/^\d+\. /.test(l)) {
      const items = [];
      for (; i < lines.length && /^\d+\. /.test(lines[i]); i++) items.push(lines[i].replace(/^\d+\. /, ""));
      blocks.push({ t: "ol", items }); continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|```|\||>|- |\d+\. |!\[)/.test(lines[i]); i++) para.push(lines[i]);
    blocks.push({ t: "p", text: para.join(" ") });
  }
  return blocks;
}

function parseAnswers(src) {
  const out = {};
  let cur = null;
  for (const l of src.split("\n")) {
    const m = l.match(/^## Module (\d+)/);
    if (m) { cur = m[1]; out[cur] = []; continue; }
    const a = l.match(/^(\d+)\. (.*)$/);
    if (cur && a) out[cur][Number(a[1]) - 1] = a[2];
  }
  return out;
}

/** Inline **bold**, `code`, *italic* → runs [{text, bold, italic, code}] */
function inline(s) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) runs.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("`")) runs.push({ text: tok.slice(1, -1), code: true });
    else runs.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  return runs;
}

const blocks = parse(md);

// ---------------------------------------------------------------- charts → PNG
async function renderCharts() {
  mkdirSync(join(OUT, "charts"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
  const sizes = {};
  for (const [key, fn] of Object.entries(CHARTS)) {
    const s = fn();
    await page.setContent(`<html><body style="margin:0;background:#fff">${s}</body></html>`);
    const el = await page.$("svg");
    const box = await el.boundingBox();
    sizes[key] = { w: box.width, h: box.height };
    await el.screenshot({ path: join(OUT, "charts", `${key}.png`) });
  }
  await browser.close();
  return sizes;
}

// ---------------------------------------------------------------- DOCX
function buildDocx(sizes) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType,
    HeadingLevel, ImageRun, Header, Footer, PageNumber, TabStopType, LevelFormat, PageBreak, TableLayoutType, VerticalAlign } = docx;
  const CONTENT = 9638; // A4 width 11906 − 2 × 1134 margins
  const FONT = "Arial";
  const runs = (s, base = {}) =>
    inline(s).map((r) => new TextRun({ text: r.text, bold: r.bold || base.bold, italics: r.italic || base.italics, font: r.code ? "Courier New" : FONT, size: base.size, color: base.color }));
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  let olInstance = 0;
  const children = [];
  const cover = [];

  // Cover: the title, the version line and the intro paragraphs before "## Contents".
  let i = 0;
  const title = blocks[0].text;
  i = 1;
  const intro = [];
  while (blocks[i] && !(blocks[i].t === "h2" && blocks[i].text === "Contents")) intro.push(blocks[i++]);
  cover.push(
    new Table({
      width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT], layout: TableLayoutType.FIXED,
      rows: [new TableRow({ height: { value: 5200, rule: "atLeast" }, children: [new TableCell({
        width: { size: CONTENT, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: INK, color: "auto" }, verticalAlign: VerticalAlign.CENTER,
        borders: { top: none, bottom: none, left: none, right: none }, margins: { top: 600, bottom: 600, left: 600, right: 600 },
        children: [
          new Paragraph({ children: [new TextRun({ text: "▮▮▮  THE CAD PILLAR", font: FONT, bold: true, size: 22, color: "FFFFFF" })], spacing: { after: 600 } }),
          new Paragraph({ children: [new TextRun({ text: "Sales Training Master", font: FONT, bold: true, size: 64, color: "FFFFFF" })], spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: "Prospect · pitch · qualify · first order · workflow · repeat accounts", font: FONT, size: 24, color: "D0D0D0" })], spacing: { after: 600 } }),
          new Paragraph({ children: [new TextRun({ text: "INTERNAL — CONFIDENTIAL", font: FONT, bold: true, size: 22, color: "FFFFFF" })] }),
        ],
      })] })],
    }),
    new Paragraph({ spacing: { before: 400 }, children: [] }),
  );
  for (const b of intro) if (b.t === "p") cover.push(new Paragraph({ children: runs(b.text, { size: 21 }), spacing: { after: 160 } }));
  cover.push(new Paragraph({ children: [new TextRun({ text: `${title} · Ichizu Private Limited · New Delhi`, font: FONT, size: 18, color: "6B6B6B" })], spacing: { before: 400 } }));

  const heading = (text, level) =>
    new Paragraph({ heading: level, children: [new TextRun({ text, font: FONT })], pageBreakBefore: level === HeadingLevel.HEADING_1 });

  const colWidths = (head, rows) => {
    const n = head.length;
    const longestWord = (c) => Math.max(...[head[c], ...rows.map((r) => r[c] ?? "")].flatMap((x) => x.replace(/\*\*|`/g, "").split(/\s+/)).map((w) => w.length));
    const avg = (c) => rows.reduce((a, r) => a + (r[c] ?? "").length, 0) / Math.max(rows.length, 1);
    const max = (c) => Math.max(head[c].length, ...rows.map((r) => (r[c] ?? "").length));
    const weights = head.map((_, c) => Math.min(Math.max(0.6 * avg(c) + 0.4 * max(c), 7), 55));
    const floor = head.map((_, c) => Math.min(longestWord(c) * 100 + 260, 2600));
    let w = head.map(() => 0), free = head.map((_, c) => c), left = CONTENT;
    // Give each column its share; a column whose share is below its floor is fixed at the floor and the rest re-shared.
    for (let pass = 0; pass < n; pass++) {
      const sum = free.reduce((a, c) => a + weights[c], 0);
      const under = free.filter((c) => (weights[c] / sum) * left < floor[c]);
      if (!under.length) { free.forEach((c) => (w[c] = Math.floor((weights[c] / sum) * left))); break; }
      under.forEach((c) => { w[c] = floor[c]; left -= floor[c]; });
      free = free.filter((c) => !under.includes(c));
      if (!free.length) break;
    }
    w[n - 1] += CONTENT - w.reduce((a, b) => a + b, 0);
    return w;
  };

  const table = (head, rows) => {
    const widths = colWidths(head, rows);
    const cell = (s, c, isHead) => new TableCell({
      width: { size: widths[c], type: WidthType.DXA },
      shading: isHead ? { type: ShadingType.CLEAR, fill: INK, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders: { top: thin, bottom: thin, left: thin, right: thin },
      children: [new Paragraph({ children: runs(s ?? "", isHead ? { bold: true, color: "FFFFFF", size: 17 } : { size: 17 }) })],
    });
    return new Table({
      width: { size: CONTENT, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, c) => cell(h, c, true)) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: head.map((_, c) => cell(r[c], c, false)) })),
      ],
    });
  };

  const boxed = (paras, accent) => new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: CONTENT, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: accent ? ACCENT_BG : "F4F4F4", color: "auto" },
      margins: { top: 120, bottom: 120, left: 200, right: 160 },
      borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: accent ? ACCENT : "9A9A9A" } },
      children: paras,
    })] })],
  });

  const spacer = () => (blocks[i + 1]?.t === "h1" ? new Paragraph({ children: [], spacing: { after: 0, line: 20, lineRule: "exact" } }) : new Paragraph({ spacing: { after: 120 }, children: [] }));
  let quizModule = null;

  for (; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "h1") { children.push(heading(b.text, HeadingLevel.HEADING_1)); quizModule = (b.text.match(/^Module (\d+)/) ?? [])[1] ?? null; continue; }
    if (b.t === "h2") { children.push(heading(b.text, HeadingLevel.HEADING_2)); continue; }
    if (b.t === "h3") { children.push(heading(b.text, HeadingLevel.HEADING_3)); continue; }
    if (b.t === "p") {
      const isQuiz = /^\*\*Quiz — /.test(b.text);
      const isLabel = isQuiz || /^\*\*[^*]+\*\*$/.test(b.text) || (b.text.length < 90 && /:$/.test(b.text));
      children.push(new Paragraph({ children: runs(b.text, { size: 21 }), spacing: { before: isQuiz ? 200 : 0, after: 140 }, keepNext: isLabel }));
      continue;
    }
    if (b.t === "ul") {
      for (const it of b.items) children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(it, { size: 21 }), spacing: { after: 60 } }));
      children.push(spacer()); continue;
    }
    if (b.t === "ol") {
      olInstance++;
      const isQuizList = /^\*\*Quiz — /.test(blocks[i - 1]?.text ?? "");
      b.items.forEach((it, k) => children.push(new Paragraph({ numbering: { reference: "numbers", level: 0, instance: olInstance }, children: runs(it, { size: 21 }), spacing: { after: 60 }, keepNext: isQuizList && k < b.items.length - 1 })));
      children.push(spacer()); continue;
    }
    if (b.t === "table") { children.push(table(b.head, b.rows), spacer()); continue; }
    if (b.t === "code") {
      children.push(boxed(b.lines.map((l) => new Paragraph({ children: [new TextRun({ text: l || " ", font: FONT, size: 19 })], spacing: { after: 20 } })), false), spacer());
      continue;
    }
    if (b.t === "callout") {
      const paras = [];
      b.lines.forEach((l, k) => {
        if (!l.trim()) { paras.push(new Paragraph({ children: [], spacing: { after: 60 } })); return; }
        if (l.startsWith("- ")) { paras.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(l.slice(2), { size: 20 }), spacing: { after: 40 } })); return; }
        // The leading bold label (Say this / Never say this / Rule / Key takeaways) takes the accent colour.
        const r = inline(l).map((x, n) => new TextRun({ text: x.text, bold: x.bold, italics: x.italic, font: x.code ? "Courier New" : FONT, size: 20, color: k === 0 && n === 0 && x.bold ? ACCENT : undefined }));
        paras.push(new Paragraph({ children: r, spacing: { after: 60 } }));
      });
      children.push(boxed(paras, true), spacer());
      continue;
    }
    if (b.t === "img") {
      const { w, h } = sizes[b.key];
      const width = 620, height = Math.round((h / w) * width);
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { line: 240, lineRule: "auto", before: 120 }, children: [new ImageRun({ type: "png", data: readFileSync(join(OUT, b.path)), transformation: { width, height }, altText: { title: b.alt, description: b.alt, name: b.key } })] }));
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.alt, font: FONT, size: 17, italics: true, color: "6B6B6B" })], spacing: { after: 200 } }));
      continue;
    }
  }

  const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
    children: [new TextRun({ text: "The CAD Pillar · Sales Training Master", font: FONT, size: 16, color: "6B6B6B" })] })] });
  const footer = new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
    children: [
      new TextRun({ text: "INTERNAL — CONFIDENTIAL", font: FONT, size: 16, bold: true }),
      new TextRun({ text: "\tPage ", font: FONT, size: 16, color: "6B6B6B" }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "6B6B6B" }),
      new TextRun({ text: " of ", font: FONT, size: 16, color: "6B6B6B" }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "6B6B6B" }),
    ] })] });
  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 567 } };

  const doc = new Document({
    creator: "The CAD Pillar", title: "The CAD Pillar — Sales Training Master", description: "INTERNAL — CONFIDENTIAL",
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: INK }, paragraph: { spacing: { line: 276, lineRule: "auto" } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 36, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 6 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 27, bold: true, color: INK }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 23, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 300 } } } }] },
    ] },
    sections: [
      { properties: { page }, footers: { default: footer }, children: cover },
      { properties: { page }, headers: { default: header }, footers: { default: footer }, children },
    ],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- Interactive HTML
const escH = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineH = (s) => inline(s).map((r) => (r.bold ? `<strong>${escH(r.text)}</strong>` : r.code ? `<code>${escH(r.text)}</code>` : r.italic ? `<em>${escH(r.text)}</em>` : escH(r.text))).join("").replace(/\[TBC([^\]]*)\]/g, '<mark class="tbc">[TBC$1]</mark>');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function buildHtml() {
  let body = "", nav = "", quizModule = null, section = false;
  const title = blocks[0].text;
  let i = 1;
  let intro = "";
  while (blocks[i] && !(blocks[i].t === "h2" && blocks[i].text === "Contents")) { if (blocks[i].t === "p") intro += `<p>${inlineH(blocks[i].text)}</p>`; i++; }
  i += 2; // skip "Contents" heading and its list
  for (; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "h1") {
      if (section) body += "</section>";
      const id = slug(b.text);
      quizModule = (b.text.match(/^Module (\d+)/) ?? [])[1] ?? null;
      nav += `<a href="#${id}" data-target="${id}">${escH(b.text.replace(" — ", " · "))}</a>`;
      body += `<section id="${id}" class="mod${/Managers only: internal economics/.test(b.text) ? " managers" : ""}"><h1>${escH(b.text)}</h1>`;
      section = true; continue;
    }
    if (b.t === "h2") { body += `<h2 id="${slug(b.text)}">${inlineH(b.text)}</h2>`; continue; }
    if (b.t === "h3") { body += `<h3>${inlineH(b.text)}</h3>`; continue; }
    if (b.t === "p") {
      const q = b.text.match(/^\*\*Quiz — Module (\d+)\*\*$/);
      if (q && blocks[i + 1]?.t === "ol") {
        const items = blocks[++i].items;
        body += `<div class="quiz"><h4>Quiz — Module ${q[1]}</h4><ol>${items.map((it, k) => `<li><span>${inlineH(it)}</span><details><summary>Show answer</summary><p>${inlineH(answers[q[1]]?.[k] ?? "See the module text.")}</p></details></li>`).join("")}</ol></div>`;
        continue;
      }
      body += `<p>${inlineH(b.text)}</p>`; continue;
    }
    if (b.t === "ul") { body += `<ul>${b.items.map((x) => `<li>${inlineH(x)}</li>`).join("")}</ul>`; continue; }
    if (b.t === "ol") { body += `<ol>${b.items.map((x) => `<li>${inlineH(x)}</li>`).join("")}</ol>`; continue; }
    if (b.t === "table") {
      body += `<div class="tw" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${b.head.map((h) => `<th>${inlineH(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${b.head.map((_, c) => `<td>${inlineH(r[c] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (b.t === "code") { body += `<pre class="tpl"><button class="copy" type="button">Copy</button>${escH(b.lines.join("\n"))}</pre>`; continue; }
    if (b.t === "callout") {
      const label = (b.lines[0].match(/^\*\*([^*]+)\*\*/) ?? [])[1] ?? "";
      const kind = /Never/.test(label) ? "never" : /Say/.test(label) ? "say" : /Key takeaways/.test(label) ? "take" : "rule";
      let inner = "", list = false;
      for (const l of b.lines) {
        if (l.startsWith("- ")) { if (!list) { inner += "<ul>"; list = true; } inner += `<li>${inlineH(l.slice(2))}</li>`; continue; }
        if (list) { inner += "</ul>"; list = false; }
        if (l.trim()) inner += `<p>${inlineH(l)}</p>`;
      }
      if (list) inner += "</ul>";
      body += `<aside class="callout ${kind}">${inner}</aside>`; continue;
    }
    if (b.t === "img") {
      body += `<figure class="chart" data-key="${b.key}">${CHARTS[b.key]()}<figcaption>${escH(b.alt)} <span class="hint">· hover or tap a bar for details</span></figcaption></figure>`;
      continue;
    }
  }
  if (section) body += "</section>";
  const tpl = readFileSync(join(HERE, "interactive.html"), "utf8");
  return tpl.replace("{{TITLE}}", escH(title)).replace("{{INTRO}}", intro).replace("{{NAV}}", nav).replace("{{BODY}}", body);
}

// ---------------------------------------------------------------- Cheat sheet PDF
async function buildCheatSheet() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + join(HERE, "cheat-sheet.html"));
  await page.pdf({
    path: join(OUT, "TCP-Sales-Cheat-Sheet.pdf"), format: "A4", printBackground: true,
    margin: { top: "12mm", bottom: "14mm", left: "12mm", right: "12mm" },
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;font:8px Arial;padding:0 12mm;display:flex;justify-content:space-between"><b>INTERNAL — CONFIDENTIAL</b><span>The CAD Pillar · Sales cheat sheet · page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });
  await browser.close();
}

const sizes = await renderCharts();
writeFileSync(join(OUT, "TCP-Sales-Training-Master.docx"), await buildDocx(sizes));
writeFileSync(join(OUT, "TCP-Sales-Training-Interactive.html"), buildHtml());
await buildCheatSheet();
console.log("built:", Object.keys(sizes).length, "charts, docx, interactive html, cheat sheet");
