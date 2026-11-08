"use server";

import { revalidatePath } from "next/cache";

import { refuseOn } from "@/lib/refusal";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The pod lead's workflow moves (Phase 13c). The database decides: the pod,
 * the designer's agreement, a reason once work has started (reassign_job,
 * escalate_job, 0058).
 */
export async function reassignJobAction(orderId: string, designerId: string, reason: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("reassign_job", { p_order_id: orderId, p_designer_id: designerId, p_reason: reason.trim() || null });
  refuseOn(error);
  revalidatePath("/pod/board");
  revalidatePath("/pod/performance");
}

/** Take a job back from its designer (0066): waiting for a designer again; the designer and the admins are told. */
export async function withdrawJobAction(orderId: string, reason: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("withdraw_job", { p_order_id: orderId, p_reason: reason.trim() || null });
  refuseOn(error);
  revalidatePath("/pod/board");
  revalidatePath("/pod/performance");
  revalidatePath(`/orders/${orderId}`);
}

export async function escalateJobAction(orderId: string, reason: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("escalate_job", { p_order_id: orderId, p_reason: reason.trim() });
  refuseOn(error);
  revalidatePath("/pod/board");
  revalidatePath("/pod/performance");
}

export async function resolveEscalationAction(id: string, note: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("resolve_escalation", { p_id: id, p_note: note.trim() || null });
  refuseOn(error);
  revalidatePath("/pod/performance");
}
