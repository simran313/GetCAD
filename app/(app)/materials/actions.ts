"use server";

import { revalidatePath } from "next/cache";

import { DEFAULT_ALLOWLIST, generateId, MAX_DELIVERABLE_BYTES, sanitizeUpload } from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

/**
 * Pod materials (Phase 13b): a pod lead shares an instruction, chart or
 * reference document with their pod. Uploaded like a deliverable, straight
 * from the browser to a holding area, then checked (PDF, PNG, JPEG, ZIP or
 * STEP, verified by their bytes) and filed under materials/{pod}/. The
 * database decides who may share with which pod (add_pod_material, 0057).
 */
const INCOMING_KEY = /^incoming\/materials\/[A-Za-z0-9_-]+$/;

/** What the gate checks a file as: the browser's type, or the extension's. */
function declaredType(fileName: string, browserType: string): string {
  if (browserType && browserType !== "application/octet-stream") return browserType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return (
    { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", zip: "application/zip", step: "model/step", stp: "model/step" }[ext] ??
    browserType
  );
}

async function managedPods(): Promise<Set<string>> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("material_pods");
  refuseOn(error);
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

export async function beginMaterialUploadAction(podId: string, size: number): Promise<{ url: string; key: string }> {
  if (!(await managedPods()).has(podId)) throw new Refusal("only the pod's lead or an admin shares materials with this pod");
  if (!Number.isFinite(size) || size <= 0) throw new Refusal("no file provided");
  if (size > MAX_DELIVERABLE_BYTES) throw new Refusal(`file too large (over ${MAX_DELIVERABLE_BYTES / 1048576} MB)`);
  const key = `incoming/materials/${generateId()}`;
  const { data, error } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).createSignedUploadUrl(key);
  if (error || !data) throw new Error(`could not prepare the upload: ${error?.message ?? "no address"}`);
  return { url: data.signedUrl, key };
}

export async function finishMaterialUploadAction(input: {
  podId: string;
  key: string;
  title: string;
  description: string;
  fileName: string;
  browserType: string;
}): Promise<void> {
  if (!INCOMING_KEY.test(input.key)) throw new Refusal("upload not found");
  const title = input.title.trim();
  if (!title) throw new Refusal("give the material a title");
  const admin = createAdminSupabaseClient();
  try {
    const { data: blob, error } = await admin.storage.from(ORDER_FILES_BUCKET).download(input.key);
    if (error || !blob) throw new Refusal("the upload did not arrive — try again");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const id = generateId();
    const gate = sanitizeUpload(
      { filename: input.fileName, declaredMimeType: declaredType(input.fileName, input.browserType), sizeBytes: bytes.length, bytes },
      id,
      { allowlist: DEFAULT_ALLOWLIST, maxBytes: MAX_DELIVERABLE_BYTES },
    );
    if (!gate.ok) throw new Refusal(`not accepted: ${gate.reason} (PDF, PNG, JPEG, ZIP or STEP)`);

    const objectKey = `materials/${input.podId}/${gate.file.objectName}`;
    const up = await admin.storage.from(ORDER_FILES_BUCKET).upload(objectKey, gate.file.bytes, { contentType: gate.file.contentType, upsert: false });
    if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

    const supabase = await createUserSupabaseClient();
    const { error: addError } = await supabase.rpc("add_pod_material", {
      p_id: id,
      p_pod_id: input.podId,
      p_title: title.slice(0, 120),
      p_description: input.description.trim().slice(0, 2000),
      p_object_key: objectKey,
      p_file_name: input.fileName.slice(0, 200) || `material.${gate.file.extension}`,
      p_content_type: gate.file.contentType,
      p_size_bytes: gate.file.sizeBytes,
    });
    if (addError) {
      await admin.storage.from(ORDER_FILES_BUCKET).remove([objectKey]);
      refuseOn(addError);
    }
    revalidatePath("/materials");
  } finally {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([input.key]);
  }
}

export async function removeMaterialAction(id: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("remove_pod_material", { p_id: id });
  refuseOn(error);
  revalidatePath("/materials");
}
