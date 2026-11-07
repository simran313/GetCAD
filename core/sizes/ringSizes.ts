/**
 * Ring sizes by country (owner, 5 Nov 2026): the client picks their country's
 * system, then a size from its list. Stored as text, the system's code and
 * the size ("US 6.5", "UK L½", "IN 12", "EU 52", "JP 11"), as the brief has
 * always stored ring sizes, so designers read it as the client meant it.
 */
export interface RingSizeSystem {
  code: "US" | "UK" | "IN" | "EU" | "IT" | "JP";
  label: string;
  sizes: string[];
}

const range = (from: number, to: number, step = 1) => {
  const out: string[] = [];
  for (let n = from; n <= to + 1e-9; n += step) out.push(Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
  return out;
};

const UK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const RING_SIZE_SYSTEMS: RingSizeSystem[] = [
  { code: "US", label: "US / Canada", sizes: range(3, 13.5, 0.5) },
  { code: "UK", label: "UK / Australia", sizes: UK_LETTERS.flatMap((l) => [l, `${l}½`]) },
  { code: "IN", label: "India", sizes: range(1, 30) },
  { code: "EU", label: "Europe (ISO, mm)", sizes: range(41, 70) },
  // Italy, Spain and Switzerland count from 40 mm: size 12 is a 52 mm ring.
  { code: "IT", label: "Italy / Spain / Switzerland", sizes: range(1, 30) },
  { code: "JP", label: "Japan / China / Hong Kong", sizes: range(1, 27) },
];

/**
 * Countries (owner, 7 Nov 2026: "most countries, not just 4–5"), each with
 * the ring-size system its jewellers use. The size is stored with the
 * system's code ("EU 54"), so a designer reads it the same whoever sent it.
 * The main jewellery markets come first; the rest follow A–Z.
 */
export interface RingCountry {
  name: string;
  system: RingSizeSystem["code"];
}

export const MAIN_RING_COUNTRIES: RingCountry[] = [
  { name: "United States", system: "US" },
  { name: "Canada", system: "US" },
  { name: "United Kingdom", system: "UK" },
  { name: "Australia", system: "UK" },
  { name: "India", system: "IN" },
  { name: "Germany", system: "EU" },
  { name: "France", system: "EU" },
  { name: "Italy", system: "IT" },
  { name: "United Arab Emirates", system: "EU" },
  { name: "Japan", system: "JP" },
  { name: "China", system: "JP" },
  { name: "Hong Kong", system: "JP" },
];

const OTHER_RING_COUNTRIES: RingCountry[] = ([
  { name: "Austria", system: "EU" },
  { name: "Bahrain", system: "EU" },
  { name: "Belgium", system: "EU" },
  { name: "Czechia", system: "EU" },
  { name: "Denmark", system: "EU" },
  { name: "Finland", system: "EU" },
  { name: "Greece", system: "EU" },
  { name: "Ireland", system: "UK" },
  { name: "Israel", system: "EU" },
  { name: "Kuwait", system: "EU" },
  { name: "Luxembourg", system: "EU" },
  { name: "Malaysia", system: "UK" },
  { name: "Mexico", system: "US" },
  { name: "Netherlands", system: "EU" },
  { name: "New Zealand", system: "UK" },
  { name: "Norway", system: "EU" },
  { name: "Oman", system: "EU" },
  { name: "Poland", system: "EU" },
  { name: "Portugal", system: "EU" },
  { name: "Qatar", system: "EU" },
  { name: "Russia", system: "EU" },
  { name: "Saudi Arabia", system: "EU" },
  { name: "Singapore", system: "UK" },
  { name: "South Africa", system: "UK" },
  { name: "South Korea", system: "JP" },
  { name: "Spain", system: "IT" },
  { name: "Sweden", system: "EU" },
  { name: "Switzerland", system: "IT" },
  { name: "Taiwan", system: "JP" },
  { name: "Turkey", system: "EU" },
] as RingCountry[]).sort((a, b) => a.name.localeCompare(b.name));

export const RING_COUNTRIES: RingCountry[] = [...MAIN_RING_COUNTRIES, ...OTHER_RING_COUNTRIES];

export function ringCountry(name: string): RingCountry | undefined {
  return RING_COUNTRIES.find((c) => c.name === name);
}

/** The first country that uses a system: what to show for a size saved before countries were kept. */
export function countryForSystem(code: string): string {
  return RING_COUNTRIES.find((c) => c.system === code)?.name ?? "";
}

export const DEFAULT_RING_SYSTEM = "US";

export function ringSystem(code: string): RingSizeSystem {
  return RING_SIZE_SYSTEMS.find((s) => s.code === code) ?? RING_SIZE_SYSTEMS[0]!;
}

/** "US 6.5" from the system and the size; empty when no size is chosen. */
export function formatRingSize(code: string, size: string): string {
  return size ? `${ringSystem(code).code} ${size}` : "";
}

/**
 * The system and size of a stored ring size. A size saved before systems
 * existed ("7", "us 7") is read as US when it is a US size; anything else
 * comes back as "other" so it is kept as typed rather than lost.
 */
export function parseRingSize(text: string | null | undefined): { code: string; size: string; other: string | null } {
  const t = (text ?? "").trim();
  if (!t) return { code: DEFAULT_RING_SYSTEM, size: "", other: null };
  const m = t.match(/^(US|UK|IN|EU|IT|JP)\s*(.+)$/i);
  if (m) {
    const sys = ringSystem(m[1]!.toUpperCase());
    const size = m[2]!.trim().replace(/1\/2$/, "½");
    const hit = sys.sizes.find((s) => s.toLowerCase() === size.toLowerCase());
    if (hit) return { code: sys.code, size: hit, other: null };
  }
  const us = ringSystem("US").sizes.find((s) => s === t);
  if (us) return { code: "US", size: us, other: null };
  return { code: DEFAULT_RING_SYSTEM, size: "", other: t };
}

/**
 * The inside of a ring by its size (owner, 7 Nov 2026: "diameter comes
 * automatically, with a manual option if it is off"). Jewellers' charts, in
 * millimetres; sizes between charts disagree by a few tenths, which is why
 * the client may enter their own measurement and the designer sees both.
 *
 *   EU (ISO 8653): the size is the inside circumference in mm.
 *   IT / ES / CH: the size + 40 mm.
 *   US / Canada: inside diameter 11.63 + 0.8128 × size.
 *   UK / Australia: A is 37.83 mm around, each half letter 0.628 mm more.
 *   India: the common Indian chart (size 1 is 40.8 mm around, 30 is 70.1).
 *   Japan / China / Hong Kong: inside diameter 12.7 + size / 3.
 */
const IN_CIRCUMFERENCE_MM = [
  40.8, 41.9, 43.0, 44.0, 44.9, 45.9, 47.1, 48.1, 49.0, 50.3, 50.9, 51.8, 52.8, 54.0, 55.0,
  55.9, 56.9, 58.1, 59.1, 60.0, 60.9, 62.2, 62.8, 63.8, 64.7, 66.0, 66.9, 67.9, 69.1, 70.1,
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Inside circumference in mm for a size in a system, or null when the size is not on its chart. */
export function ringCircumferenceMm(code: string, size: string): number | null {
  const sys = RING_SIZE_SYSTEMS.find((s) => s.code === code);
  if (!sys || !sys.sizes.includes(size)) return null;
  switch (sys.code) {
    case "EU":
      return Number(size);
    case "IT":
      return Number(size) + 40;
    case "US":
      return round1(Math.PI * (11.63 + 0.8128 * Number(size)));
    case "UK":
      return round1(37.83 + 0.628 * sys.sizes.indexOf(size));
    case "IN":
      return IN_CIRCUMFERENCE_MM[Number(size) - 1] ?? null;
    case "JP":
      return round1(Math.PI * (12.7 + Number(size) / 3));
  }
}

export interface RingMeasure {
  /** Inside diameter and circumference, mm, one decimal. */
  diameterMm: number;
  circumferenceMm: number;
  /** "chart": from the size; "measured": the client typed it. */
  source: "chart" | "measured";
  /** The chart's diameter for the chosen size, when the client's own measurement differs from it. */
  chartDiameterMm: number | null;
}

/**
 * What the designer works to: the client's own measurement when they gave
 * one (diameter first, then circumference), else the chart's for the size.
 */
export function ringMeasure(
  ringSize: string | null | undefined,
  innerDiameterUm?: number | null,
  innerCircumferenceUm?: number | null,
): RingMeasure | null {
  const parsed = parseRingSize(ringSize);
  const chartCirc = parsed.size ? ringCircumferenceMm(parsed.code, parsed.size) : null;
  const chartDia = chartCirc != null ? round1(chartCirc / Math.PI) : null;
  const measuredDia = innerDiameterUm && innerDiameterUm > 0 ? innerDiameterUm / 1000 : null;
  const measuredCirc = innerCircumferenceUm && innerCircumferenceUm > 0 ? innerCircumferenceUm / 1000 : null;
  if (measuredDia != null || measuredCirc != null) {
    const d = measuredDia ?? round1(measuredCirc! / Math.PI);
    const c = measuredCirc ?? round1(measuredDia! * Math.PI);
    return { diameterMm: round1(d), circumferenceMm: round1(c), source: "measured", chartDiameterMm: chartDia != null && Math.abs(chartDia - d) >= 0.05 ? chartDia : null };
  }
  if (chartCirc == null || chartDia == null) return null;
  return { diameterMm: chartDia, circumferenceMm: round1(chartCirc), source: "chart", chartDiameterMm: null };
}

/** "Ø 17.3 mm inside · 54.4 mm around", with where it came from. */
export function ringMeasureLine(m: RingMeasure, ringSize?: string | null): string {
  const base = `Ø ${m.diameterMm.toFixed(1)} mm inside · ${m.circumferenceMm.toFixed(1)} mm around`;
  if (m.source === "chart") return `${base} (size chart)`;
  return m.chartDiameterMm != null
    ? `${base} (client's measurement; the chart gives Ø ${m.chartDiameterMm.toFixed(1)} mm for ${ringSize})`
    : `${base} (client's measurement)`;
}
