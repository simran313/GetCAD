import { CENTRE_CHART, SIZE_CHART, type ChartShape } from "./diamondCharts";

/**
 * The workshop calculators (Phase 13e), built from the owner's spreadsheets
 * (1 Nov 2026) so designers and pod leads stop keeping them in Excel.
 *
 * Gold casting weight (GOLD_WEIGHT_7.xlsx): from the 18K cast weight in grams,
 *   18K cast   = weight + casting allowance (0.1 g)
 *   with post  = weight + casting allowance + post allowance (1 g)
 *   other metal = the 18K figure ÷ 14 (18K density) × that metal's density.
 * The sheet's "without lock" and "without chain" tables use the same formula
 * as the plain cast weight, so they are that column.
 *
 * Diamond weight (Diamond_Size_Chart_Horizontal_v2.xlsx and the Boone & Sons
 * carat chart): pieces × carat per stone, totals per shape, grams = ct × 0.2.
 */

export const CASTING_ALLOWANCE_G = 0.1;
export const POST_ALLOWANCE_G = 1;
/** g/cm³, as the sheet has them. 18K is the reference. */
export const CAST_METALS = [
  { metal: "22K", density: 16 },
  { metal: "18K", density: 14 },
  { metal: "14K", density: 12 },
  { metal: "10K", density: 11.3 },
  { metal: "9K", density: 11 },
  { metal: "Silver", density: 10 },
  { metal: "Platinum", density: 21 },
] as const;
const REFERENCE_DENSITY = 14;

export interface CastRow {
  metal: string;
  density: number;
  /** Cast weight, grams (also without lock, without chain). */
  cast: number;
  /** Cast weight with the post allowance, grams. */
  withPost: number;
}

/** Cast weight per metal from the 18K weight in grams; [] for a weight that is not a positive number. */
export function castWeights(weight18k: number, allowances = { casting: CASTING_ALLOWANCE_G, post: POST_ALLOWANCE_G }): CastRow[] {
  if (!Number.isFinite(weight18k) || weight18k <= 0) return [];
  const base = weight18k + allowances.casting;
  const post = base + allowances.post;
  return CAST_METALS.map(({ metal, density }) => ({
    metal,
    density,
    cast: (base / REFERENCE_DENSITY) * density,
    withPost: (post / REFERENCE_DENSITY) * density,
  }));
}

export type ChartName = "size" | "centre";
export const CHARTS: Record<ChartName, { title: string; shapes: readonly ChartShape[] }> = {
  size: { title: "Size chart (side and melee stones)", shapes: SIZE_CHART },
  centre: { title: "Centre stones (Boone & Sons)", shapes: CENTRE_CHART },
};

export interface StoneLine {
  chart: ChartName;
  shape: string;
  size: string;
  pcs: number;
}

/** Carat per stone for a chart, shape and size; null when the chart has no such row. */
export function caratFor(chart: ChartName, shape: string, size: string): number | null {
  const row = CHARTS[chart].shapes.find((s) => s.shape === shape)?.sizes.find(([mm]) => mm === size);
  return row ? row[1] : null;
}

export const ctToGrams = (ct: number) => ct * 0.2;

export interface StoneTotals {
  lines: { line: StoneLine; carat: number | null; totalCt: number }[];
  byShape: { shape: string; pcs: number; ct: number; grams: number }[];
  pcs: number;
  ct: number;
  grams: number;
}

/** Each line's weight, totals by shape (in the order first used) and the grand total. */
export function stoneTotals(lines: StoneLine[]): StoneTotals {
  const out: StoneTotals = { lines: [], byShape: [], pcs: 0, ct: 0, grams: 0 };
  for (const line of lines) {
    const carat = caratFor(line.chart, line.shape, line.size);
    const pcs = Number.isFinite(line.pcs) && line.pcs > 0 ? Math.floor(line.pcs) : 0;
    const totalCt = carat == null ? 0 : carat * pcs;
    out.lines.push({ line, carat, totalCt });
    if (pcs === 0 || carat == null) continue;
    let shape = out.byShape.find((s) => s.shape === line.shape);
    if (!shape) {
      shape = { shape: line.shape, pcs: 0, ct: 0, grams: 0 };
      out.byShape.push(shape);
    }
    shape.pcs += pcs;
    shape.ct += totalCt;
    shape.grams = ctToGrams(shape.ct);
    out.pcs += pcs;
    out.ct += totalCt;
  }
  out.grams = ctToGrams(out.ct);
  return out;
}

/** Fixed decimals, at least three under 0.1 so small stones still read: 5.1 → "5.10", 0.005 → "0.005", 0.06 → "0.060". */
export function weightWord(n: number, digits = 2): string {
  if (n !== 0 && Math.abs(n) < 0.1) return n.toFixed(Math.max(digits, 3));
  return n.toFixed(digits);
}
