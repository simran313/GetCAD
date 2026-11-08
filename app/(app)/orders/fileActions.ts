"use server";

import { revalidatePath } from "next/cache";

import {
  attachmentContentType,
  DEFAULT_ALLOWLIST,
  DELIVERABLE_ALLOWLIST,
  VOICE_ALLOWLIST,
  generateId,
  sanitizeUpload,
  sanitizeUploadAsync,
  slotContentType,
  MAX_DELIVERABLE_BYTES,
  RELEASE_KINDS,
  REVIEW_KINDS,
  type FileKind,
} from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { strip3dm } from "@/lib/files/strip3dm";
import { joinTechSheet } from "@/lib/files/techSheet";
import type { SavedStone } from "@/core/tools/calculators";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordFingerprint } from "@/lib/certificates/issue";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";
import { flushEmailsAfterResponse } from "@/lib/email/dispatch";

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
    throw new Refusal("no file provided");
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
    throw new Refusal(`rejected by sanitization gate: ${gate.reason}`);
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
    refuseOn(error);
  }

  revalidatePath("/", "layout");
  flushEmailsAfterResponse();
}

const INCOMING = (orderId: string) => `incoming/${orderId}/`;
const INCOMING_KEY = /^incoming\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

/**
 * Direct upload, step 1 (Phase 13a): the browser asks where to put the file.
 * Only the order's designer, while the version is in progress. The answer is
 * a one-off upload address in a holding area; nothing there is ever served.
 */
export async function beginSlotUploadAction(orderId: string, slot: string, size: number): Promise<{ url: string; key: string }> {
  if (!Number.isFinite(size) || size <= 0) throw new Refusal("no file provided");
  if (size > MAX_DELIVERABLE_BYTES) throw new Refusal(`file too large (over ${MAX_DELIVERABLE_BYTES / 1048576} MB)`);
  const supabase = await createUserSupabaseClient();
  const [{ data: jobs, error }, { data: slots, error: slotError }] = await Promise.all([
    supabase.rpc("my_work", { p_order_id: orderId }),
    supabase.rpc("job_slots", { p_order_id: orderId }),
  ]);
  refuseOn(error ?? slotError);
  const job = ((jobs ?? []) as { status: string }[])[0];
  if (!job) throw new Refusal("job not found");
  if (job.status !== "IN_PROGRESS") throw new Refusal("press Start work before uploading");
  if (!((slots ?? []) as { code: string }[]).some((s) => s.code === slot)) throw new Refusal(`no such slot: ${slot}`);

  const key = `${INCOMING(orderId)}${generateId()}`;
  const { data, error: signError } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).createSignedUploadUrl(key);
  if (signError || !data) throw new Error(`could not prepare the upload: ${signError?.message ?? "no address"}`);
  return { url: data.signedUrl, key };
}

/**
 * Direct upload, step 2: the file is in the holding area. Read it, run it
 * through the same gate as every other deliverable, store the clean copy in
 * its slot, and delete the original whatever happens.
 */
export async function finishSlotUploadAction(orderId: string, slot: string, key: string, fileName: string, browserType: string): Promise<{ fileName: string }> {
  if (!INCOMING_KEY.test(key) || !key.startsWith(INCOMING(orderId))) throw new Refusal("upload not found");
  const admin = createAdminSupabaseClient();
  try {
    const { data: blob, error } = await admin.storage.from(ORDER_FILES_BUCKET).download(key);
    if (error || !blob) throw new Refusal("the upload did not arrive — try again");
    if (blob.size > MAX_DELIVERABLE_BYTES) throw new Refusal(`file too large (over ${MAX_DELIVERABLE_BYTES / 1048576} MB)`);
    const stored = await storeSlotFile(orderId, slot, { name: fileName, type: browserType, bytes: new Uint8Array(await blob.arrayBuffer()) });
    // The plain technical image (Phase 13f): remember it, and join the
    // saved weights under it if there are any yet.
    if (slot === "TECH") {
      const supabase = await createUserSupabaseClient();
      refuseOn((await supabase.rpc("set_tech_source", { p_order_id: orderId, p_file_version_id: stored.fileVersionId })).error);
      await joinWeights(orderId);
    }
    revalidatePath("/", "layout");
    flushEmailsAfterResponse();
    return { fileName: stored.fileName };
  } finally {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([key]);
  }
}

/**
 * One file into one slot: the slot decides the content type
 * (core/files/slotTypes), the gate verifies the bytes and cleans them (STL in
 * core, 3DM rebuilt with blocks exploded by lib/files/strip3dm), and the
 * database names the file {JOB_CODE}_{SLOT}_v{n}.{ext}.
 */
async function storeSlotFile(
  orderId: string,
  slot: string,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<{ fileName: string; fileVersionId: string }> {
  const type = slotContentType(slot, file.type);
  if (!type.ok) throw new Refusal(type.reason);

  const gate = await sanitizeUploadAsync(
    { filename: file.name, declaredMimeType: type.contentType, sizeBytes: file.bytes.length, bytes: file.bytes },
    generateId(),
    { requireMetadataStrip: true, strip3dm, maxBytes: MAX_DELIVERABLE_BYTES },
  );
  if (!gate.ok) {
    throw new Refusal(`rejected by sanitization gate: ${gate.reason}`);
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
  const fileVersionId = generateId();
  const { data, error } = await supabase.rpc("add_slot_file", {
    p_id: fileVersionId,
    p_order_id: orderId,
    p_slot: slot,
    p_object_key: objectKey,
    p_content_type: gate.file.contentType,
    p_size_bytes: gate.file.sizeBytes,
    p_extension: gate.file.extension,
  });
  if (error) {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([objectKey]);
    refuseOn(error);
  }

  // The fingerprint of exactly the bytes stored (A3, 0050): what a spec
  // claim is matched against later.
  await recordFingerprint(fileVersionId, gate.file.bytes);
  return { fileName: (data as { file_name?: string } | null)?.file_name ?? "", fileVersionId };
}

interface WeightsRow {
  gold_18k_g: number | null;
  casting_allowance_g: number;
  post_allowance_g: number;
  stones: SavedStone[];
  tech_source_id: string | null;
  tech_current_id: string | null;
}

/**
 * Join the saved weights under the plain technical image (Phase 13f) and
 * store the result as the version's TECH file. Nothing to do until both the
 * gold weight and a technical image exist. A technical image uploaded before
 * this existed counts as the plain one. Best effort: if the join fails the
 * plain image stays and the job page says so.
 */
async function joinWeights(orderId: string): Promise<boolean> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("job_weights_get", { p_order_id: orderId });
  if (error || !data) return false;
  const w = data as WeightsRow;
  if (w.gold_18k_g == null) return false;
  let source = w.tech_source_id;
  if (!source && w.tech_current_id) {
    source = w.tech_current_id;
    refuseOn((await supabase.rpc("set_tech_source", { p_order_id: orderId, p_file_version_id: source })).error);
  }
  if (!source) return false;
  try {
    const { data: fv, error: fvError } = await supabase.from("file_versions").select("object_key").eq("id", source).maybeSingle();
    if (fvError || !fv) throw new Error(fvError?.message ?? "technical image not found");
    const { data: blob, error: dlError } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).download(fv.object_key as string);
    if (dlError || !blob) throw new Error(dlError?.message ?? "technical image not downloaded");
    const joined = await joinTechSheet(new Uint8Array(await blob.arrayBuffer()), {
      gold18k: Number(w.gold_18k_g),
      castingAllowance: Number(w.casting_allowance_g),
      postAllowance: Number(w.post_allowance_g),
      stones: w.stones ?? [],
    });
    await storeSlotFile(orderId, "TECH", { name: `technical.${joined.extension}`, type: joined.contentType, bytes: new Uint8Array(joined.bytes) });
    return true;
  } catch (e) {
    console.error("technical image: weights not joined", orderId, (e as Error).message);
    return false;
  }
}

/**
 * Save the version's gold weight and diamonds from the job page's weights
 * card (Phase 13f), then join them under the technical image.
 */
export async function saveWeightsAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const num = (k: string) => Number((formData.get(k)?.toString() ?? "").replace(",", "."));
  let stones: unknown = [];
  try {
    stones = JSON.parse(formData.get("stones")?.toString() || "[]");
  } catch {
    throw new Refusal("the diamond lines could not be read");
  }
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_job_weights", {
    p_order_id: orderId,
    p_gold_18k_g: num("gold_18k_g"),
    p_casting_allowance_g: num("casting_allowance_g"),
    p_post_allowance_g: num("post_allowance_g"),
    p_stones: stones,
  });
  refuseOn(error);
  await joinWeights(orderId);
  revalidatePath("/", "layout");
}

/**
 * Post in one of the order's conversations, with or without a file (Phase 4b).
 *
 * Which thread it is comes from the database (order_threads, as the user),
 * never from the form. A file for the designer thread must be cleanable and
 * is cleaned (EXIF, STEP author, STL header, 3DM rebuilt); a file for the
 * client thread is checked against the wider allowlist, since only the
 * client and the team read it, and may be a voice message (Phase 15).
 * post_thread_file() enforces the same split.
 */
export async function postThreadAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const threadId = formData.get("thread_id")?.toString() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  const supabase = await createUserSupabaseClient();
  if (!hasFile) {
    if (!body) throw new Refusal("message is empty");
    const { error } = await supabase.rpc("post_thread_message", { p_thread_id: threadId, p_body: body });
    refuseOn(error);
    revalidatePath("/", "layout");
    flushEmailsAfterResponse();
    return;
  }

  const { data: threads, error: threadError } = await supabase.rpc("order_threads", { p_order_id: orderId });
  refuseOn(threadError);
  const thread = ((threads ?? []) as { id: string; kind: string }[]).find((t) => t.id === threadId);
  if (!thread) throw new Refusal("thread not found");
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
      : { allowlist: { ...DEFAULT_ALLOWLIST, ...DELIVERABLE_ALLOWLIST, ...VOICE_ALLOWLIST } },
  );
  if (!gate.ok) throw new Refusal(`rejected by sanitization gate: ${gate.reason}`);

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
    refuseOn(error);
  }
  revalidatePath("/", "layout");
  flushEmailsAfterResponse();
}

/**
 * Forward a message to the order's other conversation (owner, 7 Nov 2026):
 * the client's message to the designer, the designer's to the client. Only
 * the team reads both, so only the team can (order_threads gives anyone else
 * one thread, and post rules stay the database's).
 *
 * The text goes as the team's own message: to the designer as "Forwarded from
 * the client", to the client with no label (to a client the team is one
 * voice). Files are not linked across but sent again through the upload gate
 * of the conversation they go to: a client's file reaching the designer has
 * its metadata stripped like any file sent to a designer, and a format the
 * designer conversation does not take (a voice message, a PDF) is left out
 * and counted.
 */
export async function forwardMessageAction(orderId: string, messageId: string): Promise<{ files: number; skipped: number }> {
  const supabase = await createUserSupabaseClient();
  const [threadsRes, messagesRes, filesRes] = await Promise.all([
    supabase.rpc("order_threads", { p_order_id: orderId }),
    supabase.rpc("order_messages", { p_order_id: orderId }),
    supabase.rpc("thread_attachments", { p_order_id: orderId }),
  ]);
  refuseOn(threadsRes.error ?? messagesRes.error ?? filesRes.error);
  const threads = (threadsRes.data ?? []) as { id: string; kind: string; can_post: boolean }[];
  const message = ((messagesRes.data ?? []) as { id: string; thread_id: string; body: string }[]).find((m) => m.id === messageId);
  if (!message) throw new Refusal("That message is not on this order.");
  const from = threads.find((t) => t.id === message.thread_id);
  const toKind = from?.kind === "client_team" ? "internal" : from?.kind === "internal" ? "client_team" : null;
  const target = threads.find((t) => t.kind === toKind && t.can_post);
  if (!target) throw new Refusal("Only the team can forward between the client and the designer.");
  const toDesigner = target.kind === "internal";

  const files = ((filesRes.data ?? []) as { id: string; message_id: string; file_name: string; content_type: string }[]).filter(
    (f) => f.message_id === messageId,
  );
  const body = files.length > 0 && message.body === "Sent a file." ? "" : message.body.trim();
  const text = toDesigner ? `Forwarded from the client${body ? `:\n${body}` : ""}` : body;

  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  let posted = 0;
  let skipped = 0;
  for (const f of files) {
    const { data: row } = await supabase.rpc("thread_file_for_download", { p_file_id: f.id }).maybeSingle();
    const key = (row as { object_key: string } | null)?.object_key;
    const blob = key ? (await storage.download(key)).data : null;
    if (!blob) {
      skipped += 1;
      continue;
    }
    const gate = await sanitizeUploadAsync(
      {
        filename: f.file_name,
        declaredMimeType: attachmentContentType(f.file_name, f.content_type),
        sizeBytes: blob.size,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      },
      generateId(),
      toDesigner
        ? { requireMetadataStrip: true, strip3dm }
        : { allowlist: { ...DEFAULT_ALLOWLIST, ...DELIVERABLE_ALLOWLIST, ...VOICE_ALLOWLIST } },
    );
    if (!gate.ok || (toDesigner && !["image/png", "image/jpeg", "model/step", "model/stl", "model/x-3dm"].includes(gate.file.contentType))) {
      skipped += 1;
      continue;
    }
    const objectKey = `${orderId}/threads/${gate.file.objectName}`;
    const up = await storage.upload(objectKey, gate.file.bytes, { contentType: gate.file.contentType, upsert: false });
    if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);
    const { error } = await supabase.rpc("post_thread_file", {
      p_thread_id: target.id,
      p_object_key: objectKey,
      p_content_type: gate.file.contentType,
      p_size_bytes: gate.file.sizeBytes,
      p_extension: gate.file.extension,
      // The text rides on the first file, so the forward reads as one message.
      p_note: posted === 0 && text ? text : null,
    });
    if (error) {
      await storage.remove([objectKey]);
      refuseOn(error);
    }
    posted += 1;
  }
  if (posted === 0) {
    if (!body) throw new Refusal(toDesigner ? "Nothing in this message can go to the designer: they take PNG, JPEG, STEP, STL or 3DM files." : "Nothing to forward.");
    const { error } = await supabase.rpc("post_thread_message", { p_thread_id: target.id, p_body: text });
    refuseOn(error);
  }
  revalidatePath("/", "layout");
  flushEmailsAfterResponse();
  return { files: posted, skipped };
}
