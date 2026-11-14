#!/usr/bin/env node
/**
 * Builds THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.pdf and .docx from the
 * Markdown chapters listed in docs/document-sources/handbook.json.
 *
 *   node docs/document-generation/build-handbook.mjs
 *
 * Steps
 *   1. Render the diagrams (docs/diagrams/src → .svg and png/*.png).
 *   2. Assemble one Markdown document per target: chapters in manifest order,
 *      appendices unnumbered, links between chapters turned into in-document
 *      links, links to other repository files turned into GitHub links,
 *      diagrams as SVG (PDF) or PNG (DOCX).
 *   3. PDF: pandoc → HTML (numbered sections, highlighted code) → a branded
 *      page (cover, contents with page numbers, document control) → Chromium.
 *      Printed twice: the first print carries invisible markers that pdfjs
 *      reads back to find each heading's page for the contents.
 *   4. DOCX: pandoc with the branded reference document
 *      (docs/document-sources/reference.docx, made by make_reference_docx.py),
 *      a Word contents field, numbered headings, PNG diagrams.
 *   5. Verify both files and write docs/master-documents/build-report.json.
 *
 * Needs: Node ≥ 20 with the repository's dependencies (Playwright Chromium,
 * pdfjs-dist, pdf-lib, sharp) and pandoc ≥ 3.1. LibreOffice is optional: when
 * present, the DOCX is also rendered to PDF to check that it opens and paginates.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderAll } from "./diagrams.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "docs/document-sources/handbook.json"), "utf8"));
const SHA = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const REPO_URL = "https://github.com/simran313/GetCAD/blob/main";
const OUT_BASE = join(ROOT, manifest.output);
const TMP = mkdtempSync(join(tmpdir(), "handbook-"));
const PANDOC_FROM = "markdown-tex_math_dollars-raw_tex-subscript-superscript+task_lists";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (file) => "ch-" + basename(file, ".md").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function pandoc(args, input) {
  return execFileSync("pandoc", args, { input, cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();
}

// ------------------------------------------------------------- assemble
function assemble(target) {
  const chapterFiles = new Set([...manifest.chapters, ...manifest.appendices.map((a) => a.file)]);
  const anchorOf = new Map([...manifest.chapters.map((f) => [f, slug(f)]), ...manifest.appendices.map((a) => [a.file, `appendix-${a.letter.toLowerCase()}`])]);
  const missing = [];

  const rewrite = (file, text) => {
    const dir = dirname(join(ROOT, file));
    text = text.replace(/<!--[\s\S]*?-->\n*/g, "");
    // Images: diagrams as SVG (PDF) or PNG at full width (DOCX).
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+\.svg)\)/g, (_m, alt, src) => {
      const abs = resolve(dir, src);
      if (!existsSync(abs)) missing.push(`${file}: image ${src}`);
      if (target === "pdf") return `![${alt}](${abs})`;
      const png = join(dirname(abs), "png", basename(abs, ".svg") + ".png");
      return `![${alt}](${png}){width=100%}`;
    });
    // Links to Markdown files.
    text = text.replace(/\]\(([^)\s#]+\.md)(#[^)\s]+)?\)/g, (_m, href, hash = "") => {
      const abs = resolve(dir, href);
      const rel = relative(ROOT, abs);
      if (chapterFiles.has(rel)) return `](${hash || "#" + anchorOf.get(rel)})`;
      if (existsSync(abs)) return `](${REPO_URL}/${rel}${hash})`;
      missing.push(`${file}: link ${href}`);
      return `](${REPO_URL}/${rel}${hash})`;
    });
    return text;
  };

  const parts = [];
  for (const file of manifest.chapters) {
    let text = rewrite(file, readFileSync(join(ROOT, file), "utf8"));
    text = text.replace(/^# (.+)$/m, (_m, t) => `# ${t} {#${slug(file)}}`);
    parts.push(text.trim());
  }
  for (const { letter, file } of manifest.appendices) {
    let text = rewrite(file, readFileSync(join(ROOT, file), "utf8"));
    let first = true;
    text = text.replace(/^(#{1,6}) (.+)$/gm, (_m, hashes, t) => {
      if (hashes === "#" && first) {
        first = false;
        return `# Appendix ${letter} · ${t} {#appendix-${letter.toLowerCase()} .unnumbered}`;
      }
      return `${hashes} ${t} {.unnumbered}`;
    });
    parts.push(text.trim());
  }
  return { markdown: parts.join("\n\n") + "\n", missing };
}

// ------------------------------------------------------------- PDF
const PILLAR = (size, fill = "#0A0A0A") =>
  `<svg viewBox="0 0 78 78" width="${size}" height="${size}" fill="${fill}" aria-hidden="true"><rect x="0" y="0" width="12" height="78" rx="2.4"/><rect x="33" y="0" width="12" height="78" rx="2.4"/><rect x="66" y="0" width="12" height="78" rx="2.4"/></svg>`;

function highlightCss() {
  const tmpl = join(TMP, "hl.tmpl");
  writeFileSync(tmpl, "$highlighting-css$\n");
  return pandoc(["-s", "--template", tmpl, "--highlight-style=tango", "-f", "markdown", "-t", "html5"], "```ts\nconst a = 1;\n```\n");
}

function css(markers) {
  const font = pathToFileURL(join(ROOT, "app/fonts/Geist-Variable.woff2")).href;
  const mono = pathToFileURL(join(ROOT, "app/fonts/GeistMono-Variable.woff2")).href;
  return `
@font-face { font-family: Geist; src: url("${font}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Geist Mono"; src: url("${mono}") format("woff2"); font-weight: 100 900; }
@page { size: A4; margin: 20mm 17mm 20mm 17mm;
  @top-left { content: "THE CAD PILLAR  ·  ${esc(manifest.title)}"; font-family: Geist, Arial, sans-serif; font-size: 7pt; letter-spacing: 0.04em; color: #6B6B6B; border-bottom: 0.6pt solid #D9D9D9; vertical-align: bottom; padding-bottom: 3mm; }
  @top-right { content: "v${esc(manifest.version)}  ·  ${esc(SHA)}  ·  Internal"; font-family: Geist, Arial, sans-serif; font-size: 7pt; color: #6B6B6B; border-bottom: 0.6pt solid #D9D9D9; vertical-align: bottom; padding-bottom: 3mm; }
  @bottom-left { content: "Ichizu Private Limited  ·  generated from docs/ (Markdown is the source of truth)"; font-family: Geist, Arial, sans-serif; font-size: 7pt; color: #6B6B6B; border-top: 0.6pt solid #D9D9D9; vertical-align: top; padding-top: 3mm; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Geist, Arial, sans-serif; font-size: 7pt; color: #6B6B6B; border-top: 0.6pt solid #D9D9D9; vertical-align: top; padding-top: 3mm; }
}
@page :first { margin: 0; @top-left { content: none; border: 0; } @top-right { content: none; border: 0; } @bottom-left { content: none; border: 0; } @bottom-right { content: none; border: 0; } }
:root { --ink: #0A0A0A; --text: #1F1F1F; --muted: #5C5C5C; --rule: #D9D9D9; --soft: #F4F4F4;
  --crit: #9B1C1C; --high: #B42318; --med: #B54708; --low: #2F5D7C; --info: #525252; }
* { box-sizing: border-box; }
html { font-family: Geist, "Helvetica Neue", Arial, sans-serif; color: var(--text); font-size: 9.4pt; line-height: 1.55; }
body { margin: 0; }
p, li { orphans: 3; widows: 3; }
a { color: var(--ink); text-decoration: underline; text-decoration-color: #A3A3A3; text-underline-offset: 2px; }
strong { color: var(--ink); font-weight: 650; }
code { font-family: "Geist Mono", ui-monospace, monospace; font-size: 0.86em; background: var(--soft); padding: 0.05em 0.3em; border-radius: 3px; overflow-wrap: anywhere; }
pre { font-family: "Geist Mono", ui-monospace, monospace; font-size: 7.8pt; line-height: 1.45; background: #F7F7F5; border: 1px solid #E7E5E0; border-left: 3px solid var(--ink); border-radius: 4px; padding: 8pt 10pt; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: inherit; }
div.sourceCode { margin: 8pt 0; }
h1, h2, h3, h4 { color: var(--ink); font-weight: 650; letter-spacing: -0.012em; line-height: 1.25; break-after: avoid; }
h1 { font-size: 21pt; margin: 0 0 14pt; padding: 0 0 10pt; border-bottom: 2px solid var(--ink); break-before: page; }
h1 .header-section-number { display: block; font-size: 9pt; letter-spacing: 0.14em; color: var(--muted); font-weight: 600; margin-bottom: 6pt; }
h1 .header-section-number::before { content: "CHAPTER "; }
h1.unnumbered::before { content: "APPENDIX"; display: block; font-size: 9pt; letter-spacing: 0.14em; color: var(--muted); font-weight: 600; margin-bottom: 6pt; }
h2 { font-size: 13.5pt; margin: 20pt 0 6pt; padding-top: 4pt; }
h3 { font-size: 11pt; margin: 14pt 0 4pt; }
h4 { font-size: 9.8pt; margin: 10pt 0 3pt; color: var(--muted); }
.header-section-number { color: var(--muted); font-variant-numeric: tabular-nums; margin-right: 0.45em; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 7.9pt; line-height: 1.4; border-top: 1.4px solid var(--ink); border-bottom: 1.4px solid var(--ink); }
thead { display: table-header-group; }
th { text-align: left; font-weight: 650; color: var(--ink); background: #F1F1F1; border-bottom: 1px solid #BDBDBD; padding: 4pt 5pt; vertical-align: bottom; }
td { border-bottom: 1px solid var(--rule); padding: 3.5pt 5pt; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
tr { break-inside: avoid; }
blockquote { margin: 10pt 0; padding: 6pt 12pt; border-left: 3px solid var(--ink); background: #F7F7F7; color: var(--text); }
figure { margin: 12pt 0; text-align: center; break-inside: avoid; }
figure img, p > img { max-width: 100%; height: auto; border: 1px solid #ECECEC; border-radius: 4px; }
figcaption { font-size: 7.8pt; color: var(--muted); margin-top: 4pt; font-style: italic; }
ul, ol { padding-left: 16pt; margin: 4pt 0 8pt; }
li { margin: 1.5pt 0; }
ul.task-list { list-style: none; padding-left: 4pt; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 14pt 0; }
.sev { display: inline-block; font-size: 7.4pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 1.5pt 6pt; border-radius: 3px; color: #fff; vertical-align: 2px; }
.sev-critical { background: var(--crit); } .sev-high { background: var(--high); } .sev-medium { background: var(--med); } .sev-low { background: var(--low); } .sev-informational { background: var(--info); }
/* cover */
.cover { height: 297mm; width: 210mm; padding: 26mm 22mm 22mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; background: #FFFFFF; }
.cover .brand { display: flex; align-items: center; gap: 12pt; font-size: 15pt; font-weight: 650; letter-spacing: -0.01em; color: var(--ink); }
.cover .brand .sep { width: 1px; height: 22pt; background: var(--ink); }
.cover .kicker { font-size: 9pt; letter-spacing: 0.18em; color: var(--muted); font-weight: 600; text-transform: uppercase; margin-bottom: 10pt; }
.cover h1.cover-title { font-size: 40pt; line-height: 1.04; letter-spacing: -0.035em; border: 0; padding: 0; margin: 0; break-before: auto; }
.cover .sub { font-size: 14pt; color: var(--muted); margin-top: 12pt; max-width: 150mm; }
.cover .meta { display: grid; grid-template-columns: auto 1fr; gap: 4pt 18pt; font-size: 8.6pt; border-top: 2px solid var(--ink); padding-top: 10pt; }
.cover .meta dt { color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 7.6pt; font-weight: 600; padding-top: 1pt; }
.cover .meta dd { margin: 0; color: var(--ink); }
/* contents */
.toc { break-after: page; }
.toc h1 { break-before: auto; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc a { display: flex; align-items: baseline; gap: 5pt; text-decoration: none; color: var(--ink); padding: 1.9pt 0; }
.toc .l1 { margin-top: 6.5pt; font-weight: 650; font-size: 10pt; }
.toc .l2 { padding-left: 22pt; font-size: 8.4pt; color: #333; }
.toc .num { min-width: 22pt; color: var(--muted); font-variant-numeric: tabular-nums; }
.toc .dots { flex: 1; border-bottom: 1px dotted #9A9A9A; transform: translateY(-3pt); }
.toc .pg { min-width: 20pt; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
.control { break-after: page; }
.control h1 { break-before: auto; }
.pm { position: absolute; font-size: 1px; color: #fff; ${markers ? "" : "display: none;"} }
${highlightCss()}
`;
}

function decorate(html) {
  // Severity badges on finding headings and in the summary cells.
  html = html.replace(/(<h3[^>]*>)([\s\S]*?)(<\/h3>)/g, (_m, open, inner, close) =>
    open + inner.replace(/·\s*(Critical|High|Medium|Low|Informational)(\s*\(conditional\))?\s*·/, (_x, sev, cond = "") => `<span class="sev sev-${sev.toLowerCase()}">${sev}${cond ? " · conditional" : ""}</span>`) + close,
  );
  return html;
}

function headingsOf(html) {
  const out = [];
  for (const m of html.matchAll(/<h([12])([^>]*)>([\s\S]*?)<\/h\1>/g)) {
    const id = /id="([^"]+)"/.exec(m[2])?.[1];
    if (!id) continue;
    const num = /<span class="header-section-number">([^<]*)<\/span>/.exec(m[3])?.[1] ?? "";
    const text = m[3].replace(/<span class="header-section-number">[^<]*<\/span>/, "").replace(/<span class="sev[^"]*">([^<]*)<\/span>/g, "$1").replace(/<[^>]+>/g, "").trim();
    const appendix = /unnumbered/.test(m[2]);
    if (appendix && m[1] === "2") continue; // appendix sections are long lists; keep the contents to chapters
    out.push({ level: Number(m[1]), id, num, text, appendix });
  }
  return out;
}

function withMarkers(html) {
  return html.replace(/<h([12])([^>]*id="([^"]+)"[^>]*)>/g, (_m, l, attrs, id) => `<h${l}${attrs}><span class="pm">@@PM-${id}@@</span>`);
}

function page({ body, heads, pages, markers }) {
  const rows = heads.map((h) => `<li class="l${h.level}"><a href="#${h.id}"><span class="num">${esc(h.appendix ? "" : h.num)}</span><span class="t">${esc(h.text)}</span><span class="dots"></span><span class="pg">${pages?.get(h.id) ?? "00"}</span></a></li>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(manifest.title)} · The CAD Pillar</title><style>${css(markers)}</style></head><body>
<section class="cover">
  <div class="brand">${PILLAR(30)}<span class="sep"></span><span>The CAD Pillar</span></div>
  <div><div class="kicker">${esc(manifest.subtitle)}</div><h1 class="cover-title" id="cover">${esc(manifest.title)}</h1>
  <p class="sub">The permanent technical reference for founders, developers and security reviewers: architecture, data, access, operations and risk.</p></div>
  <dl class="meta">
    <dt>Organisation</dt><dd>${esc(manifest.organisation)}</dd>
    <dt>Version</dt><dd>${esc(manifest.version)} · generated ${esc(manifest.date)}</dd>
    <dt>Code revision</dt><dd>main @ <code>${esc(SHA)}</code> · github.com/simran313/GetCAD</dd>
    <dt>Classification</dt><dd>${esc(manifest.classification)}</dd>
  </dl>
</section>
<nav class="toc"><h1 id="contents">Contents</h1><ol>${rows}</ol></nav>
<section class="control"><h1 id="document-control">Document control</h1>
<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>
<tr><td>Title</td><td>${esc(manifest.title)}: ${esc(manifest.subtitle)}</td></tr>
<tr><td>Version and date</td><td>${esc(manifest.version)} · ${esc(manifest.date)}</td></tr>
<tr><td>Audited code revision</td><td><code>${esc(SHA)}</code> (main)</td></tr>
<tr><td>Source of truth</td><td>Markdown in <code>docs/</code>, listed in <code>docs/document-sources/handbook.json</code>. This PDF and the DOCX are generated: never edit them by hand.</td></tr>
<tr><td>Regenerate</td><td><code>node docs/document-generation/extract-reference.mjs</code> (with a local Postgres), then <code>node docs/document-generation/build-handbook.mjs</code>. See chapter 13.</td></tr>
<tr><td>Classification</td><td>${esc(manifest.classification)}</td></tr>
<tr><td>Owner</td><td>Ichizu Private Limited (The CAD Pillar). Business decisions: <code>docs/DECISIONS.md</code> wins where documents disagree.</td></tr>
<tr><td>Contents</td><td>${manifest.chapters.length} chapters and ${manifest.appendices.length} generated appendices (A schema, B functions, C routes, D server actions, E configuration names)</td></tr>
</tbody></table>
<h2 id="revision-history">Revision history</h2>
<table><thead><tr><th>Version</th><th>Date</th><th>Change</th></tr></thead><tbody>
<tr><td>1.0</td><td>13 November 2026</td><td>First edition: full security audit, architecture blueprint and developer handover, generated from the repository after pull request #137.</td></tr>
</tbody></table></section>
<main>${body}</main></body></html>`;
}

async function headingPages(pdfPath, ids) {
  const pdfjs = await import(pathToFileURL(join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0 }).promise;
  const pages = new Map();
  for (let i = 1; i <= doc.numPages; i++) {
    const text = (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join("");
    for (const m of text.matchAll(/@@PM-([^@]+)@@/g)) if (!pages.has(m[1])) pages.set(m[1], i);
  }
  const found = ids.filter((id) => pages.has(id)).length;
  return { pages, found, numPages: doc.numPages };
}

async function buildPdf(markdown) {
  const htmlBody = decorate(pandoc(["-f", PANDOC_FROM, "-t", "html5", "--metadata", "pagetitle=handbook", "--number-sections", "--highlight-style=tango", "--wrap=none", "--resource-path", ROOT], markdown));
  const heads = headingsOf(htmlBody);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const htmlPath = join(TMP, "handbook.html");
  const pdfPath = `${OUT_BASE}.pdf`;
  const print = async (pages, markers) => {
    writeFileSync(htmlPath, page({ body: markers ? withMarkers(htmlBody) : htmlBody, heads, pages, markers }));
    const p = await browser.newPage();
    await p.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: pdfPath, format: "A4", printBackground: true, displayHeaderFooter: false, preferCSSPageSize: true, outline: true, tagged: true });
    await p.close();
  };
  try {
    await print(null, true);
    const first = await headingPages(pdfPath, heads.map((h) => h.id));
    await print(first.pages, false);
    const second = await headingPages(pdfPath, []);
    return { pdfPath, headings: heads.length, located: first.found, pages: second.numPages, markersLeft: second.pages.size };
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------- DOCX
function buildDocx(markdown) {
  const meta = [
    "---",
    `title: "${manifest.title}"`,
    `subtitle: "${manifest.subtitle}"`,
    `author: "${manifest.organisation}"`,
    `date: "Version ${manifest.version} · ${manifest.date} · code revision main @ ${SHA}"`,
    `abstract: "${manifest.classification} Source of truth: the Markdown in docs/ (docs/document-sources/handbook.json). This document is generated; regenerate with node docs/document-generation/build-handbook.mjs."`,
    `toc-title: "Contents"`,
    "lang: en-GB",
    "---",
    "",
  ].join("\n");
  const docxPath = `${OUT_BASE}.docx`;
  execFileSync("pandoc", ["-f", PANDOC_FROM, "-t", "docx", "--reference-doc", join(ROOT, "docs/document-sources/reference.docx"), "--toc", "--toc-depth=2", "--number-sections", "--highlight-style=tango", "--resource-path", ROOT, "-o", docxPath], { input: meta + markdown, cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  const dir = join(TMP, "docx");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  execFileSync("unzip", ["-q", docxPath, "-d", dir]);
  const original = readFileSync(join(dir, "word/document.xml"), "utf8");
  // Chapter and section headings (level 1 and 2) with the bookmarks pandoc puts before them.
  const heads = [];
  let inAppendix = false;
  for (const m of original.matchAll(/<w:bookmarkStart w:id="\d+" w:name="([^"]+)" \/><w:p><w:pPr><w:pStyle w:val="Heading([12])" \/><\/w:pPr>(.*?)<\/w:p>/gs)) {
    const num = /<w:rStyle w:val="SectionNumber" \/><\/w:rPr><w:t xml:space="preserve">([^<]*)<\/w:t>/.exec(m[3])?.[1] ?? "";
    const title = [...m[3].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join("").replace(num, "").trim();
    if (m[2] === "1") inAppendix = !num;
    if (m[2] === "2" && inAppendix) continue;
    heads.push({ id: m[1], level: Number(m[2]), num, title });
  }
  return { docxPath, dir, original, heads };
}

const xmlEsc = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;").replace(/</g, "&lt;");

function finalizeDocx(state, pages) {
  const { docxPath, dir, original, heads } = state;
  let xml = original;
  // pandoc 3.1 ignores abstract-title for DOCX; name the block what it is.
  xml = xml.replace(/(<w:pStyle w:val="AbstractTitle" \/><\/w:pPr><w:r><w:t xml:space="preserve">)Abstract(<\/w:t>)/, "$1Document control$2");
  // Pre-filled, clickable contents: readable in viewers that do not update fields; Word refreshes it on open.
  const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true" /></w:r><w:r><w:instrText xml:space="preserve">TOC \\o &quot;1-2&quot; \\h \\z \\u</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate" /></w:r>';
  const run = (t) => `<w:r><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const entries = heads.map((h, i) =>
    `<w:p><w:pPr><w:pStyle w:val="TOC${h.level}" /></w:pPr>${i === 0 ? begin : ""}<w:hyperlink w:anchor="${h.id}" w:history="1">` +
    (h.num ? run(h.num) + "<w:r><w:tab /></w:r>" : "") + run(h.title) +
    `<w:r><w:tab /></w:r><w:r><w:fldChar w:fldCharType="begin" /></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF ${h.id} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate" /></w:r>${run(String(pages?.get(h.id) ?? ""))}<w:r><w:fldChar w:fldCharType="end" /></w:r></w:hyperlink></w:p>`,
  ).join("") + '<w:p><w:r><w:fldChar w:fldCharType="end" /></w:r></w:p>';
  const pandocToc = '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true" /><w:instrText xml:space="preserve">TOC \\o &quot;1-2&quot; \\h \\z \\u</w:instrText><w:fldChar w:fldCharType="separate" /><w:fldChar w:fldCharType="end" /></w:r></w:p>';
  if (!xml.includes(pandocToc)) throw new Error("pandoc's contents field was not found; the DOCX contents could not be filled");
  xml = xml.replace(pandocToc, entries);
  writeFileSync(join(dir, "word/document.xml"), xml);
  // Ask Word to refresh fields (contents page numbers) when the file is opened.
  const settingsPath = join(dir, "word/settings.xml");
  let settings = readFileSync(settingsPath, "utf8");
  if (!/w:updateFields/.test(settings)) settings = settings.replace(/(<w:settings[^>]*>)/, '$1<w:updateFields w:val="true" />');
  writeFileSync(settingsPath, settings);
  rmSync(docxPath, { force: true });
  execSync(`cd "${dir}" && zip -q -X -r "${docxPath}" '[Content_Types].xml' _rels docProps word`, { shell: "/bin/bash" });
  execSync(`zip -q -d "${docxPath}" '*/' || true`, { shell: "/bin/bash" });
  const images = execFileSync("unzip", ["-l", docxPath]).toString().split("\n").filter((l) => /word\/media\//.test(l)).length;
  return { docxPath, xml, images, entries: heads.length };
}

async function docxHeadingPages(pdfPath, heads) {
  const pdfjs = await import(pathToFileURL(join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0 }).promise;
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) texts.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ").replace(/\s+/g, " "));
  const last = heads[heads.length - 1]?.title ?? "";
  let cursor = texts.findIndex((t) => t.includes(last)) + 1; // the contents page that lists the last entry
  const pages = new Map();
  for (const h of heads) {
    for (let i = cursor; i < texts.length; i++) {
      if (texts[i].includes(h.title)) {
        pages.set(h.id, i + 1);
        cursor = i;
        break;
      }
    }
  }
  return pages;
}

function libreofficeCheck(docxPath) {
  const soffice = ["soffice", "libreoffice"].find((b) => { try { execFileSync("which", [b]); return true; } catch { return false; } });
  if (!soffice) return { checked: false };
  const out = join(TMP, "lo");
  mkdirSync(out, { recursive: true });
  try {
    execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", out, docxPath], { timeout: 300000, stdio: "ignore" });
    const pdf = join(out, basename(docxPath, ".docx") + ".pdf");
    const info = execFileSync("pdfinfo", [pdf]).toString();
    return { checked: true, pages: Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0), pdf };
  } catch (e) {
    return { checked: false, error: String(e.message ?? e).slice(0, 200) };
  }
}

// ------------------------------------------------------------- main
try {
  const diagrams = await renderAll();
  mkdirSync(dirname(OUT_BASE), { recursive: true });
  const pdfMd = assemble("pdf");
  const docxMd = assemble("docx");
  if (pdfMd.missing.length) {
    console.error("Broken references:\n  " + pdfMd.missing.join("\n  "));
    process.exit(1);
  }
  const pdf = await buildPdf(pdfMd.markdown);
  const docxState = buildDocx(docxMd.markdown);
  let docx = finalizeDocx(docxState, null);
  let lo = libreofficeCheck(docx.docxPath);
  let docxPagesLocated = 0;
  // Measure, write, re-measure until the page numbers stop moving (the filled contents is longer than the empty one).
  let docxPagePasses = 0;
  for (let prev = ""; lo.checked && docxPagePasses < 4; docxPagePasses++) {
    const pages = await docxHeadingPages(lo.pdf, docxState.heads);
    const key = JSON.stringify([...pages]);
    docxPagesLocated = pages.size;
    if (key === prev) break;
    prev = key;
    docx = finalizeDocx(docxState, pages);
    lo = libreofficeCheck(docx.docxPath);
  }

  const titles = manifest.chapters.map((f) => /^# (.+)$/m.exec(readFileSync(join(ROOT, f), "utf8"))[1]);
  const pdfText = await (async () => {
    const pdfjs = await import(pathToFileURL(join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf.pdfPath)), verbosity: 0 }).promise;
    let t = "";
    for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + "\n";
    return t.replace(/\s+/g, " ");
  })();
  const norm = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  const checks = {
    diagramsRendered: diagrams.length,
    chaptersInPdf: titles.filter((t) => norm(pdfText).includes(norm(t))).length,
    chaptersInDocx: titles.filter((t) => norm(docx.xml).includes(norm(t).replace(/&/g, "&amp;"))).length,
    chaptersExpected: titles.length,
    pdfContentsEntries: pdf.headings,
    pdfContentsPagesLocated: pdf.located,
    pdfMarkersLeft: pdf.markersLeft,
    docxImages: docx.images,
    docxContentsEntries: docx.entries,
    docxContentsPagesLocated: docxPagesLocated,
    docxContentsPasses: docxPagePasses,
    docxRendersInLibreOffice: lo.checked,
  };
  const ok = checks.chaptersInPdf === checks.chaptersExpected && checks.chaptersInDocx === checks.chaptersExpected && pdf.located === pdf.headings && pdf.markersLeft === 0 && docx.images >= diagrams.length;
  const report = {
    generated: manifest.date,
    codeRevision: SHA,
    pdf: { file: relative(ROOT, pdf.pdfPath), pages: pdf.pages, bytes: statSync(pdf.pdfPath).size },
    docx: { file: relative(ROOT, docx.docxPath), bytes: statSync(docx.docxPath).size, pagesWhenRenderedByLibreOffice: lo.pages ?? null },
    checks,
    ok,
  };
  writeFileSync(join(dirname(OUT_BASE), "build-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (process.env.KEEP_PREVIEW && lo.pdf) copyFileSync(lo.pdf, process.env.KEEP_PREVIEW);
  if (!ok) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
