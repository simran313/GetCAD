"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Check, CheckCheck, Clock3, Download, FileBox, ImageIcon, Paperclip, RotateCw, SendHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { dayKey, formatDayLabel, formatTime, MAX_UPLOAD_BYTES, THREAD_ACCEPT } from "@/core";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useTimeZone } from "@/components/time-zone";
import { cn } from "@/lib/utils";

import { postThreadAction } from "../fileActions";
import { markThreadReadAction, sendChatMessageAction } from "./actions";
import type { AttachmentRow, MessageRow, ThreadRow } from "../types";

/**
 * One order conversation as a chat (Phase 10c): bubbles (yours on the right),
 * day separators, local times, a "New" line at the first unread message,
 * order events as quiet centred chips, pictures as thumbnails that open full
 * screen, CAD and other files as cards. The composer grows with the text,
 * attaches from the camera, the gallery or files (checked on choice), and
 * shows a sent message at once, with Retry if it fails.
 *
 * Like a messenger (Phase 14): your message is in the conversation the moment
 * you press Send, with a clock while it is on its way, one tick once it is
 * saved and two once the other side has read it (thread_read_state: a time,
 * never who). A text is saved under the browser's own name for it
 * (send_chat_message), so Retry after a lost answer never posts it twice.
 * Files go through postThreadAction (post_thread_file); who may read or post
 * is still decided by the database. To a client the other side is always
 * "Your team".
 */
export interface ChatEvent {
  id: string;
  label: string;
  at: string;
}

interface Pending {
  /** The browser's name for this send (client_ref): the saved message carries it back. */
  id: string;
  body: string;
  fileName: string | null;
  at: string;
  state: "sending" | "sent" | "failed";
  form: FormData;
}

/** A name for a send, unique enough to tell repeats of it apart from new messages. */
const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const tick = "inline-flex items-center gap-0.5 text-[length:var(--fs-1)] text-muted-foreground";

/** The status of your own message, beside its time: on its way, saved, read. */
function Ticks({ state }: { state: "sending" | "sent" | "read" }) {
  if (state === "sending") return <Clock3 className="h-3.5 w-3.5" role="img" aria-label="Sending" />;
  if (state === "read") return <CheckCheck className="h-4 w-4 text-[color:var(--tone-info-fg)]" role="img" aria-label="Read" />;
  return <Check className="h-4 w-4" role="img" aria-label="Sent" />;
}

type Item =
  | { kind: "msg"; at: string; m: MessageRow }
  | { kind: "event"; at: string; e: ChatEvent }
  | { kind: "pending"; at: string; p: Pending };

const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function ChatThread({
  orderId,
  thread,
  messages,
  attachments,
  events = [],
  client,
  unreadSince = null,
  othersReadAt = null,
  fill = false,
  label = "Message",
}: {
  orderId: string;
  thread: ThreadRow;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  events?: ChatEvent[];
  /** The viewer is the order's client: everyone else is "Your team". */
  client: boolean;
  /** The oldest unread message notification on this order; the "New" line goes before the first message after it. */
  unreadSince?: string | null;
  /** How far the other side has read this thread (thread_read_state); your messages up to it get two ticks. */
  othersReadAt?: string | null;
  /** Fill the parent's height (the chat screen); otherwise a bounded panel. */
  fill?: boolean;
  label?: string;
}) {
  const tz = useTimeZone();
  const router = useRouter();
  const log = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  // A sent text leaves the list of pending ones once the saved copy has arrived.
  const saved = useMemo(() => new Set(messages.map((m) => m.client_ref).filter(Boolean)), [messages]);
  const readUpTo = othersReadAt ? Date.parse(othersReadAt) : -Infinity;
  const shown = useMemo(() => pending.filter((p) => !saved.has(p.id)), [pending, saved]);
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);

  const items = useMemo<Item[]>(
    () =>
      [
        ...messages.map((m) => ({ kind: "msg" as const, at: m.created_at, m })),
        ...events.map((e) => ({ kind: "event" as const, at: e.at, e })),
        ...shown.map((p) => ({ kind: "pending" as const, at: p.at, p })),
      ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    [messages, events, shown],
  );
  const filesOf = useMemo(() => {
    const map = new Map<string, AttachmentRow[]>();
    for (const a of attachments) map.set(a.message_id, [...(map.get(a.message_id) ?? []), a]);
    return map;
  }, [attachments]);
  const firstUnread = unreadSince ? messages.find((m) => !m.is_mine && m.created_at >= unreadSince)?.id : undefined;

  // Open at the latest message, and follow new ones.
  useLayoutEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  // Read while it is on screen: the other side's newest message is marked
  // read when this chat is visible (and again when it comes back into view).
  const latestOther = useMemo(() => [...messages].reverse().find((m) => !m.is_mine)?.created_at ?? null, [messages]);
  useEffect(() => {
    const el = log.current;
    if (!latestOther || !el) return;
    let inView = false;
    const mark = () => {
      if (inView && document.visibilityState === "visible") void markThreadReadAction(thread.id).catch(() => {});
    };
    const io = new IntersectionObserver(([e]) => {
      inView = !!e?.isIntersecting;
      mark();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", mark);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", mark);
    };
  }, [latestOther, thread.id]);

  const send = async (p: Pending) => {
    setPending((list) => [...list.filter((x) => x.id !== p.id), { ...p, state: "sending" }]);
    try {
      if (p.fileName) {
        await postThreadAction(p.form);
        setPending((list) => list.filter((x) => x.id !== p.id));
        return;
      }
      await sendChatMessageAction(thread.id, p.body, p.id);
      setPending((list) => list.map((x) => (x.id === p.id ? { ...x, state: "sent" } : x)));
      // The saved copy (and anything else new) arrives without holding the bubble up.
      startTransition(() => router.refresh());
    } catch {
      setPending((list) => list.map((x) => (x.id === p.id ? { ...x, state: "failed" } : x)));
      toast("Not sent. Tap Retry.", "danger");
    }
  };

  let lastDay = "";
  let lastSender = "";
  return (
    <div className={cn("flex min-h-0 flex-col", fill ? "h-full" : "max-h-[70vh]")}>
      <div
        ref={log}
        role="log"
        aria-label="Messages"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-[var(--s-4)] py-[var(--s-4)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {items.length === 0 && <p className="py-8 text-center text-[length:var(--fs-3)] text-muted-foreground">No messages yet</p>}
        {items.map((item) => {
          const day = dayKey(item.at, tz);
          const sep =
            day !== lastDay ? (
              <p key={`d-${day}`} className="py-2 text-center text-[length:var(--fs-1)] font-medium text-muted-foreground" suppressHydrationWarning>
                {formatDayLabel(item.at, tz)}
              </p>
            ) : null;
          lastDay = day;

          if (item.kind === "event") {
            lastSender = "";
            return (
              <div key={`e-${item.e.id}`}>
                {sep}
                <p className="mx-auto w-fit max-w-[90%] rounded-[var(--r-full)] bg-muted px-3 py-1 text-center text-[length:var(--fs-1)] text-muted-foreground">
                  {item.e.label} · {formatTime(item.at, tz)}
                </p>
              </div>
            );
          }

          if (item.kind === "pending") {
            lastSender = "me";
            const p = item.p;
            return (
              <div key={p.id} className="flex flex-col items-end">
                {sep}
                <div className="max-w-[80%] rounded-[var(--r-lg)] rounded-br-[var(--r-xs)] bg-primary px-3 py-2 text-[length:var(--fs-3)] text-primary-foreground">
                  {p.body && <p className="whitespace-pre-wrap break-words">{p.body}</p>}
                  {p.fileName && <p className="truncate text-[length:var(--fs-2)]">{p.fileName}</p>}
                </div>
                {p.state === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void send(p)}
                    className="mt-0.5 inline-flex min-h-[var(--ctl-sm)] items-center gap-1 text-[length:var(--fs-1)] font-medium text-[color:var(--tone-danger-fg)]"
                  >
                    <RotateCw className="h-3 w-3" aria-hidden /> Not sent · Tap to retry
                  </button>
                ) : (
                  <span className={cn(tick, "mt-0.5 px-1")}>
                    <time dateTime={p.at}>{formatTime(p.at, tz)}</time>
                    <Ticks state={p.state} />
                  </span>
                )}
              </div>
            );
          }

          const m = item.m;
          const who = m.is_mine ? "me" : client ? "Your team" : m.sender_alias;
          const showName = !m.is_mine && who !== lastSender;
          lastSender = who;
          const files = filesOf.get(m.id) ?? [];
          // A file sent without a note carries the stock "Sent a file." (0045); the card says it.
          const body = files.length > 0 && m.body === "Sent a file." ? "" : m.body;
          return (
            <div key={m.id}>
              {sep}
              {m.id === firstUnread && (
                <p className="flex items-center gap-2 py-1 text-[length:var(--fs-1)] font-medium text-[color:var(--tone-danger-fg)]">
                  <span className="h-px flex-1 bg-[color:var(--tone-danger-fg)]/40" aria-hidden /> New
                  <span className="h-px flex-1 bg-[color:var(--tone-danger-fg)]/40" aria-hidden />
                </p>
              )}
              <div className={cn("flex flex-col", m.is_mine ? "items-end" : "items-start")}>
                {showName && <span className="mb-0.5 px-1 text-[length:var(--fs-1)] font-medium text-muted-foreground">{who}</span>}
                <div
                  className={cn(
                    "max-w-[80%] space-y-1.5 rounded-[var(--r-lg)] px-3 py-2 text-[length:var(--fs-3)]",
                    m.is_mine ? "rounded-br-[var(--r-xs)] bg-primary text-primary-foreground" : "rounded-bl-[var(--r-xs)] border border-border bg-card",
                  )}
                >
                  {files.map((f) =>
                    f.content_type.startsWith("image/") ? (
                      <button key={f.id} type="button" onClick={() => setViewing(f)} className="block overflow-hidden rounded-[var(--r-md)]" aria-label={`Open ${f.file_name}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- served through the thread-file gate */}
                        <img src={`/api/thread-files/${f.id}`} alt="" loading="lazy" className="max-h-56 w-auto max-w-full object-cover" />
                      </button>
                    ) : (
                      <a
                        key={f.id}
                        href={`/api/thread-files/${f.id}`}
                        className={cn(
                          "flex min-h-[var(--ctl)] items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5",
                          m.is_mine ? "bg-primary-foreground/15" : "bg-subtle",
                        )}
                      >
                        <FileBox className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{f.file_name}</span>
                          <span className="block text-[length:var(--fs-1)] opacity-80">
                            {extOf(f.file_name).toUpperCase()} · {size(f.size_bytes)}
                          </span>
                        </span>
                        <Download className="h-4 w-4 shrink-0" aria-hidden />
                      </a>
                    ),
                  )}
                  {body && <p className="whitespace-pre-wrap break-words">{body}</p>}
                </div>
                <span className={cn(tick, "mt-0.5 px-1")}>
                  <time dateTime={m.created_at}>{formatTime(m.created_at, tz)}</time>
                  {m.is_mine && <Ticks state={readUpTo >= Date.parse(m.created_at) ? "read" : "sent"} />}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {thread.can_post && (
        <Composer
          orderId={orderId}
          thread={thread}
          label={label}
          onSend={(p) => void send(p)}
        />
      )}

      <Dialog.Root open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
          <Dialog.Content className="fixed inset-0 z-[60] flex flex-col outline-none">
            <div className="flex items-center justify-between gap-3 p-3 text-white">
              <Dialog.Title className="min-w-0 truncate text-[length:var(--fs-3)]">{viewing?.file_name}</Dialog.Title>
              <Dialog.Description className="sr-only">Picture sent in the conversation</Dialog.Description>
              <div className="flex items-center gap-1">
                {viewing && (
                  <a href={`/api/thread-files/${viewing.id}`} aria-label="Download" className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] hover:bg-white/10">
                    <Download className="h-5 w-5" />
                  </a>
                )}
                <Dialog.Close aria-label="Close" className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] hover:bg-white/10">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
            </div>
            {viewing && (
              // eslint-disable-next-line @next/next/no-img-element -- served through the thread-file gate
              <img src={`/api/thread-files/${viewing.id}`} alt={viewing.file_name} className="min-h-0 flex-1 object-contain p-3" />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Composer({
  orderId,
  thread,
  label,
  onSend,
}: {
  orderId: string;
  thread: ThreadRow;
  label: string;
  onSend: (p: Pending) => void;
}) {
  const text = useRef<HTMLTextAreaElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attaching, setAttaching] = useState(false);
  const accept = thread.kind === "internal" ? THREAD_ACCEPT.internal : THREAD_ACCEPT.client_team;
  const allowed = useMemo(() => new Set(accept.split(",").map((s) => s.replace(".", ""))), [accept]);

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  const choose = (f: File | undefined) => {
    setAttaching(false);
    if (!f) return;
    const ext = extOf(f.name) || (f.type === "image/jpeg" ? "jpg" : f.type === "image/png" ? "png" : "");
    if (!allowed.has(ext)) {
      toast(`${f.name}: send ${accept.replace(/\./g, "").toUpperCase().split(",").join(", ")}`, "danger");
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast(`${f.name}: larger than 25 MB`, "danger");
      return;
    }
    setFile(f);
    text.current?.focus();
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed && !file) return;
    const form = new FormData();
    form.set("order_id", orderId);
    form.set("thread_id", thread.id);
    form.set("body", trimmed);
    if (file) form.set("file", file);
    onSend({ id: newRef(), body: trimmed, fileName: file?.name ?? null, at: new Date().toISOString(), state: "sending", form });
    setBody("");
    setFile(null);
  };

  const input = (ref: React.RefObject<HTMLInputElement | null>, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      ref={ref}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        choose(f);
      }}
      {...props}
    />
  );

  const option = "flex min-h-12 w-full items-center gap-3 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-4)] hover:bg-accent [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-muted-foreground";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-t border-border bg-background px-[var(--s-3)] pb-[max(var(--s-3),env(safe-area-inset-bottom))] pt-[var(--s-3)]"
    >
      {file && (
        <p className="mb-2 flex items-center gap-2 rounded-[var(--r-md)] bg-subtle px-3 py-1.5 text-[length:var(--fs-2)]">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove the file" className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setAttaching(true)}
          aria-label="Attach"
          className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <textarea
          ref={text}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends with a keyboard; on a phone it is a new line.
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={5000}
          placeholder="Message"
          aria-label={label}
          className="min-h-[var(--ctl-icon)] flex-1 resize-none rounded-[var(--r-lg)] border border-input bg-background px-3 py-2 text-[length:var(--fs-4)] leading-[var(--lh-4)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!body.trim() && !file}
          className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </div>

      {input(camera, { accept: "image/*", capture: "environment" })}
      {input(gallery, { accept: ".png,.jpg,.jpeg" })}
      {input(picker, { accept })}

      <Sheet open={attaching} onOpenChange={setAttaching}>
        <SheetContent title="Attach" side="bottom">
          <div className="-mx-2">
            <button type="button" className={option} onClick={() => camera.current?.click()}>
              <Camera /> Camera
            </button>
            <button type="button" className={option} onClick={() => gallery.current?.click()}>
              <ImageIcon /> Photos
            </button>
            <button type="button" className={option} onClick={() => picker.current?.click()}>
              <FileBox /> File
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </form>
  );
}
