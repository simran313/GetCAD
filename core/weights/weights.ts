/**
 * The weight sheet's numbers (SPEC-ADDENDUM A4; owner answer: grams only).
 * Volume in mm³ from the designer; densities in mg/cm³ from app_settings
 * (10K 11.6 · 14K 13.1 · 18K 15.6 · Pt950 21.4 · Ag925 10.4 g/cm³ by
 * default, editable by admin). Framework-free so the screen, the PDF and the
 * tests compute the same grams.
 */

export const METALS = ["10K", "14K", "18K", "Pt950", "Ag925"] as const;
export type Metal = (typeof METALS)[number];

export const METAL_NAMES: Record<Metal, string> = {
  "10K": "10K gold",
  "14K": "14K gold",
  "18K": "18K gold",
  Pt950: "Platinum 950",
  Ag925: "Sterling silver 925",
};

/** Grams for a volume at a density: mm³ → cm³ (÷1000), mg/cm³ → g/cm³ (÷1000). */
export function grams(volumeMm3: number, densityMgCm3: number): number {
  if (!(volumeMm3 > 0) || !(densityMgCm3 > 0)) return 0;
  return (volumeMm3 / 1000) * (densityMgCm3 / 1000);
}

/** Two decimals, as jewelers quote weight. */
export function gramsWord(g: number): string {
  return `${g.toFixed(2)} g`;
}

export function weightTable(
  volumeMm3: number,
  densities: Partial<Record<Metal, number | null>>,
): { metal: Metal; name: string; grams: number }[] {
  return METALS.filter((m) => (densities[m] ?? 0) > 0).map((m) => ({
    metal: m,
    name: METAL_NAMES[m],
    grams: grams(volumeMm3, densities[m] as number),
  }));
}

/** "0.80 mm" from micrometres. */
export function mmWord(um: number | null | undefined): string {
  return um == null ? "—" : `${(um / 1000).toFixed(2)} mm`;
}
