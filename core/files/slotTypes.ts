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

/**
 * The content type a conversation attachment is checked as (Phase 4b).
 *
 * Decided by the file's extension where browsers are unreliable (CAD files),
 * otherwise by what the browser says. The gate still verifies the bytes, so
 * a wrong extension is refused rather than trusted.
 */
const BY_EXTENSION: Record<string, string> = {
  "3dm": "model/x-3dm",
  stl: "model/stl",
  step: "model/step",
  stp: "model/step",
  pdf: "application/pdf",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function attachmentContentType(fileName: string, browserType: string): string {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return BY_EXTENSION[ext] ?? browserType;
}

/** File-picker hints per conversation (the database enforces the designer thread's list). */
export const THREAD_ACCEPT = {
  internal: ".png,.jpg,.jpeg,.step,.stp,.stl,.3dm",
  client_team: ".png,.jpg,.jpeg,.pdf,.zip,.step,.stp,.stl,.3dm",
} as const;
