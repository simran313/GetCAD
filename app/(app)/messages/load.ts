import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "../orders/types";
import type { Conversation, OpenConversation } from "./MessagesView";

export async function loadConversations(supabase: SupabaseClient): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

/** One order's conversation, as the viewer may read it; null if not visible. */
export async function loadOpen(supabase: SupabaseClient, orderId: string): Promise<OpenConversation | null> {
  const { data: order } = await supabase
    .rpc("visible_orders", { p_order_id: orderId })
    .select("id, relation")
    .maybeSingle();
  if (!order) return null;
  const [threads, messages, files, stamp] = await Promise.all([
    supabase.rpc("order_threads", { p_order_id: orderId }),
    supabase.rpc("order_messages", { p_order_id: orderId }),
    supabase.rpc("thread_attachments", { p_order_id: orderId }),
    supabase.rpc("order_activity_stamp", { p_order_id: orderId }),
  ]);
  return {
    orderId,
    relation: (order as { relation: OrderRow["relation"] }).relation,
    // The frozen pre-v1 thread stays on the order page for admins only.
    threads: ((threads.data ?? []) as ThreadRow[]).filter((t) => t.kind !== "legacy"),
    messages: (messages.data ?? []) as MessageRow[],
    attachments: (files.data ?? []) as AttachmentRow[],
    stamp: stamp.data == null ? null : String(stamp.data),
  };
}
