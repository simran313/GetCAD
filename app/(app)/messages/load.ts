import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { productWord } from "@/core";

import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "../orders/types";
import type { Conversation, OpenConversation } from "./MessagesView";

/** Unread message notifications per order, for badges. */
export async function loadUnreadByOrder(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from("notifications").select("order_id").eq("kind", "MESSAGE").is("read_at", null).limit(500);
  const unread = new Map<string, number>();
  for (const n of (data ?? []) as { order_id: string | null }[]) {
    if (n.order_id) unread.set(n.order_id, (unread.get(n.order_id) ?? 0) + 1);
  }
  return unread;
}

/**
 * The viewer's conversations, newest first (my_conversations, 0046), each
 * with its unread count (unread MESSAGE notifications on the order). A client
 * also gets the name they gave each piece; other roles keep the reference.
 */
export async function loadConversations(supabase: SupabaseClient, role = "CLIENT"): Promise<Conversation[]> {
  const [{ data, error }, unread] = await Promise.all([supabase.rpc("my_conversations"), loadUnreadByOrder(supabase)]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<Conversation, "title" | "unread">[];
  const titles = new Map<string, string>();
  if (role === "CLIENT" && rows.length > 0) {
    const { data: specs } = await supabase
      .from("order_specs")
      .select("order_id, reference_name, product")
      .in("order_id", [...new Set(rows.map((r) => r.order_id))]);
    for (const s of (specs ?? []) as { order_id: string; reference_name: string | null; product: string | null }[]) {
      const name = s.reference_name || (s.product ? productWord(s.product) : null);
      if (name) titles.set(s.order_id, name);
    }
  }
  return rows.map((r) => ({ ...r, title: titles.get(r.order_id) ?? null, unread: unread.get(r.order_id) ?? 0 }));
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
