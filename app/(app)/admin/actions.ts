"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { refuseOn } from "@/lib/refusal";

/**
 * Admin moves from the queue, the order page and Access (Phase 5d). Each
 * runs as the caller; the database function is the admin check and the
 * audit entry.
 */

// Put an order in a pod, by its pod lead (assign_order_pod, 0033).
export async function choosePodAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("assign_order_pod", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_pod_lead_id: formData.get("lead_id")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

export async function createPodAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("create_pod", { p_name: formData.get("name")?.toString() ?? "" });
  refuseOn(error);
  revalidatePath("/admin/access/pods");
}

export async function setPodMemberAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_pod_member", {
    p_pod_id: formData.get("pod_id")?.toString() ?? "",
    p_user_id: formData.get("user_id")?.toString() ?? "",
    p_member_role: formData.get("member_role")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/admin/access/pods");
}

export async function removePodMemberAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("remove_pod_member", { p_user_id: formData.get("user_id")?.toString() ?? "" });
  refuseOn(error);
  revalidatePath("/admin/access/pods");
}

export async function setAccountManagerAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_account_manager", {
    p_client_id: formData.get("client_id")?.toString() ?? "",
    p_manager_id: formData.get("manager_id")?.toString() || null,
  });
  refuseOn(error);
  revalidatePath("/admin/clients");
}

// Recompute the public numbers now (Add. A7); also runs weekly by schedule.
export async function computeStatsAction(): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("compute_public_stats");
  refuseOn(error);
  revalidatePath("/admin/clients");
}
