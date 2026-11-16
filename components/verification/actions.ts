"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { CLIENT_VERIFICATION_BUCKET } from "@/config/supabase";
import { generateId } from "@/core";
import { checkBusiness, checkProof, isProofKind, proofKey } from "@/core/verification";
import { flushEmailsAfterResponse } from "@/lib/email/dispatch";
import { refuseOn, Refusal } from "@/lib/refusal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The verification screen's two actions (0068). The database decides who may
 * do what (a pending client, their own folder, five proofs at most); these
 * check the form first so the person gets a plain reason, then store the
 * file with the server's storage key and record it as the client.
 */

export async function submitVerificationAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Refusal("sign in first");

  const fields = {
    business_type: formData.get("business_type")?.toString() ?? "",
    country: formData.get("country")?.toString() ?? "",
    address: formData.get("address")?.toString() ?? "",
    website: formData.get("website")?.toString() ?? "",
  };
  const problem = checkBusiness(fields);
  if (problem) throw new Refusal(problem);

  const files = formData.getAll("proofs").filter((f): f is File => f instanceof File && f.size > 0);
  const kind = formData.get("proof_kind")?.toString() ?? "";
  if (files.length > 0 && !isProofKind(kind)) throw new Refusal("Choose what the document is.");
  for (const f of files) {
    const bad = checkProof(f);
    if (bad) throw new Refusal(bad);
  }

  const supabase = await createUserSupabaseClient();
  if (files.length > 0) {
    const storage = createAdminSupabaseClient().storage.from(CLIENT_VERIFICATION_BUCKET);
    for (const f of files) {
      const key = proofKey(userId, f.name, generateId());
      const up = await storage.upload(key, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false });
      if (up.error) throw new Error(`${f.name}: ${up.error.message}`);
      const { error } = await supabase.rpc("add_client_verification_document", {
        p_kind: kind,
        p_object_key: key,
        p_file_name: f.name,
        p_mime: f.type,
        p_size_bytes: f.size,
      });
      if (error) {
        await storage.remove([key]);
        refuseOn(error);
      }
    }
  }

  const { error } = await supabase.rpc("submit_client_verification", {
    p_business_type: fields.business_type,
    p_country: fields.country.trim(),
    p_address: fields.address.trim(),
    p_website: fields.website.trim(),
    p_role_title: formData.get("role_title")?.toString().trim() || null,
  });
  refuseOn(error);

  flushEmailsAfterResponse();
  revalidatePath("/", "layout");
}

export async function removeVerificationDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("remove_my_verification_document", { p_id: formData.get("id")?.toString() ?? "" });
  refuseOn(error);
  if (typeof data === "string") await createAdminSupabaseClient().storage.from(CLIENT_VERIFICATION_BUCKET).remove([data]);
  revalidatePath("/", "layout");
}
