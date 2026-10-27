import { Card, CardHeader, CardTitle } from "@/components/ui/card";

import { ChatThread } from "./chat/ChatThread";
import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "./types";

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

export function ThreadsPanel({
  orderId,
  relation,
  threads,
  messages,
  attachments,
}: {
  orderId: string;
  relation: OrderRow["relation"];
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
}) {
  const sorted = [...threads].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <>
      {sorted.map((t) => {
        const rows = messages.filter((m) => m.thread_id === t.id);
        if (t.kind === "legacy" && rows.length === 0) return null;
        const { title, aside } = titleFor(t.kind, relation);
        return (
          <Card as="section" key={t.id} className="overflow-hidden">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <span className={small}>{aside}</span>
            </CardHeader>
            <ChatThread
              orderId={orderId}
              thread={t}
              messages={rows}
              attachments={attachments.filter((a) => a.thread_id === t.id)}
              client={relation === "CLIENT"}
              label={`Message in ${title}`}
            />
          </Card>
        );
      })}
    </>
  );
}
