import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { postThreadMessageAction } from "./actions";
import type { MessageRow, OrderRow, ThreadRow } from "./types";

/**
 * The order's conversations (DECISIONS §11, Phase 4a).
 *
 * Client ↔ team, and team ↔ designer. Each viewer gets only the threads the
 * database lets them read (order_threads, 0036): a client sees the first, a
 * designer the second, the team both. Staff appear as "Team · first name";
 * the designer is "Designer"; nobody's account id leaves the database.
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
  relation,
  threads,
  messages,
}: {
  relation: OrderRow["relation"];
  threads: ThreadRow[];
  messages: MessageRow[];
}) {
  const sorted = [...threads].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <>
      {sorted.map((t) => {
        const rows = messages.filter((m) => m.thread_id === t.id);
        if (t.kind === "legacy" && rows.length === 0) return null;
        const { title, aside } = titleFor(t.kind, relation);
        return (
          <Card as="section" key={t.id}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <span className={small}>{aside}</span>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {rows.length === 0 && (
                  <li className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">No messages yet.</li>
                )}
                {rows.map((m) => (
                  <li key={m.id} className={m.is_mine ? "text-right" : "text-left"}>
                    <div
                      className={`inline-block max-w-[85%] rounded-lg border px-3 py-2 text-left text-[length:var(--fs-3)] leading-[var(--lh-3)] ${
                        m.is_mine ? "border-primary/20 bg-primary/5" : "border-border bg-subtle"
                      }`}
                    >
                      <p className="text-[length:var(--fs-2)] leading-[var(--lh-2)] font-medium text-muted-foreground">
                        {m.is_mine ? "You" : m.sender_alias}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {t.can_post && (
                <form action={postThreadMessageAction} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="thread_id" value={t.id} />
                  <Textarea
                    name="body"
                    required
                    rows={2}
                    maxLength={5000}
                    placeholder="Write a message…"
                    aria-label={`Message in ${title}`}
                    className="flex-1"
                  />
                  <Button type="submit">Send</Button>
                </form>
              )}
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
