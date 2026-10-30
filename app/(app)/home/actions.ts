"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { refuseOn } from "@/lib/refusal";

// Mark the caller's notifications read (all unread). The DB scopes to the caller.
export async function markNotificationsReadAction(): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_id: null });
  refuseOn(error);
  revalidatePath("/home");
}
