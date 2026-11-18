"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";

export type ReportResult = { ok: true } | { ok: false; error: string };

/** The client says they paid outside the checkout (0072); finance is told and marks it paid. */
export async function reportPaymentAction(fd: FormData): Promise<ReportResult> {
  const orderId = fd.get("order_id")?.toString() ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("report_offline_payment", {
    p_order_id: orderId,
    p_method: fd.get("method")?.toString() ?? "OTHER",
    p_reference: fd.get("reference")?.toString() ?? null,
    p_note: fd.get("note")?.toString() ?? null,
  });
  if (error) {
    const m = error.message.trim();
    return { ok: false, error: `${m.charAt(0).toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? "" : "."}` };
  }
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
