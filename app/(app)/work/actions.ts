"use server";

import { revalidatePath } from "next/cache";

import { refuseOn } from "@/lib/refusal";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Pause or resume a job in progress (Phase 13b). The database checks it is
 * the assigned designer and records the moment (pause_job / resume_job, 0057).
 */
export async function pauseJobAction(orderId: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("pause_job", { p_order_id: orderId });
  refuseOn(error);
  revalidatePath("/work");
  revalidatePath(`/work/${orderId}`);
}

export async function resumeJobAction(orderId: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("resume_job", { p_order_id: orderId });
  refuseOn(error);
  revalidatePath("/work");
  revalidatePath(`/work/${orderId}`);
}
