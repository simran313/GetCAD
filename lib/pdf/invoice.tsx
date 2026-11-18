import "server-only";

import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";

import { type InvoiceData, exportStatement, paymentLine, placeOfSupply } from "@/core/billing";
import { formatMoney } from "@/lib/money";

import { pdf } from "./styles";

/**
 * The invoice (0072; DECISIONS 1.35): A4, from invoice_data(), the issued
 * snapshot. Unlike the order's deliverables this is a document between the
 * company and its client, so it carries the seller's legal name; the client's
 * own customer never sees it (DECISIONS §7 is about their customer).
 */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function Block({ heading, lines }: { heading: string; lines: (string | null | undefined)[] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={pdf.eyebrow}>{heading.toUpperCase()}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={i === 0 ? { fontFamily: "Helvetica-Bold", marginTop: 4 } : { marginTop: 1 }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

export function InvoiceDocument({ d }: { d: InvoiceData }) {
  const total = formatMoney(d.amount, d.currency);
  const statement = exportStatement(d.tax);
  return (
    <Document title={`${d.tax.title} ${d.number}`} author={d.seller.legal_name}>
      <Page size="A4" style={pdf.page}>
        <Text style={pdf.eyebrow}>THE CAD PILLAR · {d.seller.legal_name.toUpperCase()}</Text>
        <Text style={pdf.title}>{d.tax.title}</Text>
        <Text style={pdf.meta}>
          No. {d.number} · Date {day(d.issued_at)}
        </Text>

        <View style={{ flexDirection: "row", gap: 24, marginBottom: 16 }}>
          <Block
            heading="From"
            lines={[
              d.seller.legal_name,
              d.seller.address,
              d.seller.cin ? `CIN ${d.seller.cin}` : null,
              d.seller.gstin ? `GSTIN ${d.seller.gstin}` : null,
            ]}
          />
          <Block
            heading="Bill to"
            lines={[d.bill_to.business ?? d.bill_to.contact, d.bill_to.business ? d.bill_to.contact : null, d.bill_to.address, d.bill_to.country, d.bill_to.email]}
          />
        </View>

        <View style={pdf.row}>
          <Text style={pdf.label}>Place of supply</Text>
          <Text style={pdf.value}>{placeOfSupply(d)}</Text>
        </View>
        <View style={pdf.row}>
          <Text style={pdf.label}>Payment date</Text>
          <Text style={pdf.value}>{day(d.paid_at)}</Text>
        </View>

        <View style={[pdf.row, { marginTop: 16, borderBottomColor: "#0A0A0A" }]}>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>Description</Text>
          <Text style={{ width: 70, fontFamily: "Helvetica-Bold" }}>SAC</Text>
          <Text style={{ width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" }}>Amount</Text>
        </View>
        <View style={pdf.row}>
          <Text style={{ flex: 1 }}>{d.description}</Text>
          <Text style={{ width: 70 }}>{d.tax.sac ?? "—"}</Text>
          <Text style={{ width: 90, textAlign: "right" }}>{total}</Text>
        </View>
        {d.tax.export && (
          <View style={pdf.row}>
            <Text style={{ flex: 1, color: "#52524C" }}>IGST (0%, export of services)</Text>
            <Text style={{ width: 70 }} />
            <Text style={{ width: 90, textAlign: "right" }}>{formatMoney(0, d.currency)}</Text>
          </View>
        )}
        <View style={[pdf.row, { borderBottomWidth: 0 }]}>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>Total ({d.currency})</Text>
          <Text style={{ width: 70 }} />
          <Text style={{ width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{total}</Text>
        </View>

        <Text style={[pdf.note, { marginTop: 14 }]}>{paymentLine(d.payment_method, d.payment_ref)}</Text>
        {statement && <Text style={pdf.note}>{statement}</Text>}
        {d.tax.note && <Text style={pdf.note}>{d.tax.note}</Text>}

        <Text style={pdf.footer} fixed>
          {d.number} · Computer-generated invoice; no signature required.
        </Text>
      </Page>
    </Document>
  );
}

export function renderInvoice(d: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument d={d} />);
}
