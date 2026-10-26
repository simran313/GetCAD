/**
 * How each stored setting reads to a person (redesign A11). The database keeps
 * whole numbers (mg/cm³, µm, paise, cents); the screen shows the unit people
 * think in and converts on save. Nothing here changes what is stored.
 */
export interface Field {
  label: string;
  help?: string;
  unit: string;
  prefix?: string;
  /** Stored = shown × scale. */
  scale: number;
  decimals: number;
  /** Moves a price, a payout or a weight: shown before → after on save. */
  critical?: boolean;
  /** Empty is allowed (stored as null). */
  optional?: boolean;
}

export interface Section {
  id: string;
  title: string;
  description: string;
  keys: string[];
}

export const FIELDS: Record<string, Field> = {
  sla_standard_hours: { label: "First-look promise", help: "Categories A–F, counted from payment and confirmation.", unit: "hours", scale: 1, decimals: 0 },
  qc_buffer_minutes: { label: "Time kept for QC", help: "The designer's deadline is the first look minus this.", unit: "minutes", scale: 1, decimals: 0 },
  shift_minutes: { label: "Designer capacity per shift", help: "Category minutes one designer can take on per shift.", unit: "minutes", scale: 1, decimals: 0 },
  revision_rounds: { label: "Revision rounds included", unit: "rounds", scale: 1, decimals: 0, critical: true },
  revision_window_days: { label: "Revision window", help: "Days after the first look that included rounds stay open.", unit: "days", scale: 1, decimals: 0 },
  claim_window_days: { label: "Spec-claim window", help: "Days after delivery a client can open a claim.", unit: "days", scale: 1, decimals: 0 },

  usd_inr_paise_per_usd: { label: "Exchange rate", help: "A fixed rate for margins and the payout warning.", prefix: "₹", unit: "per $1", scale: 100, decimals: 2, critical: true },
  payout_warning_pct: { label: "Payout warning", help: "Flag a quote when designer and QC pay pass this share of the price.", unit: "%", scale: 1, decimals: 0, critical: true },
  metal_price_cents_per_gram: { label: "Metal price for estimates", help: "Leave empty to show no metal estimate.", prefix: "$", unit: "per gram", scale: 100, decimals: 2, critical: true, optional: true },

  density_10k_mg_cm3: { label: "10K gold", unit: "g/cm³", scale: 1000, decimals: 3, critical: true },
  density_14k_mg_cm3: { label: "14K gold", unit: "g/cm³", scale: 1000, decimals: 3, critical: true },
  density_18k_mg_cm3: { label: "18K gold", unit: "g/cm³", scale: 1000, decimals: 3, critical: true },
  density_pt950_mg_cm3: { label: "Platinum 950", unit: "g/cm³", scale: 1000, decimals: 3, critical: true },
  density_ag925_mg_cm3: { label: "Sterling silver 925", unit: "g/cm³", scale: 1000, decimals: 3, critical: true },

  min_wall_um: { label: "Minimum wall", unit: "mm", scale: 1000, decimals: 2 },
  min_prong_um: { label: "Minimum prong", unit: "mm", scale: 1000, decimals: 2 },
};

export const SECTIONS: Section[] = [
  {
    id: "clocks",
    title: "First look and revisions",
    description: "The promises the clock and the revision rules are measured against.",
    keys: ["sla_standard_hours", "qc_buffer_minutes", "shift_minutes", "revision_rounds", "revision_window_days", "claim_window_days"],
  },
  {
    id: "money",
    title: "Money",
    description: "Used for margins, payout warnings and metal estimates. Prices themselves are set per band.",
    keys: ["usd_inr_paise_per_usd", "payout_warning_pct", "metal_price_cents_per_gram"],
  },
  {
    id: "weights",
    title: "Metal densities",
    description: "Turn a model's volume into metal weight on the weight sheet.",
    keys: ["density_10k_mg_cm3", "density_14k_mg_cm3", "density_18k_mg_cm3", "density_pt950_mg_cm3", "density_ag925_mg_cm3"],
  },
  {
    id: "spec",
    title: "Spec sheet defaults",
    description: "Printed on every spec sheet unless the order says otherwise.",
    keys: ["min_wall_um", "min_prong_um"],
  },
];

export const FLAGS: Record<string, { label: string; help?: string }> = {
  capacity_blocking: { label: "Block assignment over shift capacity", help: "Off: the team is warned but can still assign." },
  auto_sla_credit: { label: "Automatic late-order credit", help: "Off: an admin decides each missed first look." },
  in_app_payouts: { label: "Payouts through Razorpay", help: "Off: export the batch and pay by bank transfer." },
  wallet_checkout: { label: "Wallet, credit packs and plans" },
  render_brief_one_page: { label: "One-page render brief", help: "Quoted by an admin." },
  public_stats: { label: "Public results page", help: "Turn on after 30 days of real data." },
  rush: { label: "Rush delivery" },
  dental: { label: "Dental", help: "Separate brand." },
};

/** Stored whole number → what the input shows. */
export function toShown(value: number | null, f: Field): string {
  if (value === null) return "";
  if (f.scale === 1) return String(value);
  return String(Number((value / f.scale).toFixed(f.decimals)));
}

/** What the input holds → stored whole number, or an error in plain words. */
export function toStored(shown: string, f: Field): { value: number | null } | { error: string } {
  const s = shown.trim().replace(/,/g, "");
  if (s === "") return f.optional ? { value: null } : { error: "Enter a number" };
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: "Numbers only" };
  const [, frac = ""] = s.split(".");
  if (frac.length > f.decimals) return { error: f.decimals === 0 ? "Whole numbers only" : `At most ${f.decimals} decimals` };
  return { value: Math.round(Number(s) * f.scale) };
}

/** A value with its unit, for the before → after line. */
export function withUnit(shown: string, f: Field): string {
  if (shown === "") return "not set";
  return `${f.prefix ?? ""}${shown} ${f.unit}`.replace(/ %$/, "%");
}
