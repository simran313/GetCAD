/**
 * The single sanitization gate.
 *
 * EVERY uploaded file passes through sanitizeUpload() before it is stored or
 * served — there is no other path. The gate:
 *   1. allows only known-safe content types (allowlist),
 *   2. rejects oversized / empty files,
 *   3. verifies the file's MAGIC BYTES match the declared type (so a `.stl`
 *      that is really an executable, or a PDF-that-is-a-zip, is rejected),
 *   4. STRIPS IDENTITY FROM THE NAME: the stored object name is an opaque id
 *      plus the verified extension — the caller's original filename (which can
 *      leak who made it) is never used,
 *   5. STRIPS IDENTITY FROM THE BYTES, when asked: EXIF, PNG text chunks and
 *      STEP author/organisation headers are removed (see metadataStripper).
 *
 * (5) is why there are TWO allowlists. Renaming a file hides the filename but
 * not the studio name sitting in its EXIF — so on the double-blind delivery
 * path we accept only formats we can actually clean.
 *
 * Pure and framework-free: the opaque id is injected, so this is fully
 * deterministic and testable. Nothing here touches storage or the network.
 */

import { STRIPPABLE_TYPES, isStl, stripMetadata, type StripResult } from "./metadataStripper";

/**
 * Hard ceiling for a single upload.
 *
 * This is NOT a free choice: uploads reach us through Next Server Actions, so
 * the transport's `bodySizeLimit` (next.config.mjs UPLOAD_BODY_LIMIT_MB) is the
 * real cap. A value larger than that would advertise a size the request could
 * never carry — which is exactly the bug this constant used to have (100 MiB
 * declared here vs Next's silent 1 MB default).
 * tests/config/upload-limits.test.ts asserts the two agree.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB

/** mime -> verified extension + how to recognise it. */
interface TypeRule {
  ext: string;
  /** Byte signatures (any match), a required UTF-8 text prefix, or a check of the whole file. */
  magic: number[][] | { textPrefix: string } | { validate: (bytes: Uint8Array) => boolean };
}

const PDF_RULE: TypeRule = { ext: "pdf", magic: [[0x25, 0x50, 0x44, 0x46]] }; // %PDF
const PNG_RULE: TypeRule = { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] };
const JPEG_RULE: TypeRule = { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] };
const ZIP_RULE: TypeRule = {
  ext: "zip",
  magic: [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ],
}; // PK..
const STEP_RULE: TypeRule = { ext: "step", magic: { textPrefix: "ISO-10303-21" } };
// STL has no fixed signature: binary is recognised by its exact length,
// ASCII by `solid … facet` (see metadataStripper.isStl).
const STL_RULE: TypeRule = { ext: "stl", magic: { validate: isStl } };
// Rhino / openNURBS: every 3DM file starts with this 23-character banner.
const RHINO_3DM_RULE: TypeRule = { ext: "3dm", magic: { textPrefix: "3D Geometry File Format" } };

/**
 * Broad allowlist for uploads where the uploader's identity is ALREADY known to
 * the reader — e.g. a designer application portfolio, which arrives attached to
 * the applicant's own name, email and phone. Metadata inside those files leaks
 * nothing that the form did not already state.
 */
export const DEFAULT_ALLOWLIST: Record<string, TypeRule> = {
  "application/pdf": PDF_RULE,
  "image/png": PNG_RULE,
  "image/jpeg": JPEG_RULE,
  // Many CAD deliverables are zip-based (3mf, some step packages, archives).
  "application/zip": ZIP_RULE,
  // STEP: an ISO-10303-21 text CAD exchange file.
  "model/step": STEP_RULE,
};

/**
 * Strict allowlist for the DOUBLE-BLIND delivery path (designer -> client).
 *
 * Only formats we can verifiably clean. Two deliberate exclusions:
 *
 *   ZIP — its central directory stores every internal filename and folder name
 *   verbatim ("Nakshatra_Studio/final_v3.3dm"), and its contents are never
 *   inspected, so it also defeats this allowlist entirely: any file type at all
 *   can travel inside one.
 *
 *   PDF — identity lives in the /Info dictionary AND in XMP metadata streams
 *   that may be compressed inside object streams. Cleaning that correctly needs
 *   a real PDF parser; a partial scrub that still leaks would be worse than an
 *   honest refusal.
 *
 * Both remain accepted on the application path above, where anonymity is not
 * the goal. Re-admitting them here is a future slice, not a config tweak.
 */
export const DELIVERABLE_ALLOWLIST: Record<string, TypeRule> = {
  "image/png": PNG_RULE,
  "image/jpeg": JPEG_RULE,
  "model/step": STEP_RULE,
  // The two files every CAD job delivers (DECISIONS §9). STL is cleaned here;
  // 3DM needs the Rhino library, so it is cleaned by sanitizeUploadAsync with
  // an injected stripper and refused by the synchronous gate.
  "model/stl": STL_RULE,
  "model/x-3dm": RHINO_3DM_RULE,
};

/**
 * Voice messages (Phase 15), in the client conversation only: what a browser's
 * recorder makes (WebM/Opus in Chrome and Android, MP4/AAC in Safari and iOS,
 * Ogg in Firefox). Recognised by their container's signature. The designer
 * thread never takes them (post_thread_file allows only cleanable types
 * there): a voice is the speaker's, and the client's never reaches a designer.
 */
const isMp4 = (b: Uint8Array) => b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // ....ftyp
export const VOICE_ALLOWLIST: Record<string, TypeRule> = {
  "audio/webm": { ext: "webm", magic: [[0x1a, 0x45, 0xdf, 0xa3]] }, // EBML
  "audio/mp4": { ext: "m4a", magic: { validate: isMp4 } },
  "audio/ogg": { ext: "ogg", magic: [[0x4f, 0x67, 0x67, 0x53]] }, // OggS
};

/** Content types whose cleaning needs an async, injected stripper. */
export const ASYNC_STRIPPABLE_TYPES = ["model/x-3dm"] as const;

export interface IncomingFile {
  /** The client-supplied name — used ONLY for logging, never for the stored key. */
  filename: string;
  declaredMimeType: string;
  sizeBytes: number;
  /** The complete file contents. Magic bytes are read from the front of this. */
  bytes: Uint8Array;
}

export interface SanitizedFile {
  /** Opaque object name to store under — no trace of the original filename. */
  objectName: string;
  contentType: string;
  extension: string;
  /** Size AFTER any metadata stripping — this is what actually gets stored. */
  sizeBytes: number;
  /**
   * The bytes to store. Identical to the input unless metadata stripping ran,
   * in which case this is the cleaned content. ALWAYS store this, never the
   * caller's original buffer.
   */
  bytes: Uint8Array;
  /** True when identifying metadata was actively removed from the content. */
  metadataStripped: boolean;
}

export type GateResult =
  | { ok: true; file: SanitizedFile }
  | { ok: false; reason: string };

export interface GateOptions {
  maxBytes?: number;
  allowlist?: Record<string, TypeRule>;
  /**
   * Require that identifying metadata be removed from the file's contents.
   * A type with no stripper is REJECTED rather than passed through — for an
   * anonymity guarantee, refusing a deliverable beats leaking one.
   * Defaults to the DELIVERABLE_ALLOWLIST when set and no allowlist is given.
   */
  requireMetadataStrip?: boolean;
}

function headerMatches(header: Uint8Array, rule: TypeRule): boolean {
  if ("validate" in rule.magic) {
    return rule.magic.validate(header);
  }
  if (Array.isArray(rule.magic)) {
    return rule.magic.some(
      (sig) => header.length >= sig.length && sig.every((b, i) => header[i] === b),
    );
  }
  const prefix = rule.magic.textPrefix;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    header.subarray(0, prefix.length + 8),
  );
  return text.trimStart().startsWith(prefix);
}

/**
 * Validate + sanitize an incoming file. `opaqueId` is the caller-generated
 * opaque id (e.g. generateId()) used to build the stored object name.
 */
export function sanitizeUpload(
  input: IncomingFile,
  opaqueId: string,
  opts: GateOptions = {},
): GateResult {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  const strip = opts.requireMetadataStrip ?? false;
  const allowlist = opts.allowlist ?? (strip ? DELIVERABLE_ALLOWLIST : DEFAULT_ALLOWLIST);

  const rule = allowlist[input.declaredMimeType];
  if (!rule) {
    return { ok: false, reason: `content type not allowed: ${input.declaredMimeType}` };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: "empty file" };
  }
  if (input.sizeBytes > maxBytes) {
    return { ok: false, reason: `file too large (> ${maxBytes} bytes)` };
  }
  if (!headerMatches(input.bytes, rule)) {
    return { ok: false, reason: "file contents do not match the declared type" };
  }
  if (!opaqueId) {
    return { ok: false, reason: "missing opaque id" };
  }

  let bytes = input.bytes;
  let metadataStripped = false;

  if (strip) {
    if (!(STRIPPABLE_TYPES as readonly string[]).includes(input.declaredMimeType)) {
      return {
        ok: false,
        reason: `cannot strip identifying metadata from ${input.declaredMimeType}; not accepted where anonymity is required`,
      };
    }
    const stripped = stripMetadata(input.bytes, input.declaredMimeType);
    if (!stripped.ok) {
      return { ok: false, reason: `metadata stripping failed: ${stripped.reason}` };
    }
    bytes = stripped.bytes;
    metadataStripped = true;
  }

  return {
    ok: true,
    file: {
      // Identity-stripped: only the opaque id + verified extension.
      objectName: `${opaqueId}.${rule.ext}`,
      contentType: input.declaredMimeType,
      extension: rule.ext,
      sizeBytes: bytes.length,
      bytes,
      metadataStripped,
    },
  };
}

/** Cleans one file type that cannot be cleaned synchronously (3DM). */
export type AsyncStripper = (bytes: Uint8Array) => Promise<StripResult>;

/**
 * The gate for every type, including those whose cleaning is async.
 *
 * Synchronous types go straight through sanitizeUpload. A 3DM is validated
 * by the same checks (allowlist, size, signature, opaque name) and then
 * cleaned by the injected `strip3dm` — injected so this module stays pure and
 * free of the 9 MB Rhino library. With stripping required and no stripper
 * given, the file is refused, never passed through.
 */
export async function sanitizeUploadAsync(
  input: IncomingFile,
  opaqueId: string,
  opts: GateOptions & { strip3dm?: AsyncStripper } = {},
): Promise<GateResult> {
  if (!(ASYNC_STRIPPABLE_TYPES as readonly string[]).includes(input.declaredMimeType)) {
    return sanitizeUpload(input, opaqueId, opts);
  }
  const strip = opts.requireMetadataStrip ?? false;
  const checked = sanitizeUpload(input, opaqueId, {
    ...opts,
    requireMetadataStrip: false,
    allowlist: opts.allowlist ?? DELIVERABLE_ALLOWLIST,
  });
  if (!checked.ok || !strip) return checked;
  if (!opts.strip3dm) {
    return { ok: false, reason: `cannot strip identifying metadata from ${input.declaredMimeType}; not accepted where anonymity is required` };
  }
  const stripped = await opts.strip3dm(checked.file.bytes);
  if (!stripped.ok) {
    return { ok: false, reason: `metadata stripping failed: ${stripped.reason}` };
  }
  return {
    ok: true,
    file: { ...checked.file, bytes: stripped.bytes, sizeBytes: stripped.bytes.length, metadataStripped: true },
  };
}
