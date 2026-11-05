import { PDFDocument, PDFName, PDFString, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { cleanPdf } from "@/lib/files/cleanPdf";

const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

/** A certificate-like PDF that carries its maker's identity in every place a PDF can. */
async function identifiedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setAuthor("Acme Jewels Pvt Ltd");
  doc.setCreator("Acme Scanner Station");
  doc.setProducer("Acme PDF Writer");
  doc.setTitle("Acme Jewels certificate");
  doc.setSubject("Acme Jewels");
  doc.setKeywords(["Acme Jewels"]);
  const page = doc.addPage([300, 200]);
  page.drawRectangle({ x: 20, y: 20, width: 100, height: 50, color: rgb(0.2, 0.4, 0.8) });
  const ctx = doc.context;
  // XMP metadata on the catalog and on the page.
  const xmp = ctx.stream("<x:xmpmeta><dc:creator>Acme Jewels Pvt Ltd</dc:creator></x:xmpmeta>", { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(xmp));
  page.node.set(PDFName.of("Metadata"), ctx.register(ctx.stream("<x:xmpmeta>Acme page</x:xmpmeta>")));
  // A comment with its author's name.
  const annot = ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 30, 30], T: PDFString.of("Acme Reviewer"), Contents: PDFString.of("ok") });
  page.node.set(PDFName.of("Annots"), ctx.obj([ctx.register(annot)]));
  // A script run on open.
  doc.catalog.set(PDFName.of("OpenAction"), ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert('Acme')") }));
  return doc.save({ useObjectStreams: false });
}

describe("cleanPdf", () => {
  it("keeps the page and removes every trace of who made the file", async () => {
    const input = await identifiedPdf();
    expect(text(input)).toContain("Acme");
    const r = await cleanPdf(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(text(r.bytes)).not.toMatch(/Acme/);
    const out = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(out.getPageCount()).toBe(1);
    expect(out.getAuthor()).toBeUndefined();
    expect(out.getProducer()).toBeUndefined();
    expect(out.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
    expect(out.catalog.get(PDFName.of("OpenAction"))).toBeUndefined();
    expect(out.getPages()[0]!.node.get(PDFName.of("Annots"))).toBeUndefined();
  });

  it("refuses what is not a PDF, and a broken one", async () => {
    expect(await cleanPdf(new TextEncoder().encode("hello"))).toEqual({ ok: false, reason: "not a PDF" });
    expect(await cleanPdf(new TextEncoder().encode("%PDF-1.7 garbage"))).toEqual({ ok: false, reason: "the PDF could not be read" });
  });
});
