/**
 * Every claim the website makes, in one place (redesign step 4). Edit here,
 * never in a page. Rules:
 *   - Never invent a number. A value nobody has confirmed stays `confirmed:
 *     false` and is listed on the page's draft banner (preview builds only).
 *   - The website shows one price, "from $35", and retainers for regular
 *     clients (owner, 31 Oct 2026); the bands in DECISIONS §4 stay internal.
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
  DESIGNER_COUNT: claim("50+", true),
  /** "10+ years each in production CAD". */
  MIN_EXPERIENCE_YEARS: claim("10+", true),
  /** Share of first looks that meet the brief and the factory's requirements (owner, 31 Oct 2026). */
  FIRST_LOOK_ACCURACY: claim("99%", true),
  /** The checklist both the designer and QC tick (components/marketing/content CHECK_GROUPS). */
  QC_CHECKPOINTS: claim(19, true),
  /** First look within N hours of order confirmation, standard tier A–F (DECISIONS §6). */
  FIRST_LOOK_HOURS: claim(6, true),
  /** Standard band (DECISIONS §4). */
  ENTRY_PRICE: claim("$35", true),
  /** First design for a new account, once (DECISIONS §4). */
  FIRST_DESIGN_PRICE: claim("$49", true),
  /**
   * When a person answers: 3 PM – midnight India time, every day. Pages show it
   * live in ET (core/support/hours, components/support/support-status); this
   * is the daylight-time wording for places that cannot run a clock.
   */
  LIVE_CALL_HOURS: claim("5:30 AM – 2:30 PM ET", true),
  /** The number the live-call buttons dial. */
  LIVE_CALL_PHONE: claim<string | null>("+91 83692 88293", true),
  /** WhatsApp number (digits with country code): the same line. */
  WHATSAPP: claim<string | null>("918369288293", true),
  /** The address clients write to. */
  EMAIL: claim("simran@thecadpillar.com", true),
  /** Revision rounds included and their window (DECISIONS §8). */
  REVISIONS: claim("2 revision rounds within 14 days", true),
  /** Spec-claim window (DECISIONS §7). */
  CLAIM_WINDOW_DAYS: claim(30, true),
  AI_LINE: claim("AI-native jewelry CAD. Checked by experts.", true),
  /** Anonymised team cards (role · years · specialty). No names or photos. */
  TEAM: claim(
    [
      { role: "Senior CAD", years: "14 yrs", specialty: "Bridal and halos" },
      { role: "Senior CAD", years: "12 yrs", specialty: "Signets and men's" },
      { role: "Senior CAD", years: "11 yrs", specialty: "Pavé and high jewelry" },
      { role: "Master QC", years: "20+ yrs at the bench", specialty: "Casting and finishing" },
    ],
    true,
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
