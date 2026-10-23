"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Payout batches (DECISIONS §5, Phase 3b). Each runs as the caller: the
 * database functions are the finance/admin check, the state rules and the
 * audit entry.
 */
export async function exportPayoutsAction(): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("export_payouts");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payouts");
}

export async function markBatchPaidAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_payout_batch_paid", {
    p_batch: formData.get("batch")?.toString() ?? "",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payouts");
}
