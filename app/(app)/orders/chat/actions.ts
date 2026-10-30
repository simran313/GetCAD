"use server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The chat's own send (Phase 14). It does not ask for the page to be
 * rebuilt: the answer is the message's id and time, so the bubble gets its
 * tick at once, and the conversation reads itself again in the background
 * (or when the live signal arrives). Who may post is decided by the
 * database, as always. Reads go to /api/threads/[id]/read.
 */

/** Save a text message once under the browser's name for it (send_chat_message, 0053). */
export async function sendChatMessageAction(threadId: string, body: string, ref: string): Promise<{ id: string; at: string }> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("send_chat_message", { p_thread_id: threadId, p_body: body, p_client_ref: ref });
  // Deployed before 0053 is applied: post the plain way (no safe repeat) rather than fail.
  if (error?.code === "PGRST202") {
    const old = await supabase.rpc("post_thread_message", { p_thread_id: threadId, p_body: body });
    if (old.error) throw new Error(old.error.message);
    return { id: (old.data as { message_id: string }).message_id, at: new Date().toISOString() };
  }
  if (error) throw new Error(error.message);
  const r = data as { message_id: string; created_at: string };
  return { id: r.message_id, at: r.created_at };
}
