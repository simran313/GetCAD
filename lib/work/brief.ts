import { productWord } from "@/lib/client/orders";
import { accentLine, stoneWord } from "@/core/orders/accents";
import { ringMeasure, ringMeasureLine } from "@/core/sizes/ringSizes";

/**
 * The brief as label/value lines for the job and QC screens (D4, P2). Works
 * on job_brief() (the designer's copy, without the client's label) and on
 * an order_specs row alike.
 */
export type BriefRow = Record<string, string | number | boolean | null | undefined>;

const pretty = (v: unknown) =>
  typeof v === "string" && v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;
const mm = (um: unknown) => (typeof um === "number" && um > 0 ? `${um / 1000}` : null);

export interface AccentLine {
  shape: string;
  /** null = scaled to the centre stone (0064). */
  width_um: number | null;
  /** null = not asked (0064). */
  quantity: number | null;
  setting: string | null;
}

export function briefLines(spec: BriefRow | null, accents: AccentLine[] = []): { label: string; value: string }[] {
  if (!spec) return [];
  // A ring: its size, then the inside it is made to, from the size chart or
  // as the client measured it, both shown when they differ (owner, 7 Nov 2026).
  const ring =
    spec.ring_size || spec.inner_circumference_um
      ? ringMeasure(spec.ring_size as string | null, spec.inner_diameter_um as number | null, spec.inner_circumference_um as number | null)
      : null;
  const centreDims = [mm(spec.centre_length_um), mm(spec.centre_width_um), mm(spec.centre_depth_um)].filter(Boolean);
  const lines: [string, string | null][] = [
    ["Product", productWord(spec.product as string)],
    ["Metal", [pretty(spec.metal), spec.karatage].filter(Boolean).join(" · ") || null],
    ["Ring size", (spec.ring_size as string) || null],
    ["Inside", ring ? ringMeasureLine(ring, spec.ring_size as string | null) : null],
    ["Inner diameter", !ring && mm(spec.inner_diameter_um) ? `${mm(spec.inner_diameter_um)} mm` : null],
    ["Inner circumference", !ring && mm(spec.inner_circumference_um) ? `${mm(spec.inner_circumference_um)} mm` : null],
    ["Length", mm(spec.length_um) ? `${mm(spec.length_um)} mm` : null],
    ["Parts", spec.component_count && Number(spec.component_count) > 1 ? String(spec.component_count) : null],
    [
      "Centre stone",
      spec.has_centre_stone
        ? [stoneWord(spec.centre_shape as string) || null, centreDims.length ? `${centreDims.join(" × ")} mm` : null, spec.centre_carat_mct ? `${Number(spec.centre_carat_mct) / 1000} ct` : null]
            .filter(Boolean)
            .join(" · ")
        : "None",
    ],
    ["Setting", spec.has_centre_stone ? stoneWord(spec.centre_setting as string) || null : null],
    [
      "Side stones",
      accents.length
        ? accents.map(accentLine).join("; ")
        : null,
    ],
    ["Stones supplied by", spec.stones_supplied_by && spec.stones_supplied_by !== "NONE" ? pretty(spec.stones_supplied_by) : null],
    ["Finish", pretty(spec.finish)],
    ["Purpose", pretty(spec.purpose)],
    ["Files", pretty(spec.format)],
    ["Render views", spec.render_views ? String(spec.render_views) : null],
    ["What changed", (spec.change_summary as string) || null],
  ];
  return lines.filter((l): l is [string, string] => !!l[1]).map(([label, value]) => ({ label, value }));
}
