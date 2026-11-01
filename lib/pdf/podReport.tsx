import "server-only";

import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";

import type { Cell } from "@/core";

import { pdf } from "./styles";

/**
 * The pod report as a PDF (Phase 13c): the period, the team's figures, the
 * bottlenecks, and the designer table. Landscape, so the table fits.
 */
export interface PodReportPdf {
  title: string;
  periodLabel: string;
  kpis: [string, string][];
  bottlenecks: [string, string][];
  table: Cell[][];
}

const COLS = [0, 3, 5, 6, 7, 8, 11, 12, 13, 14, 19, 23]; // the columns that fit a page

function Doc({ d }: { d: PodReportPdf }) {
  const header = d.table[0] ?? [];
  const body = d.table.slice(1);
  return (
    <Document title={d.title}>
      <Page size="A4" orientation="landscape" style={pdf.page}>
        <Text style={pdf.eyebrow}>POD REPORT</Text>
        <Text style={pdf.title}>{d.title}</Text>
        <Text style={pdf.meta}>{d.periodLabel}</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {d.kpis.map(([label, value]) => (
            <View key={label} style={{ width: 120, padding: 6, borderWidth: 0.5, borderColor: "#E3E3DF" }}>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{value}</Text>
              <Text style={{ fontSize: 7.5, color: "#52524C" }}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={pdf.h2}>Bottlenecks now</Text>
        {d.bottlenecks.map(([l, v]) => (
          <View key={l} style={pdf.row}>
            <Text style={pdf.label}>{l}</Text>
            <Text style={pdf.value}>{v}</Text>
          </View>
        ))}

        <Text style={pdf.h2}>Designers</Text>
        <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: "#0A0A0A", paddingVertical: 3 }}>
          {COLS.map((c, i) => (
            <Text key={c} style={{ width: i === 0 ? 110 : 56, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: i === 0 ? "left" : "right" }}>
              {String(header[c] ?? "")}
            </Text>
          ))}
        </View>
        {body.map((row, ri) => (
          <View key={ri} style={[pdf.row, { paddingVertical: 2 }]} wrap={false}>
            {COLS.map((c, i) => (
              <Text key={c} style={{ width: i === 0 ? 110 : 56, fontSize: 7.5, textAlign: i === 0 ? "left" : "right", fontFamily: ri === body.length - 1 ? "Helvetica-Bold" : "Helvetica" }}>
                {row[c] == null ? "—" : String(row[c])}
              </Text>
            ))}
          </View>
        ))}

        <Text style={pdf.footer} fixed>
          From recorded events: assignment, start, pauses, submission and QC outcomes. Hours are working time (pauses excluded).
        </Text>
      </Page>
    </Document>
  );
}

export function renderPodReport(d: PodReportPdf): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />);
}
