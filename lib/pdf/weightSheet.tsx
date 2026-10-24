import "server-only";

import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";

import { gramsWord, mmWord, weightTable, type Metal } from "@/core";

import { pdf } from "./styles";

/**
 * The weight sheet (SPEC-ADDENDUM A4; owner answer: grams only, no metal
 * cost). From weight_sheet_data() (0050): the model volume, the admin's
 * densities, the stones and the key dimensions from the brief.
 */
export interface WeightSheetData {
  ref: string | null;
  version: number;
  volume_mm3: number;
  densities_mg_cm3: Partial<Record<Metal, number | null>>;
  spec: Record<string, string | number | boolean | null> | null;
  accents: { shape: string; width_um: number; quantity: number; setting: string | null }[];
  measurements: { ring_size: string | null; inner_diameter_um: number | null } | null;
}

const pretty = (v: unknown) =>
  typeof v === "string" && v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={pdf.row}>
      <Text style={pdf.label}>{label}</Text>
      <Text style={pdf.value}>{value}</Text>
    </View>
  );
}

function WeightSheetDoc({ d }: { d: WeightSheetData }) {
  const s = d.spec ?? {};
  const table = weightTable(Number(d.volume_mm3), d.densities_mg_cm3);
  const dims: [string, string | null][] = [
    ["Product", pretty(s.product)],
    ["Ring size", (d.measurements?.ring_size ?? (s.ring_size as string)) || null],
    ["Inner diameter", d.measurements?.inner_diameter_um ? mmWord(d.measurements.inner_diameter_um) : s.inner_diameter_um ? mmWord(Number(s.inner_diameter_um)) : null],
    ["Length", s.length_um ? mmWord(Number(s.length_um)) : null],
    ["Model volume", `${Number(d.volume_mm3).toFixed(1)} mm³`],
  ];
  const stones: string[] = [
    ...(s.has_centre_stone
      ? [
          [
            "Centre",
            String(s.centre_quantity ?? 1),
            "×",
            pretty(s.centre_shape),
            [s.centre_length_um, s.centre_width_um].filter(Boolean).map((v) => (Number(v) / 1000).toString()).join(" × ") + " mm",
            pretty(s.centre_setting),
          ]
            .filter(Boolean)
            .join(" "),
        ]
      : []),
    ...d.accents.map((a, i) =>
      [`Side ${i + 1}`, `${a.quantity} ×`, pretty(a.shape), `${a.width_um / 1000} mm`, pretty(a.setting)].filter(Boolean).join(" "),
    ),
  ];
  return (
    <Document title={`Weight sheet ${d.ref ?? ""}`}>
      <Page size="A4" style={pdf.page}>
        <Text style={pdf.eyebrow}>WEIGHT SHEET</Text>
        <Text style={pdf.title}>{d.ref ?? "Order"} · version {d.version}</Text>
        <Text style={pdf.meta}>Estimated finished weight from the model volume. Casting and finishing change the final weight.</Text>

        <Text style={pdf.h2}>Estimated weight</Text>
        {table.map((r) => (
          <Row key={r.metal} label={r.name} value={gramsWord(r.grams)} />
        ))}

        <Text style={pdf.h2}>Key dimensions</Text>
        {dims
          .filter((x): x is [string, string] => !!x[1])
          .map(([l, v]) => (
            <Row key={l} label={l} value={v} />
          ))}

        {stones.length > 0 && (
          <>
            <Text style={pdf.h2}>Stones</Text>
            {stones.map((st) => (
              <Text key={st} style={{ marginBottom: 2 }}>
                {st}
              </Text>
            ))}
          </>
        )}

        <Text style={pdf.footer} fixed>
          Densities (g/cm³):{" "}
          {table.map((r) => `${r.metal} ${((d.densities_mg_cm3[r.metal] ?? 0) / 1000).toFixed(1)}`).join(" · ")}
        </Text>
      </Page>
    </Document>
  );
}

export function renderWeightSheet(d: WeightSheetData): Promise<Buffer> {
  return renderToBuffer(<WeightSheetDoc d={d} />);
}
