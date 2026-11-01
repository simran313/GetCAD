import "server-only";

import sharp from "sharp";

/**
 * An image ready to embed in a PDF (Phase 13a fix): a render export can be
 * 4000 px and tens of MB, and the PDF library decodes PNGs slowly in
 * JavaScript (13 s and ~1 GB for one 36 MB render), enough to fail the
 * request. So every image is first turned into a JPEG at most 1600 px on
 * its long side, on white, upright per its EXIF: print quality on A4,
 * embedded as-is. Null if the bytes are not an image we can read.
 */
const MAX_SIDE = 1600;

export async function pdfImage(bytes: Uint8Array | Buffer | null | undefined): Promise<Buffer | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    return await sharp(bytes, { failOn: "none", limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error("pdfImage: could not prepare an image for the PDF", e);
    return null;
  }
}
