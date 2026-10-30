"use server";

import { createHash, randomBytes } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateId, MAX_UPLOAD_BYTES, sanitizeUpload } from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

/**
 * Phase 7b: preview links (A5), the client's logo, and spec claims (A6).
 * Each runs as the signed-in person; the database decides. Bytes go through
 * the upload gate before storage, except the claim's own file, which is kept
 * exactly as sent so its fingerprint can be compared with what we delivered.
 */

// A preview link: the token is shown once (we keep only its hash).
export async function createPreviewLinkAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const days = Number(formData.get("days")) || 30;
  const token = randomBytes(24).toString("base64url");
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("create_preview_link", { p_order_id: orderId, p_token: token, p_days: days });
  refuseOn(error);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?link=${token}#share`);
}

export async function updatePreviewLinkAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("update_preview_link", {
    p_link_id: formData.get("link_id")?.toString() ?? "",
    p_revoke: formData.get("revoke") === "1",
    p_days: formData.get("days") ? Number(formData.get("days")) : null,
  });
  refuseOn(error);
  revalidatePath(`/orders/${orderId}`);
}

// The jeweler's logo for their preview pages: PNG or JPEG, cleaned.
export async function uploadLogoAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Refusal("not signed in");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Refusal("choose a PNG or JPEG");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gate = sanitizeUpload(
    { filename: file.name, declaredMimeType: file.type, sizeBytes: file.size, bytes },
    generateId(),
    { requireMetadataStrip: true, maxBytes: 2 * 1024 * 1024 },
  );
  if (!gate.ok || !["image/png", "image/jpeg"].includes(gate.file.contentType)) {
    throw new Refusal(gate.ok ? "the logo must be a PNG or JPEG" : gate.reason);
  }
  const key = `logos/${userId}/${gate.file.objectName}`;
  const admin = createAdminSupabaseClient();
  const up = await admin.storage.from(ORDER_FILES_BUCKET).upload(key, gate.file.bytes, { contentType: gate.file.contentType });
  refuseOn(up.error);
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_client_logo", { p_object_key: key });
  if (error) {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([key]);
    refuseOn(error);
  }
  revalidatePath("/account");
}

const CLAIM_FILE = /\.(stl|3dm)$/i;

// A spec claim: the file they cast from (kept byte for byte and hashed by
// us), 1–10 photos (cleaned), the spec and casting details.
export async function openClaimAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Refusal("not signed in");
  const orderId = formData.get("order_id")?.toString() ?? "";
  const supabase = await createUserSupabaseClient();
  const { data: window, error: wErr } = await supabase.rpc("claim_window", { p_order_id: orderId });
  refuseOn(wErr);
  if (!(window as { open: boolean }).open) throw new Refusal("this order is outside the claim window");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || !CLAIM_FILE.test(file.name)) {
    throw new Refusal("attach the STL or 3DM file you used");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Refusal("the file is too large");
  const photos = formData.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);
  if (photos.length === 0 || photos.length > 10) throw new Refusal("add 1 to 10 photos of the piece");

  const admin = createAdminSupabaseClient();
  const storage = admin.storage.from(ORDER_FILES_BUCKET);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileKey = `${orderId}/claims/${generateId()}.${file.name.split(".").pop()!.toLowerCase()}`;
  const uploaded: string[] = [];
  try {
    const up = await storage.upload(fileKey, bytes, { contentType: "application/octet-stream" });
    refuseOn(up.error);
    uploaded.push(fileKey);
    const photoKeys: string[] = [];
    for (const p of photos) {
      const pb = new Uint8Array(await p.arrayBuffer());
      const gate = sanitizeUpload({ filename: p.name, declaredMimeType: p.type, sizeBytes: p.size, bytes: pb }, generateId(), {
        requireMetadataStrip: true,
      });
      if (!gate.ok || !gate.file.contentType.startsWith("image/")) throw new Refusal("photos must be PNG or JPEG");
      const key = `${orderId}/claims/${gate.file.objectName}`;
      const r = await storage.upload(key, gate.file.bytes, { contentType: gate.file.contentType });
      refuseOn(r.error);
      uploaded.push(key);
      photoKeys.push(key);
    }
    const { error } = await admin.rpc("open_spec_claim", {
      p_client_id: userId,
      p_order_id: orderId,
      p_spec: formData.get("spec")?.toString() ?? "",
      p_description: formData.get("description")?.toString() ?? "",
      p_casting_details: formData.get("casting")?.toString() ?? "",
      p_uploaded_sha256: sha256,
      p_file_object_key: fileKey,
      p_photo_keys: photoKeys,
    });
    refuseOn(error);
  } catch (e) {
    if (uploaded.length) await storage.remove(uploaded);
    throw e;
  }
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}#claims`);
}

export async function decideClaimAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const upheld = formData.get("upheld") === "1";
  const measured: Record<string, string> = {};
  const value = formData.get("measured")?.toString().trim();
  if (value) measured.value = value;
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("decide_spec_claim", {
    p_claim_id: formData.get("claim_id")?.toString() ?? "",
    p_upheld: upheld,
    p_measured: measured,
    p_note: formData.get("note")?.toString() ?? "",
    p_fix_order_id: upheld ? generateId() : null,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}
