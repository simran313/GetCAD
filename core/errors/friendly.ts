// Why an action was refused, in the words of the person who pressed the button
// (Phase 16). The database's rules are written for the people who keep them
// ("can only quote a SUBMITTED order (is QUOTED)"); this turns the ones a
// client, designer or the team actually meets into plain sentences, and
// otherwise at least replaces status codes with their names. Framework-free,
// so it is unit-tested and shared by the error screen and every toast.
//
// The rules only reword. They never invent a reason: an unknown message keeps
// its own words (with status codes named), so nothing true is hidden.

import { ORDER_STATUS_META, statusMeta } from "../orders/status";

const named = (status: string) => statusMeta(status).label.toLowerCase();

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  // The brief and the order (clients).
  [/^the brief still needs: (.+)$/i, (m) => `The brief still needs: ${m[1]}. Add it, then send the brief`],
  [/^the brief is fixed once the order has been quoted/i, () => "The brief can't be changed once the order is quoted. Send the change to the team in Messages"],
  [/^references are fixed once the order has been quoted/i, () => "Reference pictures can't be changed once the order is quoted. Send new ones to the team in Messages"],
  [/^the category is fixed once the order is paid/i, () => "The type of piece can't be changed once the order is paid"],
  [/^this order was already submitted/i, () => "This order has already been sent to the team"],
  [/^cannot confirm an order that is (\w+)/i, (m) => `This order can't be confirmed now: it is ${named(m[1]!)}`],
  [/^order (?:\S+ )?is (?:no longer|not) awaiting payment \(is (\w+)\)/i, (m) => `This order isn't waiting for payment: it is ${named(m[1]!)}`],
  [/^order has no (?:positive )?price to (?:pay|collect|fund)/i, () => "This order has no price yet. The team will send the quote first"],
  [/^only the client who owns an order may/i, () => "Only the client who placed this order can do that"],
  [/^not the client of this order/i, () => "Only the client who placed this order can do that"],
  [/^a client may only attach reference material/i, () => "You can add reference files here. The finished design files come from the team"],
  [/^choose the type of piece/i, () => "Choose the type of piece first"],

  // Revisions, changes, problems, claims (clients).
  [/^a revision can be asked for on a preview only/i, () => "You can ask for changes once the design is ready to preview"],
  [/^the (\d+) included revision rounds are used or the (\d+) day window has closed/i, (m) => `The ${m[1]} included revision rounds are used, or the ${m[2]}-day window has closed. Order the change as a new order`],
  [/^a change can be ordered once the design is approved/i, () => "A change can be ordered once you have approved the design"],
  [/^only the client may (?:ask for a revision|order a change)/i, () => "Only the client who placed this order can ask for that"],
  [/^a dispute can only be raised while work is in progress or under preview/i, () => "A problem can be raised while the design is in progress or ready to preview. For anything else, message the team"],
  [/^a dispute reason is required/i, () => "Say what the problem is"],
  [/^claims can be opened within (\d+) days of delivery, one at a time/i, (m) => `A claim can be opened within ${m[1]} days of delivery, one at a time`],
  [/^a preview link can be made once you have approved the design/i, () => "A preview link can be made once you have approved the design"],

  // Messages and files (everyone).
  [/^message (?:body )?is (?:empty|required)/i, () => "Write a message first"],
  [/^designers cannot post in client threads/i, () => "Designers write to the team in the designer conversation"],
  [/^rejected by sanitization gate: content type not allowed/i, () => "This kind of file can't be sent here. Send a picture (PNG or JPG), a PDF, or a CAD file"],
  [/^rejected by sanitization gate: file too large/i, () => "This file is larger than 25 MB"],
  [/^rejected by sanitization gate: (.+)$/i, (m) => `This file was refused: ${m[1]}`],
  [/^the designer thread takes /i, () => "The designer conversation takes pictures (PNG or JPG) and CAD files (STEP, STL, 3DM) only"],
  [/^unsupported file extension|^bad file extension/i, () => "This kind of file can't be sent here"],

  // Access and session (everyone).
  [/^not authenticated/i, () => "You are signed out. Sign in again and retry"],
  [/^(?:order|thread|claim|link|credit|lead|client|application) not found(?: or not visible)?$|^no such order$/i, () => "This is no longer available to you, or it was removed"],
  [/^not a participant of this order/i, () => "You are not on this order"],
  [/^account is not active/i, () => "This account is not active. Contact the team"],

  // Moving an order (the team).
  [/^illegal transition: (\w+) -> (\w+) by role \w+/i, (m) => `That step isn't possible while the order is ${named(m[1]!)}`],
];

/** Status codes named as people say them: "a SUBMITTED order (is QUOTED)" → "a submitted order (now quoted)". */
function nameStatuses(text: string): string {
  return text
    .replace(/\(is (\w+)\)/g, (_, s: string) => (ORDER_STATUS_META[s] ? `(now ${named(s)})` : `(is ${s})`))
    .replace(/\b[A-Z][A-Z_]{3,}\b/g, (s) => (ORDER_STATUS_META[s] ? named(s) : s));
}

/** The reason to show for a refusal, reworded where we know it; otherwise its own words with statuses named. */
export function friendlyReason(reason: string): string {
  const text = reason.trim();
  for (const [pattern, say] of RULES) {
    const m = text.match(pattern);
    if (m) return say(m);
  }
  return nameStatuses(text);
}
