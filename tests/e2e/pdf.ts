/**
 * The text of a PDF, page by page joined, for checking what a document
 * says (the certificate's ticks, the weight sheet's alloys).
 */
export async function pdfText(bytes: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
  }
  await doc.destroy();
  return pages.join("\n").replace(/\s+/g, " ");
}
