import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

/**
 * Clean a PDF that a designer will see (owner, 5 Nov 2026: diamond
 * certificates may be PDFs). A PDF carries who made it in places the page
 * does not show: the document info (author, creator, producer, title), XMP
 * metadata, comments and other annotations (each with its author's name),
 * attached files, form data, scripts, and earlier revisions kept by
 * incremental saves. This keeps only what is drawn on the pages:
 *
 * - each page loses its annotations, actions, XMP and editor data;
 * - only the pages are copied into a new, empty document, so the info
 *   dictionary, catalog XMP, attachments, scripts, forms and earlier
 *   revisions are not carried at all;
 * - XMP on images and fonts is dropped too.
 *
 * What is printed on the page itself cannot be cleaned; the upload screen
 * asks the client to cover any company name, as for photos.
 */
export type CleanPdfResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

const PAGE_KEYS = ["Metadata", "Annots", "AA", "PieceInfo", "B", "Thumb"];

export async function cleanPdf(input: Uint8Array): Promise<CleanPdfResult> {
  if (input.length < 5 || String.fromCharCode(...input.subarray(0, 5)) !== "%PDF-") {
    return { ok: false, reason: "not a PDF" };
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, reason: /encrypt/i.test(msg) ? "the PDF is password-protected" : "the PDF could not be read" };
  }
  if (doc.isEncrypted) return { ok: false, reason: "the PDF is password-protected" };
  let pages;
  try {
    pages = doc.getPages();
  } catch {
    return { ok: false, reason: "the PDF could not be read" };
  }
  if (pages.length === 0) return { ok: false, reason: "the PDF could not be read" };

  // Strip each page, then copy only the pages into a new, empty document:
  // whatever is not reachable from a page (the old info, catalog XMP,
  // attachments, scripts, forms, earlier revisions) is simply not carried.
  for (const page of pages) {
    for (const k of PAGE_KEYS) page.node.delete(PDFName.of(k));
  }
  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(
    doc,
    pages.map((_, i) => i),
  );
  for (const p of copied) out.addPage(p);
  // XMP can also hang off images and fonts; drop every one.
  for (const [, obj] of out.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : (obj as { dict?: unknown }).dict;
    if (dict instanceof PDFDict) dict.delete(PDFName.of("Metadata"));
  }
  out.context.trailerInfo.Info = undefined;
  out.context.trailerInfo.ID = undefined;

  const bytes = await out.save({ useObjectStreams: false, updateFieldAppearances: false });
  return { ok: true, bytes };
}
