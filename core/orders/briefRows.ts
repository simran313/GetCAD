/**
 * The brief as people read it: the product's name, the name a job gets until
 * its client names it, and the brief as rows (review, the order page, the
 * team's read-only view). Pure, so every screen and the tests share one copy.
 */

const PRODUCT_WORDS: Record<string, string> = {
  RING: "Ring",
  BAND: "Band",
  PENDANT: "Pendant",
  EARRING: "Earrings",
  BRACELET: "Bracelet",
  BANGLE: "Bangle",
  NECKLACE: "Necklace",
  BROOCH: "Brooch",
  OTHER: "Piece",
  CAD_MODEL: "New piece",
};

/**
 * The name a job gets until its client names it: "Ring · 18K yellow".
 * Built from the brief, so it always says what the piece is.
 */
export function briefName(spec: { product?: string | null; karatage?: string | null; metal?: string | null } | null): string {
  if (!spec?.product) return "Untitled brief";
  const metal = spec.metal ? spec.metal.replace(/_/g, " ").toLowerCase() : "";
  const alloy = [spec.karatage?.trim(), metal].filter(Boolean).join(" ");
  return [productWord(spec.product), alloy].filter(Boolean).join(" · ");
}

const pretty = (v: unknown) =>
  typeof v === "string" && v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;

export interface BriefRow {
  key: string;
  label: string;
  value: string | null;
  /** The wizard step that edits it (0-based), and the field to scroll to. */
  step: number;
  field: string;
}

/**
 * The brief as rows, for review, the order page and anyone reading it. One
 * builder instead of three copies. `value` is null when the brief does not
 * say; the caller decides whether that is "—" or an "Add".
 */
export function briefRows(
  spec: Record<string, unknown> | null,
  opts: {
    service: string;
    photos: number;
    accents?: { quantity: number; shape?: string; width_um?: number; setting?: string }[];
    /** One row per accent-stone size instead of a count (the team's view). */
    detail?: boolean;
  },
): BriefRow[] {
  const render = opts.service === "render";
  const s = spec ?? {};
  const mm = (k: string) => (s[k] ? `${Number(s[k]) / 1000} mm` : null);
  const size =
    (s.ring_size as string | null) ||
    (s.inner_circumference_um ? `${mm("inner_circumference_um")} around` : null) ||
    (s.inner_diameter_um ? `${mm("inner_diameter_um")} inside` : null) ||
    (s.length_um ? `${mm("length_um")} long` : null);
  const accents = opts.accents ?? [];
  const metalStep = render ? 2 : 3;
  const rows: BriefRow[] = [
    { key: "name", label: "Name", value: (s.reference_name as string) || null, step: 0, field: "reference_name" },
    { key: "product", label: "Piece", value: s.product ? productWord(s.product as string) : null, step: 0, field: "product" },
    { key: "photos", label: "Photos", value: opts.photos ? String(opts.photos) : null, step: 0, field: "photos" },
  ];
  if (render) {
    rows.push({ key: "views", label: "Views", value: s.render_views ? String(s.render_views) : null, step: 1, field: "render_views" });
  } else {
    rows.push(
      {
        key: "centre",
        label: "Centre stone",
        value: s.has_centre_stone
          ? [
              Number(s.centre_quantity) > 1 ? `${s.centre_quantity} ×` : null,
              pretty(s.centre_shape),
              s.centre_length_um && s.centre_width_um
                ? `${Number(s.centre_length_um) / 1000} × ${Number(s.centre_width_um) / 1000} mm`
                : s.centre_carat_mct
                  ? `${Number(s.centre_carat_mct) / 1000} ct`
                  : null,
              pretty(s.centre_setting),
              s.centre_certified ? "certified" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : spec
            ? "None"
            : null,
        step: 1,
        field: "has_centre_stone",
      },
      ...(opts.detail && accents.length
        ? accents.map((a, i) => ({
            key: `accents-${i}`,
            label: `Accents ${i + 1}`,
            value: `${a.quantity} × ${pretty(a.shape) ?? ""} ${a.width_um ? `${a.width_um / 1000} mm` : ""}, ${pretty(a.setting) ?? ""}`.replace(/\s+/g, " "),
            step: 1,
            field: "accent_shape",
          }))
        : [
            {
              key: "accents",
              label: "Accent stones",
              value: accents.length
                ? `${accents.reduce((n, a) => n + a.quantity, 0)} in ${accents.length} size${accents.length === 1 ? "" : "s"}`
                : spec
                  ? "None"
                  : null,
              step: 1,
              field: "accent_shape",
            },
          ]),
      { key: "size", label: "Size", value: size, step: 2, field: "ring_size" },
    );
  }
  rows.push(
    { key: "metal", label: "Metal", value: [pretty(s.metal), s.karatage].filter(Boolean).join(" · ") || null, step: metalStep, field: "metal" },
    { key: "finish", label: "Finish", value: pretty(s.finish), step: metalStep, field: "finish" },
  );
  if (!render) {
    rows.push(
      { key: "purpose", label: "Made for", value: pretty(s.purpose), step: metalStep, field: "purpose" },
      { key: "format", label: "Files", value: s.format === "THREE_DM" ? "3DM" : pretty(s.format), step: metalStep, field: "format" },
    );
  }
  rows.push({ key: "notes", label: "Notes", value: (s.notes as string) || null, step: metalStep, field: "notes" });
  return rows;
}

export function productWord(product: string | null | undefined): string {
  if (!product) return "New piece";
  return PRODUCT_WORDS[product.toUpperCase()] ?? product;
}
