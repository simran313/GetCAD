"use server";

import { revalidatePath } from "next/cache";

import {
  attachmentContentType,
  DEFAULT_ALLOWLIST,
  DELIVERABLE_ALLOWLIST,
  generateId,
  sanitizeUpload,
  sanitizeUploadAsync,
  slotContentType,
  RELEASE_KINDS,
  REVIEW_KINDS,
  type FileKind,
} from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { strip3dm } from "@/lib/files/strip3dm";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Upload a file to an order. EVERY byte goes through the single sanitization
 * gate before it is stored. Storage write uses the service role (post-gate,
 * trusted); the version is recorded AS THE USER so the participant check +
 * audit run under their identity.
 */
/**
 * Kinds a form is allowed to name.
 *
 * A Server Action receives whatever the caller posts, so the `kind` field is
 * input, not a choice made by the select box. An unrecognised value must not
 * reach the database as text; and defaulting a bad one to something in the
 * review set would let a crafted post put a deliverable where the client can
 * download it before approving. OTHER is the safe fallback because the gate
 * withholds it.
 */
const ACCEPTED_KINDS = new Set<string>([...REVIEW_KINDS, ...RELEASE_KINDS, "CLIENT_REFERENCE"]);

function readKind(formData: FormData): FileKind {
  const raw = formData.get("kind")?.toString() ?? "";
  return ACCEPTED_KINDS.has(raw) ? (raw as FileKind) : "OTHER";
}

export async function uploadFileAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const kind = readKind(formData);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("no file provided");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const opaqueId = generateId();
  // This is the DOUBLE-BLIND delivery path: the client downloads what the
  // designer uploads, so identifying metadata inside the bytes (EXIF, PNG text
  // chunks, STEP author/organisation) must be removed, not just the filename.
  const gate = sanitizeUpload(
    {
      filename: file.name,
      declaredMimeType: file.type,
      sizeBytes: file.size,
      bytes,
    },
    opaqueId,
    { requireMetadataStrip: true },
  );
  if (!gate.ok) {
    throw new Error(`rejected by sanitization gate: ${gate.reason}`);
  }

  const objectKey = `${orderId}/${gate.file.objectName}`;

  const admin = createAdminSupabaseClient();
  // Store the CLEANED bytes, never the caller's original buffer.
  const up = await admin.storage
    .from(ORDER_FILES_BUCKET)
    .upload(objectKey, gate.file.bytes, { contentType: gate.file.contentType, upsert: false });
  if (up.error) {
    throw new Error(`storage upload failed: ${up.error.message}`);
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("add_file_version", {
    p_id: generateId(),
    p_order_id: orderId,
    p_object_key: objectKey,
    p_content_type: gate.file.contentType,
    p_size_bytes: gate.file.sizeBytes,
    // The database has the last word on whether this party may claim this kind
    // — a client cannot post 'STL' and have it land in the release set.
    p_kind: kind,
  });
  if (error) {
    // Not a participant (or other failure) — remove the orphaned object.
    await admin.storage.from(ORDER_FILES_BUCKET).remove([objectKey]);
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}

/**
 * The designer puts a file into an upload slot (Phase 3a, DECISIONS §9).
 *
 * The slot decides the content type (core/files/slotTypes), the gate verifies
 * the bytes and cleans them — STL in core, 3DM rebuilt by lib/files/strip3dm —
 * and the database names the file {JOB_CODE}_{SLOT}_v{n}.{ext}. Uploading into
 * a filled slot replaces it for this version.
 */
export async function uploadSlotAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const slot = formData.get("slot")?.toString() ?? "";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("no file provided");
  }

  const type = slotContentType(slot, file.type);
  if (!type.ok) throw new Error(type.reason);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const gate = await sanitizeUploadAsync(
    { filename: file.name, declaredMimeType: type.contentType, sizeBytes: file.size, bytes },
    generateId(),
    { requireMetadataStrip: true, strip3dm },
  );
  if (!gate.ok) {
    throw new Error(`rejected by sanitization gate: ${gate.reason}`);
  }

  const objectKey = `${orderId}/${gate.file.objectName}`;
  const admin = createAdminSupabaseClient();
  const up = await admin.storage
    .from(ORDER_FILES_BUCKET)
    .upload(objectKey, gate.file.bytes, { contentType: gate.file.contentType, upsert: false });
  if (up.error) {
    throw new Error(`storage upload failed: ${up.error.message}`);
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("add_slot_file", {
    p_id: generateId(),
    p_order_id: orderId,
    p_slot: slot,
    p_object_key: objectKey,
    p_content_type: gate.file.contentType,
    p_size_bytes: gate.file.sizeBytes,
    p_extension: gate.file.extension,
  });
  if (error) {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([objectKey]);
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}

/**
 * Post in one of the order's conversations, with or without a file (Phase 4b).
 *
 * Which thread it is comes from the database (order_threads, as the user),
 * never from the form. A file for the designer thread must be cleanable and
 * is cleaned (EXIF, STEP author, STL header, 3DM rebuilt); a file for the
 * client thread is checked against the wider allowlist, since only the
 * client and the team read it. post_thread_file() enforces the same split.
 */
export async function postThreadAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const threadId = formData.get("thread_id")?.toString() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  const supabase = await createUserSupabaseClient();
  if (!hasFile) {
    if (!body) throw new Error("message is empty");
    const { error } = await supabase.rpc("post_thread_message", { p_thread_id: threadId, p_body: body });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return;
  }

  const { data: threads, error: threadError } = await supabase.rpc("order_threads", { p_order_id: orderId });
  if (threadError) throw new Error(threadError.message);
  const thread = ((threads ?? []) as { id: string; kind: string }[]).find((t) => t.id === threadId);
  if (!thread) throw new Error("thread not found");
  const toDesigner = thread.kind === "internal";

  const gate = await sanitizeUploadAsync(
    {
      filename: file.name,
      declaredMimeType: attachmentContentType(file.name, file.type),
      sizeBytes: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    },
    generateId(),
    toDesigner
      ? { requireMetadataStrip: true, strip3dm }
      : { allowlist: { ...DEFAULT_ALLOWLIST, ...DELIVERABLE_ALLOWLIST } },
  );
  if (!gate.ok) throw new Error(`rejected by sanitization gate: ${gate.reason}`);

  const objectKey = `${orderId}/threads/${gate.file.objectName}`;
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  const up = await storage.upload(objectKey, gate.file.bytes, { contentType: gate.file.contentType, upsert: false });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

  const { error } = await supabase.rpc("post_thread_file", {
    p_thread_id: threadId,
    p_object_key: objectKey,
    p_content_type: gate.file.contentType,
    p_size_bytes: gate.file.sizeBytes,
    p_extension: gate.file.extension,
    p_note: body || null,
  });
  if (error) {
    await storage.remove([objectKey]);
    throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}
