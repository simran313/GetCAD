import { MessageSquare } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../orders/AutoRefresh";
import { c as claim, showClaim } from "@/content/claims";

import { ChatScreen } from "./ChatScreen";
import { ConversationList, type ConversationItem } from "./ConversationList";
import type { AttachmentRow, MessageRow, OrderRow, ThreadReads, ThreadRow } from "../orders/types";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";
import { formatDayLabel, formatRelative, type ClientStep } from "@/core";

/**
 * C7 / C7b — Messages (docs/design). Every conversation the viewer may read,
 * newest first (my_conversations, 0046), and the open one beside it at desk
 * width. On a phone the list and the conversation are separate screens.
 */
export interface Conversation {
  order_id: string;
  display_ref: string | null;
  status: string;
  thread_id: string;
  kind: string;
  last_body: string | null;
  last_alias: string | null;
  last_mine: boolean | null;
  last_at: string | null;
  messages: number;
  /** What the piece is: the client's name for it (clients), the product (team); null for a designer. */
  title: string | null;
  /** When the order was placed; null for a designer. */
  placed_at: string | null;
  /** Unread message notifications on the order. */
  unread: number;
}

export interface OpenConversation {
  orderId: string;
  relation: OrderRow["relation"];
  ref: string | null;
  status: string;
  title: string;
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  stamp: string | null;
  /** How far the other side has read each thread (the ticks). */
  reads: ThreadReads;
  /** Oldest unread message notification on the order (the "New" line). */
  unreadSince: string | null;
  /** Order events shown inline (client and team only). */
  events: { id: string; label: string; at: string }[];
  /** Brief rows for the details panel (client and team only). */
  brief: { label: string; value: string }[];
  /** The client's one next step, for the banner and the panel. */
  next: ClientStep | null;
}

// What the list is, for whoever is reading it (C7, D5; Phase 5c for the team).
function describe(role: string): { eyebrow?: string; description?: string; team: boolean } {
  if (role === "DESIGNER") {
    return {
      eyebrow: "Your pod lead and admin",
      description: "Pod lead and admin only. Client questions go through your pod lead.",
      team: false,
    };
  }
  if (role === "CLIENT") return { description: undefined, team: false };
  return { description: "Each order has a client conversation and a designer conversation.", team: true };
}

const KIND_LABEL: Record<string, string> = { client_team: "Client", internal: "Designer" };

function placedLabel(iso: string, tz: string): string {
  const day = formatDayLabel(iso, tz);
  return `Placed ${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day}`;
}

/** One card per order (its threads as lines), in the order of the newest activity. */
function toItems(conversations: Conversation[], role: string, tz: string): ConversationItem[] {
  const client = role === "CLIENT";
  const team = role !== "CLIENT" && role !== "DESIGNER";
  const byOrder = new Map<string, Conversation[]>();
  for (const c of conversations) byOrder.set(c.order_id, [...(byOrder.get(c.order_id) ?? []), c]);
  return [...byOrder.values()].map((cs) => {
    cs.sort((a, b) => (a.kind === "client_team" ? -1 : b.kind === "client_team" ? 1 : 0));
    const first = cs[0]!;
    const latest = cs.reduce<Conversation | null>((l, c) => (c.last_at && (!l?.last_at || c.last_at > l.last_at) ? c : l), null);
    const who = (c: Conversation) => (c.last_mine ? "You" : client ? "Your team" : (c.last_alias ?? "Team"));
    return {
      orderId: first.order_id,
      // The team opens the thread that moved last.
      href: `/messages/${first.order_id}${team && latest?.kind === "internal" ? "?t=designer" : ""}`,
      ref: first.display_ref ?? "Order",
      title: first.title,
      placed: first.placed_at ? placedLabel(first.placed_at, tz) : null,
      status: first.status,
      at: latest?.last_at ? formatRelative(latest.last_at, tz) : "",
      unread: first.unread,
      lines: cs.map((c) => ({
        label: team ? (KIND_LABEL[c.kind] ?? null) : null,
        text: c.last_body ? `${who(c)}: ${c.last_body}` : "No messages yet",
        empty: !c.last_body,
      })),
      waiting: cs.some((c) => !!c.last_body && !c.last_mine),
      quiet: cs.every((c) => !c.last_body),
    };
  });
}

export async function MessagesView({
  conversations,
  open,
  role,
  startOn,
}: {
  conversations: Conversation[];
  open: OpenConversation | null;
  role: string;
  startOn?: ThreadRow["kind"];
}) {
  const call = { phone: claim("LIVE_CALL_PHONE"), hours: showClaim("LIVE_CALL_HOURS") ? claim("LIVE_CALL_HOURS") : "US business hours" };
  const tz = await viewerZone();
  const copy = describe(role);
  return (
    <Page>
      {/* On a phone an open conversation is its own full screen. */}
      <div className={cn(open && "hidden md:block")}>
        <PageHeader eyebrow={copy.eyebrow} title="Messages" description={copy.description} />
      </div>
      <div className="grid gap-6 md:grid-cols-[340px_1fr]">
        <div className={cn("min-w-0 self-start md:sticky md:top-4 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto md:pr-1", open && "hidden md:block")}>
          <ConversationList items={toItems(conversations, role, tz)} activeId={open?.orderId ?? null} team={copy.team} />
        </div>

        <div className={cn("space-y-4", !open && "hidden md:block")}>
          {open ? (
            <>
              <ChatScreen key={open.orderId} open={open} call={call} startOn={startOn} />
              <AutoRefresh orderId={open.orderId} stamp={open.stamp} seconds={2} threads={open.threads.map((t) => t.id)} />
            </>
          ) : (
            <Card className="hidden md:block">
              <EmptyState icon={<MessageSquare />} title="Choose a conversation" description="Pick an order on the left to read and reply." />
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
