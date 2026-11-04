/**
 * The "Add designers" box (owner, 4 Nov 2026): one designer per line, as
 * the owner keeps the list — "email - Name", "Name - email", or with a comma
 * or tab between, and an optional phone number. Blank lines are skipped;
 * a line without an email, or without a name, is returned as a problem
 * rather than guessed at.
 */
export interface DesignerLine {
  email: string;
  name: string;
  phone: string | null;
}

export interface ParsedDesigners {
  people: DesignerLine[];
  problems: { line: number; text: string; reason: string }[];
}

const EMAIL = /[^\s,;<>]+@[^\s,;<>]+\.[A-Za-z]{2,}/;
const PHONE = /\+?\d[\d\s-]{7,}\d/;

export function parseDesignerLines(text: string): ParsedDesigners {
  const people: DesignerLine[] = [];
  const problems: ParsedDesigners["problems"] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const email = line.match(EMAIL)?.[0]?.toLowerCase();
    if (!email) {
      problems.push({ line: i + 1, text: line, reason: "no email on this line" });
      return;
    }
    let rest = line.replace(EMAIL, " ");
    const phone = rest.match(PHONE)?.[0]?.replace(/\s+/g, " ").trim() ?? null;
    if (phone) rest = rest.replace(PHONE, " ");
    const name = rest
      .replace(/[,;\t|–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 2) {
      problems.push({ line: i + 1, text: line, reason: "no name on this line" });
      return;
    }
    if (seen.has(email)) {
      problems.push({ line: i + 1, text: line, reason: "this email is already in the list" });
      return;
    }
    seen.add(email);
    people.push({ email, name, phone });
  });
  return { people, problems };
}
