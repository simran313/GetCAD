/**
 * Outreach (owner, 16 Nov 2026; DECISIONS 1.32): the words, lists and pure
 * helpers the outreach screens share. The database (0069) checks every value
 * again; these only make the screens say the same thing it accepts.
 */

export const KINDS = [
  ["EXISTING", "Existing contacts"],
  ["PROSPECT", "Prospects"],
] as const;
export type OutreachKind = (typeof KINDS)[number][0];

export const STAGES = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["REPLIED", "Replied"],
  ["INTERESTED", "Interested"],
  ["NOT_NOW", "Not now"],
  ["NOT_INTERESTED", "Not interested"],
] as const;
export type OutreachStage = (typeof STAGES)[number][0];

/** Where a sender writes from. */
export const SENDER_CHANNELS = [
  ["EMAIL", "Email"],
  ["WHATSAPP", "WhatsApp"],
  ["INSTAGRAM", "Instagram"],
  ["LINKEDIN", "LinkedIn"],
] as const;

/** How a touch happened (a sender's channels plus a call or a meeting). */
export const TOUCH_CHANNELS = [...SENDER_CHANNELS, ["PHONE", "Phone call"], ["IN_PERSON", "In person"]] as const;

export const SEGMENTS = [
  ["RETAIL_JEWELER", "Retail or custom jeweler"],
  ["MANUFACTURER", "Manufacturer or trade shop"],
  ["BRAND_WHOLESALER", "Brand or wholesaler"],
  ["DESIGN_STUDIO", "Jewelry design studio"],
  ["OTHER", "Other jewelry business"],
] as const;

const label = (list: readonly (readonly [string, string])[], key: string | null | undefined): string =>
  list.find(([k]) => k === key)?.[1] ?? (key ? key.toLowerCase().replace(/_/g, " ") : "");
export const stageLabel = (s: string | null | undefined) => label(STAGES, s);
export const kindLabel = (k: string | null | undefined) => label(KINDS, k);
export const segmentLabel = (s: string | null | undefined) => label(SEGMENTS, s);
export const channelLabel = (c: string | null | undefined) => label(TOUCH_CHANNELS, c);

/** The fields a spreadsheet column can fill, with the headings that usually mean it. */
export const IMPORT_FIELDS = [
  { key: "business_name", label: "Business name", hints: ["business", "company", "store", "shop", "firm", "organization", "organisation", "account", "brand"] },
  { key: "contact_name", label: "Contact name", hints: ["contact", "name", "person", "owner", "full name", "first name"] },
  { key: "email", label: "Email", hints: ["email", "e-mail", "mail"] },
  { key: "phone", label: "Phone", hints: ["phone", "mobile", "cell", "tel", "telephone", "number"] },
  { key: "whatsapp", label: "WhatsApp", hints: ["whatsapp", "wa"] },
  { key: "instagram", label: "Instagram", hints: ["instagram", "insta", "ig"] },
  { key: "linkedin", label: "LinkedIn", hints: ["linkedin"] },
  { key: "website", label: "Website", hints: ["website", "web", "url", "site", "domain"] },
  { key: "city", label: "City", hints: ["city", "town"] },
  { key: "region", label: "State or region", hints: ["state", "region", "province", "county"] },
  { key: "country", label: "Country", hints: ["country", "nation"] },
  { key: "segment", label: "Business type", hints: ["type", "segment", "category", "industry", "business type"] },
  { key: "tags", label: "Tags", hints: ["tags", "tag", "labels", "group"] },
  { key: "notes", label: "Notes", hints: ["notes", "note", "comments", "comment", "remarks", "description"] },
  { key: "source", label: "Source", hints: ["source", "found", "where", "list"] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

/** The database takes at most this many rows in one call (0069). */
export const IMPORT_CHUNK = 500;
/** A file larger than this is refused in the browser before anything is sent. */
export const IMPORT_MAX_ROWS = 20_000;

/**
 * Reads CSV or tab-separated text (a file saved from Excel or Google Sheets,
 * or cells pasted straight from one). Quoted fields may hold commas, quotes
 * ("") and line breaks. The separator is whichever of tab, comma or semicolon
 * the first line uses most. Blank lines are dropped.
 */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [["\t", count("\t")], [",", count(",")], [";", count(";")]].sort((a, b) => Number(b[1]) - Number(a[1]))[0]![0] as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A first guess at which field each column fills, from its heading. Exact
 * names win over partial ones; each field is used once; a column nobody
 * recognises is left out (null) for the person to choose.
 */
export function guessMapping(headers: string[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();
  const out: (ImportField | null)[] = headers.map(() => null);
  const heads = headers.map(norm);

  // Exact heading first, then a heading that starts with or contains a hint.
  const passes: ((h: string, hint: string) => boolean)[] = [
    (h, hint) => h === hint,
    (h, hint) => h.startsWith(`${hint} `) || h.endsWith(` ${hint}`),
    (h, hint) => hint.length > 3 && h.includes(hint),
  ];
  for (const match of passes) {
    heads.forEach((h, i) => {
      if (out[i] || !h) return;
      const f = IMPORT_FIELDS.find((field) => !taken.has(field.key) && field.hints.some((hint) => match(h, hint)));
      if (f) {
        out[i] = f.key;
        taken.add(f.key);
      }
    });
  }
  return out;
}

/** Whether the first row looks like headings rather than a contact. */
export function looksLikeHeader(row: string[]): boolean {
  if (row.some((c) => /@|\d{5,}|^https?:/i.test(c))) return false;
  return guessMapping(row).some(Boolean);
}

export type ImportRow = Partial<Record<ImportField, string>> & { _row: number };

/**
 * The rows the database is sent: each mapped column under its field, the
 * spreadsheet's own row number kept so a refusal can point at the line.
 * Rows with nothing in a mapped column are dropped.
 */
export function buildRows(table: string[][], mapping: (ImportField | null)[], hasHeader: boolean): ImportRow[] {
  const start = hasHeader ? 1 : 0;
  const rows: ImportRow[] = [];
  for (let i = start; i < table.length; i++) {
    const r: ImportRow = { _row: i + 1 };
    let any = false;
    mapping.forEach((field, col) => {
      const v = (table[i]![col] ?? "").trim();
      if (!field || !v) return;
      r[field] = r[field] ? `${r[field]}, ${v}` : v;
      any = true;
    });
    if (any) rows.push(r);
  }
  return rows;
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Opens Gmail's compose window from the sender's own account (authuser picks
 * which signed-in Google account), with the message filled in. Free: nothing
 * is sent from here, the person presses Send in Gmail.
 */
export function gmailComposeUrl(to: string, opts: { from?: string | null; subject?: string; body?: string } = {}): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to });
  if (opts.subject) p.set("su", opts.subject);
  if (opts.body) p.set("body", opts.body);
  if (opts.from) p.set("authuser", opts.from);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

/** WhatsApp chat with the number (digits only, with country code), text optional. */
export function whatsappUrl(number: string, text?: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}/`;
}

/** A website as a link, adding https:// when the list left it out. */
export function websiteUrl(site: string): string | null {
  const s = site.trim();
  if (!s || /\s/.test(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Replies as a share of the contacts written to, rounded; null before any. */
export function replyRate(contacted: number, replied: number): number | null {
  return contacted > 0 ? Math.round((replied / contacted) * 100) : null;
}
