"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { buildTimeline, type TimelineRawRow, type TimelineStep } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { createRealtimeClient } from "@/lib/supabase/browser";
import { TONE_MARK, TONE_SURFACE } from "@/lib/tone";

import { postMessageAction, raiseDisputeAction, transitionAction } from "./actions";
import { uploadFileAction } from "./fileActions";
import { PayButton } from "./PayButton";
import type { MessageRow } from "./types";

const QC_TONE = {
  passed: "success",
  revision_requested: "attention",
} as const;

/** Files a client attaches have exactly one legitimate kind, so they are never asked. */
const PARTICIPANT_UPLOAD_KINDS: Record<string, string> = {
  RENDER: "Render",
  WEIGHT_CHART: "Gold weight chart",
  DIAMOND_DETAILS: "Diamond details",
  STL: "STL",
  RHINO_3DM: "Rhino 3DM",
  SUMMARY_SHEET: "Order summary sheet",
  OTHER: "File",
};

type FeedItem =
  | { key: string; at: number; kind: "event"; step: TimelineStep }
  | { key: string; at: number; kind: "message"; message: MessageRow };

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

/**
 * The order screen as a single conversation.
 *
 * Timeline events and double-blind messages are one chronological stream: a
 * status change and a reply read as the same thread, because to the client they
 * ARE the same thing — everything that happened to their order, in order. Events
 * render as centred system notes; messages as chat bubbles, keyed off the
 * OPAQUE sender id only (never a name), so the double-blind boundary is intact.
 *
 * Role functions live in the composer's slash ("+") menu, surfaced only when the
 * viewer can actually take them at the current status. Each one is the same
 * server action the panels use — the DB remains the single enforcement point.
 *
 * Liveness is Supabase Realtime: a new message anywhere in the thread triggers a
 * server re-fetch (never a direct render of the socket payload), so RLS decides
 * what each socket sees exactly as it decides what each page sees.
 */
export function OrderConversation({
  orderId,
  currency,
  priceTotal,
  userId,
  isParticipant,
  isOrderClient,
  messages,
  timelineRows,
  timelineError,
  transitionTargets,
  canFund,
  canRaiseDispute,
}: {
  orderId: string;
  currency: string;
  priceTotal: number;
  userId: string;
  isParticipant: boolean;
  isOrderClient: boolean;
  messages: MessageRow[];
  timelineRows: TimelineRawRow[];
  timelineError?: string | null;
  transitionTargets: string[];
  canFund: boolean;
  canRaiseDispute: boolean;
}) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const feed = useMemo<FeedItem[]>(() => {
    const events: FeedItem[] = buildTimeline(timelineRows).map((step) => ({
      key: `e-${step.id}`,
      at: new Date(step.createdAt).getTime(),
      kind: "event",
      step,
    }));
    const msgs: FeedItem[] = messages.map((message) => ({
      key: `m-${message.id}`,
      at: new Date(message.created_at).getTime(),
      kind: "message",
      message,
    }));
    return [...events, ...msgs].sort((a, b) => a.at - b.at);
  }, [timelineRows, messages]);

  // Keep the newest entry in view whenever the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  // Realtime liveness: new messages elsewhere in the thread refresh the server
  // render. Refreshing on tab focus covers any dropped socket.
  useEffect(() => {
    const client = createRealtimeClient(() => getTokenRef.current());
    const channel = client
      .channel(`order-messages-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` },
        () => router.refresh(),
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      client.removeChannel(channel);
    };
  }, [orderId, router]);

  function send() {
    const text = body.trim();
    if (!text || pending) return;
    const fd = new FormData();
    fd.set("order_id", orderId);
    fd.set("body", text);
    startTransition(async () => {
      await postMessageAction(fd);
      setBody("");
      router.refresh();
    });
  }

  const actionOptions: { id: string; label: string }[] = [
    ...(canFund ? [{ id: "pay", label: "Pay the quote" }] : []),
    ...transitionTargets.map((to) => ({ id: `to:${to}`, label: `Move to ${to.replace(/_/g, " ").toLowerCase()}` })),
    ...(canRaiseDispute ? [{ id: "dispute", label: "Raise a dispute" }] : []),
    ...(isParticipant ? [{ id: "upload", label: "Attach a file" }] : []),
  ];

  function chooseAction(id: string) {
    setActiveAction(id);
    setMenuOpen(false);
  }

  function closeAction() {
    setActiveAction(null);
  }

  return (
    <div className="flex flex-col">
      {/* The thread */}
      <div
        ref={scrollRef}
        className="max-h-[58vh] overflow-y-auto pr-1"
        role="log"
        aria-label="Order conversation"
        aria-live="polite"
      >
        {timelineError && (
          <p className="mb-3 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-destructive">
            Couldn&apos;t load history: {timelineError}
          </p>
        )}

        {feed.length === 0 ? (
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            Nothing here yet. This is where your order&apos;s history and messages appear.
          </p>
        ) : (
          <ol className="space-y-3">
            {feed.map((item) =>
              item.kind === "event" ? (
                <EventRow key={item.key} step={item.step} currency={currency} />
              ) : (
                <MessageBubble key={item.key} message={item.message} userId={userId} />
              ),
            )}
          </ol>
        )}
      </div>

      {/* Composer + slash menu */}
      {isParticipant && (
        <div className="relative mt-4 border-t border-border pt-4">
          {activeAction && (
            <div className="mb-3 rounded-[var(--r-md)] border border-border bg-subtle p-3">
              <ActionPanel
                action={activeAction}
                orderId={orderId}
                priceTotal={priceTotal}
                currency={currency}
                isOrderClient={isOrderClient}
                onDone={closeAction}
              />
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Order actions"
                disabled={actionOptions.length === 0}
                onClick={() => setMenuOpen((v) => !v)}
                className="h-[var(--ctl)] w-[var(--ctl)] shrink-0 p-0 text-[length:var(--fs-5)] leading-none"
              >
                +
              </Button>
              {menuOpen && actionOptions.length > 0 && (
                <div
                  role="menu"
                  className="absolute bottom-[calc(100%+0.5rem)] left-0 z-10 min-w-52 overflow-hidden rounded-[var(--r-md)] border border-border bg-card shadow-[var(--e-2)]"
                >
                  {actionOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      onClick={() => chooseAction(opt.id)}
                      className="block w-full px-3 py-2 text-left text-[length:var(--fs-3)] capitalize leading-[var(--lh-3)] transition-colors hover:bg-accent"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={5000}
              placeholder="Write a message…"
              aria-label="Message body"
              className="flex-1"
            />
            <Button type="button" onClick={send} disabled={pending || body.trim().length === 0}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
          <p className="mt-2 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
            Identities are hidden — you and the other party see each other by role only.
          </p>
        </div>
      )}
    </div>
  );
}

function EventRow({ step, currency }: { step: TimelineStep; currency: string }) {
  if (step.isQcMilestone && step.qcOutcome) {
    return (
      <li className="flex justify-center">
        <div
          className={`max-w-[90%] rounded-[var(--r-md)] border px-3 py-2 text-center ${TONE_SURFACE[QC_TONE[step.qcOutcome]]}`}
        >
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-semibold">
            Independent QC review — {step.qcOutcome === "passed" ? "passed" : "revision requested"}
          </p>
          <p className="mt-0.5 text-[length:var(--fs-2)] leading-[var(--lh-2)] opacity-80">
            Reviewed by role: QC · identity protected · {formatWhen(step.createdAt)}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className="flex justify-center">
      <div className="flex max-w-[90%] items-center gap-2 rounded-full border border-border bg-subtle px-3 py-1 text-center">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_MARK.neutral}`} aria-hidden />
        <span className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
          {step.label}
          {step.amount != null && (
            <span className="tabular ml-1 font-mono">{formatMoney(step.amount, currency)}</span>
          )}
          {" · "}
          {step.actorRole}
          {" · "}
          <time className="tabular font-mono">{formatWhen(step.createdAt)}</time>
        </span>
      </div>
    </li>
  );
}

function MessageBubble({ message: m, userId }: { message: MessageRow; userId: string }) {
  const mine = m.sender_id === userId;
  const who = mine ? "You" : m.sender_party === "CLIENT" ? "Client" : "Designer";
  return (
    <li className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] rounded-lg border px-3 py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] ${
          mine ? "border-primary/20 bg-primary/5" : "border-border bg-subtle"
        }`}
      >
        <p className="text-[length:var(--fs-2)] leading-[var(--lh-2)] font-medium text-muted-foreground">
          {who} · <time className="tabular font-mono">{formatWhen(m.created_at)}</time>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>
      </div>
    </li>
  );
}

function ActionPanel({
  action,
  orderId,
  priceTotal,
  currency,
  isOrderClient,
  onDone,
}: {
  action: string;
  orderId: string;
  priceTotal: number;
  currency: string;
  isOrderClient: boolean;
  onDone: () => void;
}) {
  if (action === "pay") {
    return (
      <div className="space-y-2">
        <PanelHeader title="Pay the quote" onDone={onDone} />
        <PayButton orderId={orderId} amount={priceTotal} currency={currency} />
      </div>
    );
  }

  if (action.startsWith("to:")) {
    const to = action.slice(3);
    return (
      <form action={transitionAction} onSubmit={onDone} className="space-y-2">
        <PanelHeader title="Update status" onDone={onDone} />
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="to_status" value={to} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline">
            Confirm <StatusBadge status={to} className="ml-1 border-0 bg-transparent px-0" />
          </Button>
        </div>
      </form>
    );
  }

  if (action === "dispute") {
    return (
      <form action={raiseDisputeAction} onSubmit={onDone} className="space-y-2">
        <PanelHeader title="Raise a dispute" onDone={onDone} />
        <input type="hidden" name="order_id" value={orderId} />
        <Textarea
          name="reason"
          required
          rows={2}
          maxLength={5000}
          placeholder="Describe the problem with this order…"
          aria-label="Dispute reason"
        />
        <Button type="submit" size="sm" variant="outline">
          Submit dispute
        </Button>
      </form>
    );
  }

  if (action === "upload") {
    return (
      <form action={uploadFileAction} onSubmit={onDone} className="space-y-2">
        <PanelHeader title="Attach a file" onDone={onDone} />
        <input type="hidden" name="order_id" value={orderId} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            required
            accept=".png,.jpg,.jpeg,.step,.stp"
            aria-label="Upload a file"
            className="text-[length:var(--fs-3)] leading-[var(--lh-3)]"
          />
          {isOrderClient ? (
            <input type="hidden" name="kind" value="CLIENT_REFERENCE" />
          ) : (
            <Select name="kind" defaultValue="RENDER" aria-label="What this file is" className="w-auto">
              {Object.entries(PARTICIPANT_UPLOAD_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
          <Button type="submit" size="sm" variant="outline">
            Upload
          </Button>
        </div>
        <p className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
          PNG, JPEG or STEP. Identifying metadata is stripped before the file is stored.
        </p>
      </form>
    );
  }

  return null;
}

function PanelHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium">{title}</p>
      <button
        type="button"
        onClick={onDone}
        className="text-[length:var(--fs-2)] leading-[var(--lh-2)] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
