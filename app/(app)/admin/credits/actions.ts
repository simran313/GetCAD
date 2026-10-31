"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";
import { flushEmailsAfterResponse } from "@/lib/email/dispatch";

/**
 * Decide a late-order credit (DECISIONS §6, owner answer Q4). Runs as the
 * caller: decide_sla_credit() is the admin check, the once-only rule and the
 * audit entry.
 */
export async function decideCreditAction(formData: FormData): Promise<void> {
  const decision = formData.get("decision")?.toString() ?? "";
  const dollars = formData.get("amount_usd")?.toString().trim() ?? "";
  let amountCents: number | null = null;
  if (decision === "partial") {
    const n = Number(dollars);
    if (!Number.isFinite(n) || n <= 0) throw new Refusal("a partial credit needs an amount in dollars");
    amountCents = Math.round(n * 100);
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("decide_sla_credit", {
    p_credit_id: formData.get("credit_id")?.toString() ?? "",
    p_decision: decision,
    p_amount_cents: amountCents,
    p_reason: formData.get("reason")?.toString().trim() || null,
  });
  refuseOn(error);
  revalidatePath("/admin/credits");
  flushEmailsAfterResponse();
}
