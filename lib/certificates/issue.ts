import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { renderCertificate, type CertificateData } from "@/lib/pdf/certificate";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Build, store and register the certificate for an order's latest measured
 * version (SPEC-ADDENDUM A2). The data is read AS THE CALLER, so only someone
 * who may see the certificate can cause one to be made; the PDF is stored
 * under a new key and registered once (record_certificate refuses a second
 * row for the same version, and nothing can change a row).
 *
 * Returns false when there is nothing to issue (no measurements, or already
 * issued).
 */
export async function issueCertificate(supabase: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("certificate_data", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  const d = data as (CertificateData & { issued: boolean }) | null;
  if (!d || d.issued) return false;

  const pdf = await renderCertificate(d);
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const objectKey = `${orderId}/certificates/v${d.version}-${randomUUID()}.pdf`;

  const admin = createAdminSupabaseClient();
  const up = await admin.storage
    .from(ORDER_FILES_BUCKET)
    .upload(objectKey, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

  const { error: recError } = await admin.rpc("record_certificate", {
    p_order_id: orderId,
    p_version: d.version,
    p_object_key: objectKey,
    p_sha256: sha256,
    p_size_bytes: pdf.length,
  });
  if (recError) {
    await admin.storage.from(ORDER_FILES_BUCKET).remove([objectKey]);
    if (/duplicate key/i.test(recError.message)) return false;
    throw new Error(recError.message);
  }
  return true;
}

/** SHA-256 of stored bytes, recorded by the server only (record_file_fingerprint). */
export async function recordFingerprint(fileVersionId: string, bytes: Uint8Array): Promise<void> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await createAdminSupabaseClient().rpc("record_file_fingerprint", {
    p_file_version_id: fileVersionId,
    p_sha256: sha256,
    p_size_bytes: bytes.length,
  });
  if (error) throw new Error(error.message);
}
