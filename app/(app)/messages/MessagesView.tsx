import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../orders/AutoRefresh";
import { c as claim, showClaim } from "@/content/claims";

import { ChatScreen } from "./ChatScreen";
import { InboxRow } from "./InboxRow";
import type { AttachmentRow, MessageRow, OrderRow, ThreadReads, ThreadRow } from "../orders/types";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";
import { formatRelative, type ClientStep } from "@/core";

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
  /** The client's name for the piece (clients only); null otherwise. */
  title: string | null;
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

export async function MessagesView({
  conversations,
  open,
  role,
}: {
  conversations: Conversation[];
  open: OpenConversation | null;
  role: string;
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
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className={cn("self-start overflow-hidden", open && "hidden md:block")}>
          {conversations.length === 0 ? (
            <EmptyState icon={<MessageSquare />} title="No conversations yet" className="py-8" />
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.thread_id}>
                  <InboxRow
                    c={c}
                    client={role === "CLIENT"}
                    at={c.last_at ? formatRelative(c.last_at, tz) : ""}
                    active={open?.orderId === c.order_id}
                    meta={
                      role === "CLIENT" ? undefined : (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {copy.team && (c.kind === "internal" ? "Designer" : "Client")}
                          <StatusBadge status={c.status} />
                        </span>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className={cn("space-y-4", !open && "hidden md:block")}>
          {open ? (
            <>
              <ChatScreen open={open} call={call} />
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
