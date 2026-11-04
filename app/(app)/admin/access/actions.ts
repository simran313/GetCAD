"use server";

import { revalidatePath } from "next/cache";

import { identitiesFor } from "@/lib/clerk/identities";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { refuseOn } from "@/lib/refusal";

/**
 * Change someone's role or status.
 *
 * Both run AS THE CALLER, so `app.require_ops()` inside the function is the
 * real check. There is deliberately no role test in this file: a guard in a
 * Server Action protects the action, a guard in the database protects the data,
 * and only one of those is still true when someone calls the RPC directly.
 */

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const userId = formData.get("user_id")?.toString() ?? "";
  const role = formData.get("role")?.toString() ?? "";

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  refuseOn(error);
  // A pod lead without a pod can be given no orders and no designers (owner,
  // 4 Nov 2026): the new lead gets a pod of their own at once.
  if (role === "QC") await ensureLeadPod(supabase, userId);

  revalidatePath("/admin/access");
  revalidatePath("/admin/access/pods");
}

type Supabase = Awaited<ReturnType<typeof createUserSupabaseClient>>;

/**
 * Give a pod lead their own pod ("Masud's pod"), unless they already lead
 * one. Uses the same admin-only functions as the Pods screen (create_pod,
 * set_pod_member), so the database checks the caller is an admin. The name
 * comes from Clerk after the audited identity lookup (0038).
 */
async function ensureLeadPod(supabase: Supabase, userId: string): Promise<void> {
  const { data: pods } = await supabase.rpc("pods_overview");
  if (((pods ?? []) as { lead_id: string | null }[]).some((p) => p.lead_id === userId)) return;

  let name = "New";
  const { error: lookup } = await supabase.rpc("record_identity_lookup", { p_user_ids: [userId], p_purpose: "name a pod lead's pod" });
  if (!lookup) {
    const who = (await identitiesFor([userId])).get(userId);
    name = who?.name?.split(/\s+/)[0] || who?.email?.split("@")[0] || name;
  }
  const taken = new Set(((pods ?? []) as { name: string }[]).map((p) => p.name));
  let podName = `${name}'s pod`.slice(0, 60);
  for (let n = 2; taken.has(podName); n++) podName = `${name}'s pod ${n}`.slice(0, 60);

  const { data: podId, error: createError } = await supabase.rpc("create_pod", { p_name: podName });
  refuseOn(createError);
  const { error: leadError } = await supabase.rpc("set_pod_member", { p_pod_id: podId as string, p_user_id: userId, p_member_role: "POD_LEAD" });
  refuseOn(leadError);
}

/** "Create their pod" on the Pods screen, for a pod lead who leads none yet. */
export async function createLeadPodAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  await ensureLeadPod(supabase, formData.get("user_id")?.toString() ?? "");
  revalidatePath("/admin/access/pods");
  revalidatePath("/", "layout");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const userId = formData.get("user_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_user_status", {
    p_user_id: userId,
    p_status: status,
  });
  refuseOn(error);

  revalidatePath("/admin/access");
}
