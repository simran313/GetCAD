/**
 * Every claim the website makes, in one place (redesign step 4). Edit here,
 * never in a page. Rules:
 *   - Never invent a number. A value nobody has confirmed stays `confirmed:
 *     false` and is listed on the page's draft banner (preview builds only).
 *   - Prices come from DECISIONS §4 (components/marketing/content PRICE_BANDS).
 *   - Promises must match DECISIONS §6–7 word for word in substance.
 */

export interface Claim<T = string> {
  value: T;
  /** False until the owner confirms it is true today. */
  confirmed: boolean;
  /** What to check before confirming. */
  todo?: string;
}

const claim = <T>(value: T, confirmed: boolean, todo?: string): Claim<T> => ({ value, confirmed, todo });

export const CLAIMS = {
  /** "50+ senior CAD designers". */
  DESIGNER_COUNT: claim("50+", false, "Confirm the number, and 'team' vs 'network' wording."),
  /** "10+ years each in production CAD". */
  MIN_EXPERIENCE_YEARS: claim("10+", false, "Confirm it is the minimum for every designer, not the average."),
  /** The checklist both the designer and QC tick (components/marketing/content CHECK_GROUPS). */
  QC_CHECKPOINTS: claim(19, true),
  /** First look within N hours of order confirmation, standard tier A–F (DECISIONS §6). */
  FIRST_LOOK_HOURS: claim(6, true),
  /** Standard band (DECISIONS §4). */
  ENTRY_PRICE: claim("$55", true),
  /** First design for a new account, once (DECISIONS §4). */
  FIRST_DESIGN_PRICE: claim("$49", true),
  /** When a person answers the phone. Must match real staffing. */
  LIVE_CALL_HOURS: claim("Mon–Fri, 9am–6pm ET", false, "Set the real hours the team answers calls."),
  /** The number the live-call buttons dial. Null shows the contact page instead. */
  LIVE_CALL_PHONE: claim<string | null>(null, false, "Add the phone number for live calls."),
  /** WhatsApp number (digits with country code) for the contact band. */
  WHATSAPP: claim<string | null>(null, false, "Add the WhatsApp number."),
  /** The address clients write to. */
  EMAIL: claim("hello@thecadpillar.com", false, "Confirm this inbox is read."),
  /** Revision rounds included and their window (DECISIONS §8). */
  REVISIONS: claim("2 revision rounds within 14 days", true),
  /** Spec-claim window (DECISIONS §7). */
  CLAIM_WINDOW_DAYS: claim(30, true),
  AI_LINE: claim("AI runs our operations. Experts make your CAD.", true),
  /** Anonymised team cards (role · years · specialty). No names or photos. */
  TEAM: claim(
    [
      { role: "Senior CAD", years: "14 yrs", specialty: "Bridal and halos" },
      { role: "Senior CAD", years: "12 yrs", specialty: "Signets and men's" },
      { role: "Senior CAD", years: "11 yrs", specialty: "Pavé and high jewelry" },
      { role: "Master QC", years: "20+ yrs at the bench", specialty: "Casting and finishing" },
    ],
    false,
    "Replace with real (anonymised) profiles: role, years, specialty.",
  ),
} as const;

export type ClaimKey = keyof typeof CLAIMS;

/** The value of a claim (pages read through this, so a rename is one edit). */
export function c<K extends ClaimKey>(key: K): (typeof CLAIMS)[K]["value"] {
  return CLAIMS[key].value;
}

/**
 * Whether a claim may be shown here. Unconfirmed claims show on preview and
 * local builds (with the draft banner) so the page can be reviewed, and never
 * on the production deployment, where each one falls back to a confirmed line
 * (owner decision, redesign step 4: D2, D5, D6).
 */
export function showClaim(key: ClaimKey): boolean {
  return CLAIMS[key].confirmed || process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
}

/** Claims not yet confirmed, for the draft banner. */
export function unconfirmedClaims(): { key: ClaimKey; todo: string }[] {
  return (Object.keys(CLAIMS) as ClaimKey[])
    .filter((k) => !CLAIMS[k].confirmed)
    .map((k) => ({ key: k, todo: CLAIMS[k].todo ?? "" }));
}
