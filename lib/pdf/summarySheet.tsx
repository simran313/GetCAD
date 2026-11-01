import "server-only";

import { Document, Image, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";

import { durationWord, formatDateTime, gramsWord, mmWord, statusMeta, summaryTimes, weightTable, type Metal, type StatusStep } from "@/core";

import { pdf } from "./styles";
import { pretty, stoneLines, type WeightSheetData } from "./weightSheet";

/**
 * The summary sheet (Phase 13a, owner 1 Nov 2026): one PDF the platform makes
 * itself, so the designer uploads four files instead of ten. The order, the
 * render image and the technical sheet, stones, gold weight per metal, and
 * how long it took with the timeline, all from recorded data
 * (summary_sheet_data, 0056). White-label like every document (DECISIONS §7).
 */
export interface SummaryData {
  ref: string | null;
  title: string | null;
  product_type: string | null;
  service: string | null;
  status: string;
  version: number;
  created_at: string;
  confirmed_at: string | null;
  volume_mm3: number | null;
  densities_mg_cm3: Partial<Record<Metal, number | null>>;
  spec: Record<string, string | number | boolean | null> | null;
  accents: WeightSheetData["accents"];
  measurements: { ring_size: string | null; inner_diameter_um: number | null } | null;
  timeline: StatusStep[];
}

export interface SummaryImages {
  render: Buffer | null;
  technical: Buffer | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={pdf.row}>
      <Text style={pdf.label}>{label}</Text>
      <Text style={pdf.value}>{value}</Text>
    </View>
  );
}

const ZONE = "America/New_York";
const when = (iso: string | null) => (iso ? `${formatDateTime(iso, ZONE)} ET` : "—");

function SummaryDoc({ d, images }: { d: SummaryData; images: SummaryImages }) {
  const s = d.spec ?? {};
  const t = summaryTimes(d.created_at, d.confirmed_at, d.timeline);
  const weights = d.volume_mm3 ? weightTable(Number(d.volume_mm3), d.densities_mg_cm3) : [];
  const stones = stoneLines(s, d.accents);
  const name = d.title ?? pretty(s.product) ?? pretty(d.product_type) ?? "Order";
  const dims: [string, string | null][] = [
    ["Product", pretty(s.product) ?? pretty(d.product_type)],
    ["Metal", [pretty(s.metal), s.karat ? String(s.karat) : null].filter(Boolean).join(" ") || null],
    ["Ring size", (d.measurements?.ring_size ?? (s.ring_size as string)) || null],
    ["Inner diameter", d.measurements?.inner_diameter_um ? mmWord(d.measurements.inner_diameter_um) : s.inner_diameter_um ? mmWord(Number(s.inner_diameter_um)) : null],
    ["Length", s.length_um ? mmWord(Number(s.length_um)) : null],
    ["Model volume", d.volume_mm3 ? `${Number(d.volume_mm3).toFixed(1)} mm³` : null],
  ];
  const steps = [...d.timeline].filter((x) => x.to).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <Document title={`Summary ${d.ref ?? ""}`}>
      <Page size="A4" style={pdf.page}>
        <Text style={pdf.eyebrow}>ORDER SUMMARY</Text>
        <Text style={pdf.title}>{name}</Text>
        <Text style={pdf.meta}>
          {d.ref ?? ""} · version {d.version} · {statusMeta(d.status).label}
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {images.render && (
            <View style={{ flex: 1 }}>
              <Text style={pdf.eyebrow}>RENDER VIEWS</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt attribute */}
              <Image src={images.render} style={{ marginTop: 4, width: "100%", objectFit: "contain", maxHeight: 230 }} />
            </View>
          )}
          {images.technical && (
            <View style={{ flex: 1 }}>
              <Text style={pdf.eyebrow}>TECHNICAL SHEET</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt attribute */}
              <Image src={images.technical} style={{ marginTop: 4, width: "100%", objectFit: "contain", maxHeight: 230 }} />
            </View>
          )}
        </View>

        <Text style={pdf.h2}>Specification</Text>
        {dims
          .filter((x): x is [string, string] => !!x[1])
          .map(([l, v]) => (
            <Row key={l} label={l} value={v} />
          ))}

        <Text style={pdf.h2}>Diamond details</Text>
        {stones.length > 0 ? (
          stones.map((st) => (
            <Text key={st} style={{ marginBottom: 2 }}>
              {st}
            </Text>
          ))
        ) : (
          <Text style={{ color: "#52524C" }}>No stones.</Text>
        )}

        <Text style={pdf.h2}>Gold weight (estimated from the model volume)</Text>
        {weights.length > 0 ? (
          weights.map((r) => <Row key={r.metal} label={r.name} value={gramsWord(r.grams)} />)
        ) : (
          <Text style={{ color: "#52524C" }}>No model volume recorded for this version.</Text>
        )}

        <Text style={pdf.h2}>Time taken</Text>
        <Row label="Placed" value={when(t.placedAt)} />
        <Row label="Confirmed (clock started)" value={when(t.confirmedAt)} />
        <Row label="First look" value={`${when(t.firstLookAt)}${t.firstLookMs != null ? ` · ${durationWord(t.firstLookMs)} after confirmation` : ""}`} />
        <Row label="Approved" value={when(t.approvedAt)} />
        <Row label="Turnaround" value={durationWord(t.turnaroundMs)} />
        <Row label="Revision rounds" value={String(t.revisions)} />

        {steps.length > 0 && (
          <>
            <Text style={pdf.h2}>Timeline</Text>
            {steps.map((x, i) => (
              <View key={`${x.at}-${i}`} style={pdf.row}>
                <Text style={[pdf.tick, { width: 150 }]}>{when(x.at)}</Text>
                <Text style={pdf.value}>{statusMeta(x.to ?? "").label}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={pdf.footer} fixed>
          Weights are estimates from the model; casting and finishing change the final weight. Times are recorded by the platform.
        </Text>
      </Page>
    </Document>
  );
}

export function renderSummarySheet(d: SummaryData, images: SummaryImages): Promise<Buffer> {
  return renderToBuffer(<SummaryDoc d={d} images={images} />);
}
