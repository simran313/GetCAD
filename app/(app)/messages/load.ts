import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { briefRows, buildTimeline, chatMilestones, clientNextStep, productWord, type TimelineRawRow } from "@/core";
import { formatMoney } from "@/lib/money";

import { toThreadReads, type AttachmentRow, type MessageRow, type OrderRow, type ThreadRow } from "../orders/types";
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
 * The viewer's conversations, newest first (my_conversations, 0046): every
 * thread of every order they may read, with or without messages (each order
 * gets its client and designer threads when it is made, 0036). Each comes
 * with its unread count (unread MESSAGE notifications on the order), what
 * the piece is (the client's own name for it, to the client; the product, to
 * the team) and the day the order was placed. A designer gets neither: they
 * know a job by its code (DECISIONS §2).
 */
export async function loadConversations(supabase: SupabaseClient): Promise<Conversation[]> {
  const [{ data, error }, unread] = await Promise.all([supabase.rpc("my_conversations"), loadUnreadByOrder(supabase)]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<Conversation, "title" | "unread" | "placed_at">[];
  const titles = new Map<string, string>();
  const placed = new Map<string, string>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.order_id))];
    const [specs, orders] = await Promise.all([
      supabase.from("order_specs").select("order_id, reference_name, product").in("order_id", ids),
      supabase.rpc("visible_orders").select("id, relation, product_type, created_at").in("id", ids),
    ]);
    // The client's own name for the piece goes to the client only; the team
    // sees the product; a designer neither (nor the date).
    const named = new Set<string>();
    for (const o of (orders.data ?? []) as { id: string; relation: string; product_type: string | null; created_at: string }[]) {
      if (o.relation === "DESIGNER") continue;
      if (o.relation === "CLIENT") named.add(o.id);
      placed.set(o.id, o.created_at);
      if (o.product_type) titles.set(o.id, productWord(o.product_type));
    }
    for (const s of (specs.data ?? []) as { order_id: string; reference_name: string | null; product: string | null }[]) {
      const name = s.reference_name || (s.product ? productWord(s.product) : null);
      if (name && named.has(s.order_id)) titles.set(s.order_id, name);
    }
  }
  return rows.map((r) => ({
    ...r,
    title: titles.get(r.order_id) ?? null,
    placed_at: placed.get(r.order_id) ?? null,
    unread: unread.get(r.order_id) ?? 0,
  }));
}

/** One order's conversation, as the viewer may read it; null if not visible. */
export async function loadOpen(supabase: SupabaseClient, orderId: string): Promise<OpenConversation | null> {
  const { data: order } = await supabase
    .rpc("visible_orders", { p_order_id: orderId })
    .select("id, relation, display_ref, status, product_type, service, price_total, currency, tier, complex_deadline_hours")
    .maybeSingle();
  if (!order) return null;
  const o = order as {
    relation: OrderRow["relation"];
    display_ref: string | null;
    status: string;
    product_type: string;
    service: string | null;
    price_total: number | null;
    currency: string | null;
    tier: string | null;
    complex_deadline_hours: number | null;
  };
  // The client and the team see the order's own name, its events and brief
  // beside the chat; a designer keeps the job code and the messages only.
  const full = o.relation !== "DESIGNER";
  const [threads, messages, files, stamp, unread, timeline, spec, accents, reads] = await Promise.all([
    supabase.rpc("order_threads", { p_order_id: orderId }),
    supabase.rpc("order_messages", { p_order_id: orderId }),
    supabase.rpc("thread_attachments", { p_order_id: orderId }),
    supabase.rpc("order_activity_stamp", { p_order_id: orderId }),
    supabase
      .from("notifications")
      .select("created_at")
      .eq("kind", "MESSAGE")
      .eq("order_id", orderId)
      .is("read_at", null)
      .order("created_at", { ascending: true })
      .limit(1),
    full ? supabase.rpc("order_timeline", { p_order_id: orderId }) : Promise.resolve({ data: null }),
    full ? supabase.from("order_specs").select("*").eq("order_id", orderId).maybeSingle() : Promise.resolve({ data: null }),
    full ? supabase.from("order_spec_accents").select("quantity").eq("order_id", orderId) : Promise.resolve({ data: null }),
    supabase.rpc("thread_read_state", { p_order_id: orderId }),
  ]);
  const s = (spec.data ?? null) as Record<string, unknown> | null;
  const service = o.service ?? "cad";
  return {
    orderId,
    relation: o.relation,
    ref: o.display_ref,
    status: o.status,
    title: (full && ((s?.reference_name as string) || (s?.product ? productWord(s.product as string) : null))) || productWord(o.product_type),
    // The frozen pre-v1 thread stays on the order page for admins only.
    threads: ((threads.data ?? []) as ThreadRow[]).filter((t) => t.kind !== "legacy"),
    // To a client the team is one voice (DECISIONS §11): no staff alias reaches their browser.
    messages: ((messages.data ?? []) as MessageRow[]).map((m) =>
      o.relation === "CLIENT" && !m.is_mine ? { ...m, sender_alias: "Your team" } : m,
    ),
    attachments: (files.data ?? []) as AttachmentRow[],
    stamp: stamp.data == null ? null : String(stamp.data),
    reads: toThreadReads(reads.data),
    unreadSince: ((unread.data ?? []) as { created_at: string }[])[0]?.created_at ?? null,
    events: chatMilestones(buildTimeline((timeline.data ?? []) as TimelineRawRow[])).map((e) => ({ id: e.id, label: e.label, at: e.createdAt })),
    brief: s
      ? briefRows(s, { service, photos: 0, accents: (accents.data ?? []) as { quantity: number }[] })
          .filter((r) => r.key !== "photos" && r.value)
          .map((r) => ({ label: r.label, value: r.value! }))
      : [],
    next:
      o.relation === "CLIENT"
        ? clientNextStep(orderId, o.status, {
            price: o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : null,
            tier: o.tier,
            complexHours: o.complex_deadline_hours,
            service,
          })
        : null,
  };
}

/** Mark this order's unread message notifications read (the caller's own; the database scopes them). */
export async function markOrderMessagesRead(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("kind", "MESSAGE")
    .eq("order_id", orderId)
    .is("read_at", null);
  for (const n of (data ?? []) as { id: string }[]) await supabase.rpc("mark_notifications_read", { p_id: n.id });
}
