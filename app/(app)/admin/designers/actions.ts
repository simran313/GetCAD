"use server";

import { revalidatePath } from "next/cache";

import { DESIGNER_DOCUMENTS_BUCKET } from "@/config/supabase";
import { generateId } from "@/core";
import { parseDesignerLines } from "@/core/designers/parse";
import { openSignInAccount } from "@/lib/clerk/accounts";
import { refuseOn, Refusal } from "@/lib/refusal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Designers added by the team (owner, 4 Nov 2026). Every function here runs
 * the database's check first (admin only), so nothing reaches Clerk or
 * storage for someone who may not do it; the database checks again when
 * the row is written.
 */

export interface AddedDesigner {
  userId: string;
  label: string;
}

export interface AddDesignersResult {
  added: AddedDesigner[];
  already: AddedDesigner[];
  problems: string[];
}

async function requireAdmin() {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("admin_designers");
  refuseOn(error);
  return supabase;
}

/** One designer per line: "email - Name" (or name first, commas, an optional phone). */
export async function addDesignersAction(_prev: AddDesignersResult | null, formData: FormData): Promise<AddDesignersResult> {
  const supabase = await requireAdmin();
  const { people, problems } = parseDesignerLines(formData.get("people")?.toString() ?? "");
  const result: AddDesignersResult = { added: [], already: [], problems: problems.map((p) => `Line ${p.line} (${p.text}): ${p.reason}`) };

  for (const person of people) {
    try {
      const account = await openSignInAccount(person.email, person.name);
      const { data, error } = await supabase.rpc("register_designer", {
        p_user_id: account.userId,
        p_legal_name: person.name,
        p_email: person.email,
        p_phone: person.phone,
      });
      if (error) {
        result.problems.push(`${person.email}: ${error.message}`);
        continue;
      }
      ((data as { new: boolean } | null)?.new ? result.added : result.already).push({ userId: account.userId, label: `${person.name} · ${person.email}` });
    } catch (e) {
      result.problems.push(`${person.email}: ${e instanceof Error ? e.message : "the sign-in account could not be opened"}`);
    }
  }
  // No page refresh here: it can re-render the page through its loading
  // screen and drop this result before it is seen. The result links each
  // designer instead; the list below is fresh on the next visit.
  return result;
}

export async function saveBankAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const userId = formData.get("user_id")?.toString() ?? "";
  const { error } = await supabase.rpc("set_payout_account_for", {
    p_user_id: userId,
    p_beneficiary_name: formData.get("beneficiary_name")?.toString() ?? "",
    p_pan: formData.get("pan")?.toString() ?? "",
    p_account_number: formData.get("account_number")?.toString() ?? "",
    p_ifsc: formData.get("ifsc")?.toString() ?? "",
    p_account_type: formData.get("account_type")?.toString() ?? "",
    p_verified: formData.get("verified") === "on",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

const KINDS = new Set(["PAN_CARD", "AADHAAR", "BANK_PROOF", "PHOTO", "OTHER"]);
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;

/** Upload one or more documents of one kind; each goes to the designer's own folder in the private bucket. */
export async function uploadDocumentsAction(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();
  const userId = formData.get("user_id")?.toString() ?? "";
  const kind = formData.get("kind")?.toString() ?? "";
  if (!KINDS.has(kind)) throw new Refusal("Choose what the document is.");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Refusal("Choose a file to upload.");
  for (const f of files) {
    if (!TYPES.has(f.type)) throw new Refusal(`${f.name}: upload a JPG, PNG, WebP or PDF.`);
    if (f.size > MAX_BYTES) throw new Refusal(`${f.name}: larger than 10 MB.`);
  }

  const storage = createAdminSupabaseClient().storage.from(DESIGNER_DOCUMENTS_BUCKET);
  for (const f of files) {
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "document";
    const key = `designers/${userId}/${generateId()}-${safe}`;
    const up = await storage.upload(key, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false });
    if (up.error) throw new Error(`${f.name}: ${up.error.message}`);
    const { error } = await supabase.rpc("add_designer_document", {
      p_user_id: userId,
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
  revalidatePath("/", "layout");
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { data: key, error } = await supabase.rpc("remove_designer_document", { p_id: formData.get("document_id")?.toString() ?? "" });
  refuseOn(error);
  if (typeof key === "string") await createAdminSupabaseClient().storage.from(DESIGNER_DOCUMENTS_BUCKET).remove([key]);
  revalidatePath("/", "layout");
}

/** Place the designer in a pod (its pod lead then sees and assigns them), or take them out. */
export async function setDesignerPodAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const userId = formData.get("user_id")?.toString() ?? "";
  const podId = formData.get("pod_id")?.toString() ?? "";
  const { error } = podId
    ? await supabase.rpc("set_pod_member", { p_pod_id: podId, p_user_id: userId, p_member_role: "DESIGNER" })
    : await supabase.rpc("remove_pod_member", { p_user_id: userId });
  refuseOn(error);
  revalidatePath("/", "layout");
}

export interface FullBank {
  beneficiary_name: string;
  pan: string;
  account_number: string;
  ifsc: string;
  account_type: string;
  status: string;
}

/** The full bank details for "Show in full": one audited read per press (payout_account_full, 0061). */
export async function revealBankAction(userId: string): Promise<FullBank | { error: string }> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("payout_account_full", { p_user_id: userId }).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "No bank details on file." };
  return data as FullBank;
}

/**
 * A designer's own pay rate in rupees a minute, or empty / "standard" to go
 * back to the standard rate (0065). Reaches jobs assigned after it.
 */
export async function setDesignerRateAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const userId = formData.get("user_id")?.toString() ?? "";
  const raw = formData.get("standard") ? "" : (formData.get("rupees_per_minute")?.toString() ?? "").trim();
  let paise: number | null = null;
  if (raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Refusal("Enter the rate in rupees a minute, for example 8 or 9.50.");
    paise = Math.round(n * 100);
  }
  const { error } = await supabase.rpc("set_designer_rate", { p_user_id: userId, p_paise_per_minute: paise });
  refuseOn(error);
  revalidatePath("/", "layout");
}
