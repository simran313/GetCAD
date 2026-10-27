import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../orders/AutoRefresh";
import { InboxRow } from "./InboxRow";
import { ThreadsPanel } from "../orders/ThreadsPanel";
import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "../orders/types";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";
import { formatRelative } from "@/core";

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
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  stamp: string | null;
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
  const tz = await viewerZone();
  const copy = describe(role);
  return (
    <Page>
      <PageHeader eyebrow={copy.eyebrow} title="Messages" description={copy.description} />
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
              <div className="flex items-center justify-between gap-2">
                <Link href="/messages" className="text-[length:var(--fs-2)] underline underline-offset-4 md:hidden">
                  ← All conversations
                </Link>
                <Link
                  href={role === "DESIGNER" ? `/work/${open.orderId}` : `/orders/${open.orderId}`}
                  className="text-[length:var(--fs-2)] underline underline-offset-4"
                >
                  {role === "DESIGNER" ? "Open the job" : "Open the order"}
                </Link>
              </div>
              <ThreadsPanel
                orderId={open.orderId}
                relation={open.relation}
                threads={open.threads}
                messages={open.messages}
                attachments={open.attachments}
              />
              <AutoRefresh orderId={open.orderId} stamp={open.stamp} />
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
