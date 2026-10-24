import "server-only";

import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";

import { mmWord } from "@/core";

import { pdf } from "./styles";

/**
 * The QC certificate and spec sheet (SPEC-ADDENDUM A2), built from
 * certificate_data() (0050). Measured minimums, the 19 lines with both
 * ticks and their times, waivers, the files' SHA-256 fingerprints, and the
 * designer and pod by reference only.
 */
export interface CertificateData {
  order_ref: string | null;
  version: number;
  category: string | null;
  service: string;
  product: string | null;
  passed_at: string | null;
  measurements: {
    min_wall_um: number;
    min_prong_um: number | null;
    stone_seats: { position?: string; shape?: string; size_mm?: string }[];
    ring_size: string | null;
    inner_diameter_um: number | null;
    mesh_tolerance_um: number;
    open_edges: number;
  };
  minimums: { wall_um: number | null; prong_um: number | null };
  waivers: { spec: string; requested: string; note: string | null }[];
  checklist: { item: number; group: string; label: string; signoff: boolean; designer_at: string | null; qc_at: string | null }[];
  designer_ref: string | null;
  pod_name: string | null;
  files: { slot: string; sha256: string; size_bytes: number; file_name: string }[];
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={pdf.row}>
      <Text style={pdf.label}>{label}</Text>
      <Text style={pdf.value}>{value}</Text>
    </View>
  );
}

function CertificateDoc({ d }: { d: CertificateData }) {
  const m = d.measurements;
  const below = (v: number | null, min: number | null) => (v != null && min != null && v < min ? "  (below the minimum — see waivers)" : "");
  return (
    <Document title={`QC certificate ${d.order_ref ?? ""} v${d.version}`}>
      <Page size="A4" style={pdf.page}>
        <Text style={pdf.eyebrow}>QC CERTIFICATE · SPEC SHEET</Text>
        <Text style={pdf.title}>{d.order_ref ?? "Order"} · version {d.version}</Text>
        <Text style={pdf.meta}>
          {[d.product, d.category ? `Category ${d.category}` : null, d.passed_at ? `QC passed ${when(d.passed_at)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        <Text style={pdf.h2}>Measured specification</Text>
        <Row label="Minimum wall" value={`${mmWord(m.min_wall_um)}${d.minimums.wall_um ? ` · required ${mmWord(d.minimums.wall_um)}` : ""}${below(m.min_wall_um, d.minimums.wall_um)}`} />
        <Row label="Minimum prong" value={`${mmWord(m.min_prong_um)}${d.minimums.prong_um ? ` · required ${mmWord(d.minimums.prong_um)}` : ""}${below(m.min_prong_um, d.minimums.prong_um)}`} />
        <Row label="Ring size" value={m.ring_size ?? "—"} />
        <Row label="Inner diameter" value={mmWord(m.inner_diameter_um)} />
        <Row label="Mesh tolerance" value={`${(m.mesh_tolerance_um / 1000).toFixed(3)} mm max distance / edge`} />
        <Row label="Open edges" value={String(m.open_edges)} />
        {m.stone_seats.length > 0 && (
          <Row
            label="Stone seats"
            value={m.stone_seats.map((s) => [s.position, s.shape, s.size_mm ? `${s.size_mm} mm` : null].filter(Boolean).join(" ")).join("; ")}
          />
        )}

        {d.waivers.length > 0 && (
          <>
            <Text style={pdf.h2}>Client waivers</Text>
            {d.waivers.map((w, i) => (
              <Text key={i} style={pdf.note}>
                {w.spec}: client requested {w.requested}
                {w.note ? ` — ${w.note}` : ""}. Not covered by the spec guarantee for this measurement.
              </Text>
            ))}
          </>
        )}

        <Text style={pdf.h2}>19-point checklist</Text>
        <View style={[pdf.row, { borderBottomColor: "#0A0A0A" }]}>
          <Text style={[pdf.mono, { width: 18 }]}>#</Text>
          <Text style={[pdf.value, pdf.mono]}>CHECK</Text>
          <Text style={pdf.tick}>DESIGNER TICKED</Text>
          <Text style={pdf.tick}>QC TICKED</Text>
        </View>
        {d.checklist.map((c) => (
          <View key={c.item} style={pdf.row} wrap={false}>
            <Text style={[pdf.mono, { width: 18 }]}>{String(c.item).padStart(2, "0")}</Text>
            <Text style={pdf.value}>
              {c.signoff ? "Sign-off" : c.label} <Text style={{ color: "#85857E" }}>· {c.group}</Text>
            </Text>
            {/* The built-in PDF fonts have no tick glyph; the time it was ticked is the tick. */}
            <Text style={pdf.tick}>{c.designer_at ? when(c.designer_at).slice(5, 16) : "not ticked"}</Text>
            <Text style={pdf.tick}>{c.qc_at ? when(c.qc_at).slice(5, 16) : "not ticked"}</Text>
          </View>
        ))}

        <Text style={pdf.h2}>Sign-off</Text>
        <Row label="Designer" value={d.designer_ref ?? "—"} />
        <Row label="QC reviewed by" value={`Pod lead${d.pod_name ? ` · ${d.pod_name}` : ""}`} />

        {d.files.length > 0 && (
          <>
            <Text style={pdf.h2}>Files and fingerprints (SHA-256)</Text>
            {d.files.map((f) => (
              <View key={f.slot} style={pdf.row} wrap={false}>
                <Text style={[pdf.mono, { width: 40 }]}>{f.slot}</Text>
                <Text style={[pdf.mono, { width: 150 }]}>{f.file_name}</Text>
                <Text style={[pdf.mono, pdf.value]}>{f.sha256}</Text>
              </View>
            ))}
            <Text style={[pdf.meta, { marginTop: 6 }]}>
              A file whose fingerprint differs from the one listed here has been edited after delivery.
            </Text>
          </>
        )}

        <Text style={pdf.footer} fixed>
          {d.order_ref ?? ""} · v{d.version} · generated {when(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  );
}

export function renderCertificate(d: CertificateData): Promise<Buffer> {
  return renderToBuffer(<CertificateDoc d={d} />);
}
