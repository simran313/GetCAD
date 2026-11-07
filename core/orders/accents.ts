/**
 * One side-stone row in words, the same everywhere it is shown (the
 * designer's brief, the review rows, the weight and summary sheets).
 *
 * Since 0064 a row may have no width (the client ticked "Scale to centre
 * stone") and no count (the brief no longer asks), and its shape or setting
 * may be "As per reference image".
 */
export interface AccentWords {
  shape?: string | null;
  setting?: string | null;
  width_um?: number | null;
  quantity?: number | null;
}

/** "AS_PER_REFERENCE" → "As per reference image"; "PRONG_4" → "Prong 4". */
export function stoneWord(v: string | null | undefined): string {
  if (!v) return "";
  if (v === "AS_PER_REFERENCE") return "As per reference image";
  return v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** "18 × Round 1.3 mm · Pave", "Oval, scaled to the centre stone · As per reference image". */
export function accentLine(a: AccentWords): string {
  const size = a.width_um ? `${a.width_um / 1000} mm` : "scaled to the centre stone";
  const head = [a.quantity ? `${a.quantity} ×` : "", stoneWord(a.shape)].filter(Boolean).join(" ");
  const shapeAndSize = a.width_um ? `${head} ${size}` : `${head}, ${size}`;
  return [shapeAndSize.trim(), stoneWord(a.setting)].filter(Boolean).join(" · ");
}
