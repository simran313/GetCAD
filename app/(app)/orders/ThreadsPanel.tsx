"use client";

import { useState } from "react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ChatThread } from "./chat/ChatThread";
import type { AttachmentRow, ChatBrief, MessageRow, OrderRow, ThreadReads, ThreadRow } from "./types";

/**
 * The order's conversations (DECISIONS §11, Phase 4a).
 *
 * Client ↔ team, and team ↔ designer. Each viewer gets only the threads the
 * database lets them read (order_threads, 0036): a client sees the first, a
 * designer the second, the team both. Staff appear as "Team · first name";
 * the designer is "Designer"; nobody's account id leaves the database.
 * Files sent with a message (Phase 4b) are named by the server and download
 * through /api/thread-files, which applies the same thread rule. Each thread
 * is the same chat as the Messages screen (Phase 10c), in a bounded panel.
 *
 * A client component, so the chat is only ever imported from the browser
 * side (here and on the Messages screen): rendered straight from the server
 * pages as well, the production server lost track of it (Phase 14 e2e).
 */

const small = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

function titleFor(kind: ThreadRow["kind"], relation: OrderRow["relation"]): { title: string; aside: string } {
  if (kind === "legacy") return { title: "Old messages", aside: "Before v1 · read only · admins only" };
  if (kind === "client_team") {
    return relation === "CLIENT"
      ? { title: "Messages", aside: "With the team" }
      : { title: "Client ↔ Team", aside: "The designer never sees this" };
  }
  return relation === "DESIGNER"
    ? { title: "Messages", aside: "With the team · the client never sees this" }
    : { title: "Team ↔ Designer", aside: "The client never sees this" };
}

const ORDER: ThreadRow["kind"][] = ["client_team", "internal", "legacy"];

/** The team's tab names: who is on the other side. */
const TAB: Record<ThreadRow["kind"], string> = { client_team: "Client", internal: "Designer", legacy: "Old messages" };

export function ThreadsPanel({
  orderId,
  relation,
  threads,
  messages,
  attachments,
  reads = {},
  brief = null,
}: {
  orderId: string;
  relation: OrderRow["relation"];
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  /** How far the other side has read each thread (the ticks). */
  reads?: ThreadReads;
  /** The brief, as the first message of each conversation (owner, 7 Nov 2026). */
  brief?: ChatBrief | null;
}) {
  const sorted = [...threads]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .filter((t) => t.kind !== "legacy" || messages.some((m) => m.thread_id === t.id));
  // The team reads two conversations: one card with a tab for each, opened
  // on the one that moved last (owner, 7 Nov 2026: not two chat boxes).
  const latest = [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const [open, setOpen] = useState<string | null>(null);
  const tabbed = relation !== "CLIENT" && relation !== "DESIGNER" && sorted.length > 1;

  const thread = (t: ThreadRow) => {
    const rows = messages.filter((m) => m.thread_id === t.id);
    const { title } = titleFor(t.kind, relation);
    return (
      <ChatThread
        key={t.id}
        orderId={orderId}
        thread={t}
        messages={rows}
        attachments={attachments.filter((a) => a.thread_id === t.id)}
        client={relation === "CLIENT"}
        othersReadAt={reads[t.id] ?? null}
        label={`Message in ${title}`}
        brief={t.kind === "legacy" ? null : brief}
      />
    );
  };

  if (tabbed) {
    const current = sorted.find((t) => t.id === open) ?? sorted.find((t) => t.id === latest?.thread_id) ?? sorted[0]!;
    const { aside } = titleFor(current.kind, relation);
    return (
      <Card as="section" className="overflow-hidden">
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
          <span className={small}>{aside}</span>
        </CardHeader>
        <div role="tablist" aria-label="Conversations" className="flex gap-1 border-b border-border px-[var(--s-4)]">
          {sorted.map((t) => {
            const count = messages.filter((m) => m.thread_id === t.id).length;
            const on = t.id === current.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setOpen(t.id)}
                className={cn(
                  "-mb-px min-h-[var(--ctl-sm)] border-b-2 px-3 text-[length:var(--fs-3)] font-medium",
                  on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB[t.kind]}
                {count > 0 && <span className="ml-1.5 tabular text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </div>
        {thread(current)}
      </Card>
    );
  }

  return (
    <>
      {sorted.map((t) => {
        const { title, aside } = titleFor(t.kind, relation);
        return (
          <Card as="section" key={t.id} className="overflow-hidden">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <span className={small}>{aside}</span>
            </CardHeader>
            {thread(t)}
          </Card>
        );
      })}
    </>
  );
}
