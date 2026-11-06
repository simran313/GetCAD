"use server";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { refuseOn } from "@/lib/refusal";

/** Mark one of the caller's notifications read, or all of them (null). The database scopes it to the caller. */
export async function markInboxReadAction(id: string | null): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_id: id });
  refuseOn(error);
}
