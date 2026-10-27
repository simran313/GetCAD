"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";

import { markOrderMessagesRead } from "./load";

/** Opening a conversation reads it: its message notifications are marked read. */
export async function markConversationReadAction(orderId: string): Promise<void> {
  const supabase = await createUserSupabaseClient();
  await markOrderMessagesRead(supabase, orderId);
  revalidatePath("/", "layout");
}
