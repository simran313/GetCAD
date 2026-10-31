/**
 * The one shell every email wears (Phase 17): the website's look carried into
 * an inbox. Monochrome like the site (ink #0A0A0A on white, a quiet grey
 * ground), the wordmark, one card, one black button, a footer with live
 * support. Built from tables with inline styles, which is what Gmail, Outlook
 * and Apple Mail all render the same way; a fixed-width table for Outlook,
 * fluid below 600 px everywhere else. Every email also has a plain-text part.
 */

export const BRAND = "The CAD Pillar";
/** Live support, as on the website (content/claims.ts; tests/config/email-brand keeps them equal). */
export const SUPPORT_WHATSAPP = "+91 83692 88293";
export const SUPPORT_WHATSAPP_LINK = "https://wa.me/918369288293";
export const SUPPORT_HOURS = "5:30 AM – 2:30 PM ET (4:30 AM – 1:30 PM in US winter), every day";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
const INK = "#0A0A0A";
const BODY = "#404040";
const MUTED = "#737373";
const LINE = "#E5E5E5";
const GROUND = "#F5F5F5";

/** Minimal HTML escape for anything that came from a person or the database. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmailLink {
  label: string;
  href: string;
}

export interface EmailContent {
  /** Shown in the inbox list after the subject. */
  preheader: string;
  /** Small line above the heading: the order reference, usually. */
  eyebrow?: string;
  heading: string;
  /** Paragraphs, already escaped where they hold data (use `esc`). */
  paragraphs: string[];
  /** A quoted message (escaped here). */
  quote?: string;
  /** Key facts as rows: "Price", "$55". Values escaped here. */
  facts?: [string, string][];
  cta?: EmailLink;
  secondary?: EmailLink;
  /** Where the client manages optional emails; omitted on emails nobody can turn off. */
  preferencesHref?: string | null;
  /** One line under the support line ("You can turn off message emails…"). */
  note?: string;
}

const p = (html: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY}">${html}</p>`;

function button(link: EmailLink): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px"><tr><td bgcolor="${INK}" style="border-radius:8px;background:${INK}">
<a href="${esc(link.href)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px">${esc(link.label)}</a>
</td></tr></table>`;
}

/** The HTML and text parts for one email. */
export function renderLayout(subject: string, c: EmailContent): { html: string; text: string } {
  const facts = c.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border-top:1px solid ${LINE}">${c.facts
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;color:${MUTED}">${esc(k)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;font-weight:600;color:${INK}">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const quote = c.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="border-left:3px solid ${INK};padding:4px 0 4px 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK}">${esc(c.quote)}</td></tr></table>`
    : "";
  const secondary = c.secondary
    ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:14px;line-height:1.5"><a href="${esc(c.secondary.href)}" target="_blank" style="color:${INK};text-decoration:underline">${esc(c.secondary.label)}</a></p>`
    : "";
  const prefs = c.preferencesHref
    ? ` · <a href="${esc(c.preferencesHref)}" target="_blank" style="color:${MUTED};text-decoration:underline">Email preferences</a>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${GROUND};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${GROUND}">${esc(c.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="background:${GROUND}"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px;font-family:${FONT};font-size:17px;font-weight:600;letter-spacing:-0.02em;color:${INK}">${BRAND}</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;padding:36px 32px">
${c.eyebrow ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED}">${esc(c.eyebrow)}</p>` : ""}
<h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-0.02em;color:${INK}">${esc(c.heading)}</h1>
${c.paragraphs.map(p).join("\n")}
${quote}${facts}${c.cta ? button(c.cta) : ""}${secondary}
</td></tr>
<tr><td style="padding:24px 4px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED}">
Questions? Reply to this email, or <a href="${SUPPORT_WHATSAPP_LINK}" target="_blank" style="color:${MUTED};text-decoration:underline">WhatsApp ${SUPPORT_WHATSAPP}</a>. Live support ${SUPPORT_HOURS}. The portal is open 24/7.
${c.note ? `<br>${esc(c.note)}` : ""}
</td></tr>
<tr><td style="padding:12px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">${BRAND} · AI-native jewelry CAD · This is an automated message${prefs}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  // The plain-text part: what a text-only client or a screen reader in a
  // simple mail app reads. Paragraphs lose their tags.
  const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const text = [
    c.heading,
    ...c.paragraphs.map(plain),
    ...(c.quote ? [`"${c.quote}"`] : []),
    ...(c.facts?.length ? [c.facts.map(([k, v]) => `${k}: ${v}`).join("\n")] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.href}`] : []),
    ...(c.secondary ? [`${c.secondary.label}: ${c.secondary.href}`] : []),
    `— ${BRAND}`,
    `Questions? Reply to this email, or WhatsApp ${SUPPORT_WHATSAPP}. Live support ${SUPPORT_HOURS}. The portal is open 24/7.`,
    ...(c.note ? [c.note] : []),
    `This is an automated message.${c.preferencesHref ? ` Email preferences: ${c.preferencesHref}` : ""}`,
  ].join("\n\n");

  return { html, text };
}
