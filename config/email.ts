// Email configuration. All SERVER-ONLY.
//
// PROVIDER-AGNOSTIC at the seam, like the payments config. The dispatcher and
// the rest of the app never name a provider; only lib/email/client.ts does.
// Today that adapter targets Resend (a single HTTP endpoint, no SDK, matching
// the hand-rolled Razorpay client). Swapping to SES/Postmark is a change to
// that one file plus the env names here.
//
// DELIBERATELY OPTIONAL. `isEmailConfigured()` lets the app run with email
// switched off: enqueued messages simply wait in the outbox until a key is set
// and the dispatcher drains them. So the platform can deploy before email is
// wired without silently dropping anything.

export interface EmailConfig {
  apiKey: string;
  /** The verified From address, e.g. "The CAD Pillar <hello@thecadpillar.com>". */
  from: string;
  /** Where human replies should land; falls back to `from` when unset. */
  replyTo: string | null;
}

export function isEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

/** SERVER-ONLY. Throws rather than half-configuring; callers gate with
 *  isEmailConfigured() first when "off" is a valid state. */
export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const replyTo = env.EMAIL_REPLY_TO?.trim() || null;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set (server-only secret).");
  if (!from) throw new Error("EMAIL_FROM is not set (the verified sender address).");
  return { apiKey, from, replyTo };
}

/**
 * Who actually receives email (Phase 17). Until the owner approves going
 * live, every email goes to the test inbox instead of its real recipient, with
 * the real address in the subject, so the whole system can be tried end to end
 * without a client hearing from it. Live only when EMAIL_DELIVERY=live.
 */
export interface EmailDelivery {
  live: boolean;
  testTo: string;
}

export const DEFAULT_TEST_INBOX = "simran@thecadpillar.com";

export function emailDelivery(env: NodeJS.ProcessEnv = process.env): EmailDelivery {
  return {
    live: env.EMAIL_DELIVERY?.trim().toLowerCase() === "live",
    testTo: env.EMAIL_TEST_TO?.trim() || DEFAULT_TEST_INBOX,
  };
}

/** The address and subject an email is actually sent with, given the delivery mode. */
export function addressFor(delivery: EmailDelivery, recipient: string, subject: string): { to: string; subject: string } {
  return delivery.live ? { to: recipient, subject } : { to: delivery.testTo, subject: `[Test → ${recipient}] ${subject}` };
}
