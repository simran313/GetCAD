/**
 * First-touch attribution (Phase 6, owner answer Q16: our own database only).
 *
 * The first time someone arrives, where they came from is kept in one
 * first-party cookie: the utm_* tags of the landing URL, the referring site
 * (host only) and the landing path. It is never overwritten, so a later
 * visit from a bookmark does not erase the ad that brought them. At sign-up
 * it is saved with their answer to "How did you hear about us?".
 *
 * Framework-free: the middleware (edge) and the welcome action share it.
 */

export const FIRST_TOUCH_COOKIE = "tcp_ft";
export const FIRST_TOUCH_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export interface FirstTouch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_path: string;
  at: string;
}

const clean = (v: string | null | undefined, max = 120): string | undefined => {
  const t = (v ?? "").trim().slice(0, max);
  return t ? t : undefined;
};

/** What to remember about this arrival, or null when it is an internal hop. */
export function firstTouchFrom(url: URL, referrer: string | null, now: Date = new Date()): FirstTouch {
  const touch: FirstTouch = { landing_path: url.pathname.slice(0, 200), at: now.toISOString() };
  for (const key of UTM_KEYS) {
    const v = clean(url.searchParams.get(key));
    if (v) touch[key] = v;
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host && host !== url.hostname) touch.referrer = host.slice(0, 120);
    } catch {
      // A malformed Referer header is not worth remembering.
    }
  }
  return touch;
}

export function encodeFirstTouch(t: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(t));
}

/** Parse the cookie back; anything malformed or tampered reads as nothing. */
export function decodeFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (typeof v !== "object" || v === null || typeof v.landing_path !== "string" || typeof v.at !== "string") return null;
    const out: FirstTouch = { landing_path: v.landing_path.slice(0, 200), at: v.at.slice(0, 40) };
    for (const key of [...UTM_KEYS, "referrer"] as const) {
      const s = typeof v[key] === "string" ? clean(v[key] as string) : undefined;
      if (s) out[key] = s;
    }
    return out;
  } catch {
    return null;
  }
}

/** "How did you hear about us?" — required at sign-up (S3). */
export const HEARD_ABOUT = [
  ["google", "Google search"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["referral", "Another jeweler told me"],
  ["trade_show", "Trade show or event"],
  ["email", "An email from us"],
  ["other", "Somewhere else"],
] as const;

export type HeardAbout = (typeof HEARD_ABOUT)[number][0];

export function isHeardAbout(v: string): v is HeardAbout {
  return HEARD_ABOUT.some(([key]) => key === v);
}
