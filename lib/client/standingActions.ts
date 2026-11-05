"use server";

import { revalidatePath } from "next/cache";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { generateId, sanitizeUpload } from "@/core";
import { Refusal, refuseOn } from "@/lib/refusal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { cleanPdf } from "@/lib/files/cleanPdf";
import { signCertificates, type CertRow } from "@/lib/work/standing";

/**
 * Master instructions and diamond certificates (owner, 5 Nov 2026; 0062).
 * The database decides who may write each; these only carry the request
 * and, for a certificate, clean the picture first.
 */

/** A client saves their own master instructions (empty clears them). */
export async function saveMasterInstructionsAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_master_instructions", { p_body: formData.get("body")?.toString() ?? "" });
  refuseOn(error);
  revalidatePath("/", "layout");
}

/** An admin writes them from an order's page, for that order's client (the database finds the client). */
export async function saveOrderMasterInstructionsAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_order_master_instructions", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_body: formData.get("body")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

export interface CertificateView {
  id: string;
  url: string;
  isPdf: boolean;
}

const MAX_CERT_BYTES = 10 * 1024 * 1024;

async function listCertificates(orderId: string): Promise<CertificateView[]> {
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.rpc("order_stone_certificates_for", { p_order_id: orderId });
  return signCertificates((data ?? []) as CertRow[]);
}

/**
 * Add a diamond certificate to an open brief: a picture (JPEG or PNG,
 * through the same gate as a reference picture: metadata stripped,
 * re-encoded) or a PDF (cleanPdf: only the pages are kept). Either is
 * stored under an opaque key; the file name is dropped. Returns the
 * order's certificates.
 */
export async function addCertificateAction(formData: FormData): Promise<CertificateView[]> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const file = formData.get("certificate");
  if (!(file instanceof File) || file.size === 0) throw new Refusal("choose the certificate (JPG, PNG or PDF)");
  if (file.size > MAX_CERT_BYTES) throw new Refusal("the certificate is larger than 10 MB");
  const input = new Uint8Array(await file.arrayBuffer());

  let key: string;
  let body: Uint8Array;
  let contentType: string;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const clean = await cleanPdf(input);
    if (!clean.ok) throw new Refusal(`the PDF was refused: ${clean.reason}`);
    key = `${orderId}/certs/${generateId()}.pdf`;
    body = clean.bytes;
    contentType = "application/pdf";
  } else {
    const gate = sanitizeUpload(
      { filename: file.name, declaredMimeType: file.type, sizeBytes: file.size, bytes: input },
      generateId(),
      { requireMetadataStrip: true },
    );
    if (!gate.ok) {
      throw new Refusal(
        /content type not allowed|cannot strip/.test(gate.reason)
          ? "upload the certificate as a JPG, PNG or PDF"
          : `the picture was refused: ${gate.reason}`,
      );
    }
    key = `${orderId}/certs/${gate.file.objectName}`;
    body = gate.file.bytes;
    contentType = gate.file.contentType;
  }

  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  const up = await storage.upload(key, body, { contentType, upsert: false });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("add_stone_certificate", {
    p_order_id: orderId,
    p_object_key: key,
    p_content_type: contentType,
    p_size_bytes: body.byteLength,
  });
  if (error) {
    await storage.remove([key]);
    refuseOn(error);
  }
  return listCertificates(orderId);
}

/** Remove one: the row first, then the bytes (as for reference pictures). */
export async function removeCertificateAction(orderId: string, certificateId: string): Promise<CertificateView[]> {
  const supabase = await createUserSupabaseClient();
  const { data: key, error } = await supabase.rpc("remove_stone_certificate", { p_id: certificateId });
  refuseOn(error);
  if (typeof key === "string") await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).remove([key]);
  return listCertificates(orderId);
}
