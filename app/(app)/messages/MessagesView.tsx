import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../orders/AutoRefresh";
import { ThreadsPanel } from "../orders/ThreadsPanel";
import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "../orders/types";
import { Page } from "@/components/ui/page";

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
}

export interface OpenConversation {
  orderId: string;
  relation: OrderRow["relation"];
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  stamp: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// What the list is, for whoever is reading it (C7, D5; Phase 5c for the team).
function describe(role: string): { eyebrow?: string; description: string; team: boolean } {
  if (role === "DESIGNER") {
    return {
      eyebrow: "Your pod lead and admin",
      description: "Pod lead and admin only. Client questions go through your pod lead.",
      team: false,
    };
  }
  if (role === "CLIENT") return { description: "Your conversations with the team, one per order.", team: false };
  return { description: "Each order has a client conversation and a designer conversation.", team: true };
}

export function MessagesView({
  conversations,
  open,
  role,
}: {
  conversations: Conversation[];
  open: OpenConversation | null;
  role: string;
}) {
  const copy = describe(role);
  return (
    <Page>
      <PageHeader eyebrow={copy.eyebrow} title="Messages" description={copy.description} />
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className={cn("self-start overflow-hidden", open && "hidden md:block")}>
          {conversations.length === 0 ? (
            <p className="p-[var(--s-5)] text-[length:var(--fs-3)] text-muted-foreground">
              No conversations yet. Each order has one; start it from the order.
            </p>
          ) : (
            <ul>
              {conversations.map((c) => {
                const on = open?.orderId === c.order_id;
                return (
                  <li key={c.thread_id}>
                    <Link
                      href={`/messages/${c.order_id}`}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "block border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0",
                        on ? "bg-muted" : "hover:bg-subtle",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
                          {c.display_ref}
                          {copy.team && ` · ${c.kind === "internal" ? "Designer" : "Client"}`}
                        </span>
                        <span className="text-[length:var(--fs-1)] text-muted-foreground">{ago(c.last_at)}</span>
                      </span>
                      <span className="mt-1 block truncate text-[length:var(--fs-2)]">
                        {c.last_body ? `${c.last_mine ? "You" : c.last_alias}: ${c.last_body}` : "No messages yet"}
                      </span>
                      <span className="mt-1.5 block">
                        <StatusBadge status={c.status} />
                      </span>
                    </Link>
                  </li>
                );
              })}
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
            <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">
              Choose a conversation.
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
