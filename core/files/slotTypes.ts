/**
 * Which content type an upload slot takes (Phase 3a, DECISIONS §9).
 *
 * Browsers are unreliable about CAD files: a 3DM usually arrives as "" or
 * "application/octet-stream", an STL as any of four MIME types. So the type
 * the gate checks is decided by the SLOT, not by what the browser claims —
 * the gate then verifies the bytes really are that type. Image slots take
 * PNG or JPEG, decided by the browser's type and still verified by signature.
 *
 * PDF is not offered for any slot: the delivery path accepts only formats it
 * can clean, and PDF metadata cannot be cleaned reliably (sanitizationGate).
 */

export const SLOT_ACCEPT: Record<string, string> = {
  "3DM": ".3dm",
  STL: ".stl",
};

const IMAGE_ACCEPT = ".png,.jpg,.jpeg";

/** The file-picker `accept` hint for a slot. */
export function slotAccept(slot: string): string {
  return SLOT_ACCEPT[slot] ?? IMAGE_ACCEPT;
}

export type SlotTypeResult = { ok: true; contentType: string } | { ok: false; reason: string };

export function slotContentType(slot: string, browserType: string): SlotTypeResult {
  if (slot === "3DM") return { ok: true, contentType: "model/x-3dm" };
  if (slot === "STL") return { ok: true, contentType: "model/stl" };
  if (browserType === "image/png" || browserType === "image/jpeg") {
    return { ok: true, contentType: browserType };
  }
  return { ok: false, reason: `the ${slot} slot takes a PNG or JPEG image` };
}
