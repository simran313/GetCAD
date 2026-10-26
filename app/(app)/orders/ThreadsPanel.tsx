import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { THREAD_ACCEPT } from "@/core";

import { postThreadAction } from "./fileActions";
import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "./types";

/**
 * The order's conversations (DECISIONS §11, Phase 4a).
 *
 * Client ↔ team, and team ↔ designer. Each viewer gets only the threads the
 * database lets them read (order_threads, 0036): a client sees the first, a
 * designer the second, the team both. Staff appear as "Team · first name";
 * the designer is "Designer"; nobody's account id leaves the database.
 * Files sent with a message (Phase 4b) are named by the server and download
 * through /api/thread-files, which applies the same thread rule.
 */

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
                      {attachments
                        .filter((a) => a.message_id === m.id)
                        .map((a) => (
                          <a
                            key={a.id}
                            href={`/api/thread-files/${a.id}`}
                            className="mt-1 block font-mono text-[length:var(--fs-2)] text-primary hover:underline"
                          >
                            {a.file_name} · {size(a.size_bytes)}
                          </a>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
              {t.can_post && (
                <form action={postThreadAction} className="mt-3 space-y-2">
                  <input type="hidden" name="order_id" value={orderId} />
                  <input type="hidden" name="thread_id" value={t.id} />
                  <div className="flex items-end gap-2">
                    <Textarea
                      name="body"
                      rows={2}
                      maxLength={5000}
                      placeholder="Write a message…"
                      aria-label={`Message in ${title}`}
                      className="flex-1"
                    />
                    <Button type="submit">Send</Button>
                  </div>
                  <FilePicker
                    name="file"
                    accept={t.kind === "internal" ? THREAD_ACCEPT.internal : THREAD_ACCEPT.client_team}
                    label={`Attach a file in ${title}`}
                    buttonLabel="Attach a file"
                  />
                  <p className={small}>
                    {t.kind === "internal"
                      ? "PNG, JPEG, STEP, STL or 3DM. Names, authors and other details inside the file are removed before it is sent."
                      : "PNG, JPEG, PDF, ZIP, STEP, STL or 3DM, up to 25 MB."}
                  </p>
                </form>
              )}
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
