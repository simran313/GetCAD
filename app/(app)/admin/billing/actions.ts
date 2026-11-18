"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";

export type BillingResult = { ok: true } | { ok: false; error: string };

const KEYS = [
  "legal_name", "cin", "address", "gstin", "lut_arn", "lut_fy", "sac_code", "invoice_prefix",
  "bank_transfer", "wise_details", "paypal_link", "invoice_note",
] as const;

/** Save the invoice details and the other ways to pay (0072; admins). */
export async function saveBillingAction(fd: FormData): Promise<BillingResult> {
  const fields: Record<string, string> = {};
  for (const k of KEYS) {
    const v = fd.get(k);
    if (v !== null) fields[k] = v.toString();
  }
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("billing_settings_save", { p: fields });
  if (error) {
    const m = error.message.trim();
    return { ok: false, error: `${m.charAt(0).toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? "" : "."}` };
  }
  revalidatePath("/admin/billing");
  revalidatePath("/admin/billing/details");
  return { ok: true };
}
