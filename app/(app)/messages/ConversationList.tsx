"use client";

import { MessageSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IntentLink } from "@/components/ui/intent-link";
import { cn } from "@/lib/utils";

/**
 * The conversation list (Messages): one card per order, so each
 * conversation stands on its own. The order number leads; under it what
 * the piece is and the day it was placed; then the latest message (the team
 * sees the client and designer threads as two lines); then the status. Every
 * order the viewer may read is here from the day it is placed, messages or
 * not: files for approval are sent in these threads.
 *
 * Filters and a search narrow a long list in the browser; everything shown
 * was already decided by the database (my_conversations, 0046).
 */
export interface ConversationItem {
  orderId: string;
  href: string;
  /** Order number (job code for a designer). */
  ref: string;
  /** What the piece is; null for a designer. */
  title: string | null;
  /** "Placed today", "Placed Oct 12"; null for a designer. */
  placed: string | null;
  status: string;
  /** Latest activity, in the viewer's zone ("42m ago"); "" when none. */
  at: string;
  unread: number;
  /** One line per thread: "Client", "Designer" for the team; no label otherwise. */
  lines: { label: string | null; text: string; empty: boolean }[];
  /** The latest message in some thread is not the viewer's. */
  waiting: boolean;
  /** No message in any thread yet. */
  quiet: boolean;
}

type Filter = "all" | "unread" | "waiting" | "quiet";

export function ConversationList({ items, activeId, team }: { items: ConversationItem[]; activeId: string | null; team: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((i) => i.unread > 0).length,
      waiting: items.filter((i) => i.waiting).length,
      quiet: items.filter((i) => i.quiet).length,
    }),
    [items],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "unread" && i.unread === 0) return false;
      if (filter === "waiting" && !i.waiting) return false;
      if (filter === "quiet" && !i.quiet) return false;
      return !q || i.ref.toLowerCase().includes(q) || (i.title ?? "").toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "waiting", label: team ? "Needs reply" : "New replies" },
    { key: "quiet", label: "No messages" },
  ];

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={<MessageSquare />} title="No conversations yet" description="Each order gets its conversation the moment it is placed." className="py-8" />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={team ? "Order number or product" : "Order number or name"}
            className="h-[var(--ctl)] w-full rounded-[var(--r-md)] border border-input bg-background pl-9 pr-3 text-[length:var(--fs-3)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div role="group" aria-label="Show" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-[var(--ctl-sm)] shrink-0 items-center gap-1.5 rounded-[var(--r-full)] border px-3 text-[length:var(--fs-2)] font-medium transition-colors",
                filter === f.key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular font-normal">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[var(--r-lg)] border border-dashed border-border px-4 py-6 text-center text-[length:var(--fs-2)] text-muted-foreground">
          Nothing here. Try another filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((i) => (
            <li key={i.orderId}>
              <ConversationCard item={i} active={i.orderId === activeId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationCard({ item: i, active }: { item: ConversationItem; active: boolean }) {
  return (
    <IntentLink
      href={i.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-[var(--r-lg)] border bg-card px-[var(--s-4)] py-[var(--s-3)] shadow-[var(--e-1)] transition-[border-color,box-shadow] duration-[var(--dur-fast)]",
        active ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-foreground/40 hover:shadow-[var(--e-2)]",
        i.unread > 0 && !active && "border-l-4 border-l-foreground",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="tabular min-w-0 truncate font-mono text-[length:var(--fs-4)] font-semibold tracking-tight">{i.ref}</span>
        <span className={cn("shrink-0 text-[length:var(--fs-1)]", i.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>{i.at}</span>
      </span>

      {(i.title || i.placed) && (
        <span className="mt-0.5 block truncate text-[length:var(--fs-2)] text-muted-foreground">
          {i.title && <span className="font-medium text-foreground">{i.title}</span>}
          {i.title && i.placed && " · "}
          {i.placed}
        </span>
      )}

      <span className="mt-2 block space-y-1 border-t border-border pt-2">
        {i.lines.map((l, n) => (
          <span key={n} className="flex items-center gap-2 text-[length:var(--fs-2)]">
            {l.label && (
              <span className="w-[4.5rem] shrink-0 text-[length:var(--fs-1)] font-medium uppercase tracking-wide text-muted-foreground">{l.label}</span>
            )}
            <span className={cn("min-w-0 truncate", l.empty ? "italic text-muted-foreground" : i.unread > 0 ? "font-medium text-foreground" : "text-foreground/80")}>
              {l.text}
            </span>
          </span>
        ))}
      </span>

      <span className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge status={i.status} />
        {i.unread > 0 && (
          <span className="tabular shrink-0 rounded-[var(--r-full)] bg-foreground px-2 text-[length:var(--fs-1)] leading-5 text-background">
            {i.unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </span>
    </IntentLink>
  );
}
