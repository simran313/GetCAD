/**
 * Why an action was refused, shown to the person (Phase 11c).
 *
 * In production Next replaces the message of an error thrown by a server
 * action with a generic one, since a message may hold details not meant for
 * the viewer. It does keep the error's `digest`. A Refusal is an error whose
 * message was written for the person who pressed the button (a rule the
 * database checked, or a missing field), so it also carries that message in
 * its digest, and the error screen and toasts show it. The answer is still an
 * error (HTTP 500 for the action), so nothing that was refused looks saved.
 *
 * Anything else (a lost connection, a permission the database denied, a bug)
 * stays a plain Error: generic words and a reference.
 */
const PREFIX = "refused:";

export class Refusal extends Error {
  readonly digest: string;
  constructor(reason: string) {
    super(reason);
    this.name = "Refusal";
    this.digest = `${PREFIX}${reason}`;
  }
}

/**
 * Throw on a database error. A rule our own functions refused on (RAISE
 * EXCEPTION, SQLSTATE P0001: "can only quote a SUBMITTED order", "the brief
 * still needs: metal") becomes a Refusal; any other code (permissions,
 * constraints, connection) a plain Error.
 */
export function refuseOn(error: { message: string; code?: string } | null | undefined): void {
  if (!error) return;
  if (error.code === "P0001") throw new Refusal(error.message);
  throw new Error(error.message);
}

/** The reason to show for a caught error, as a sentence, or null when it is not a refusal. */
export function refusalReason(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith(PREFIX)) return null;
  const reason = digest.slice(PREFIX.length).trim();
  if (!reason) return null;
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

// Next's stand-in for a message it withheld in production.
const REDACTED = /omitted in production builds|Server Components render/i;

/**
 * What to tell the person about a failed action: its refusal reason; else
 * the error's own message when it is not one Next withheld (the browser's
 * own errors, and everything in development); else null, for generic words.
 */
export function actionErrorText(error: unknown): string | null {
  const reason = refusalReason(error);
  if (reason) return reason;
  const message = error instanceof Error ? error.message : "";
  return message && !REDACTED.test(message) ? message : null;
}
