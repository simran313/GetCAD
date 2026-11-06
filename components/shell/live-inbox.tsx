"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxItem } from "@/lib/inbox";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { markInboxReadAction } from "./inbox-actions";

/**
 * Live (revamp R3): the app notices when something happens to you.
 *
 * Every 20 s while the app is open and on screen (and at once when it comes
 * back into view), the newest notifications are read. Anything new since
 * the last look shows as a toast with "Open", the page under it re-reads
 * its data, and the bell and the Messages tab carry the unread counts.
 * The first load is silent: what was already there is not news.
 */
const POLL_MS = 20_000;

export function hrefFor(item: Pick<InboxItem, "kind" | "order_id">, designer: boolean): string {
  if (!item.order_id) return "/home";
  if (item.kind === "MESSAGE") return `/messages/${item.order_id}`;
  return designer ? `/work/${item.order_id}` : `/orders/${item.order_id}`;
}

export function useLiveInbox(designer: boolean) {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { unread: number; items: InboxItem[] };
    if (seen.current) {
      const fresh = data.items.filter((i) => !i.read_at && !seen.current!.has(i.id));
      for (const i of fresh.slice(0, 3).reverse()) {
        toast(i.summary, "live", { href: hrefFor(i, designer), action: "Open" });
      }
      if (fresh.length > 0) router.refresh();
    }
    seen.current = new Set(data.items.map((i) => i.id));
    setItems(data.items);
    setUnread(data.unread);
  }, [designer, router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onShow = () => void load();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [load]);

  const markRead = useCallback(
    async (id: string | null) => {
      setItems((list) => list.map((i) => (id === null || i.id === id ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i)));
      setUnread((n) => (id === null ? 0 : Math.max(0, n - 1)));
      await markInboxReadAction(id).catch(() => void load());
    },
    [load],
  );

  const messagesUnread = items.filter((i) => i.kind === "MESSAGE" && !i.read_at).length;
  return { items, unread, messagesUnread, markRead };
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** The bell: the unread count on it, the list in a sheet. */
export function InboxBell({
  inbox,
  designer,
  className,
}: {
  inbox: ReturnType<typeof useLiveInbox>;
  designer: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { items, unread, markRead } = inbox;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "relative inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="tabular absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--brand-accent)] px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </SheetTrigger>
      <SheetContent title="Notifications" description={unread > 0 ? `${unread} unread` : "You're up to date"}>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markRead(null)}
            className="mb-3 inline-flex min-h-[var(--ctl-sm)] items-center gap-2 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-2)] font-medium hover:bg-accent"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
          </button>
        )}
        {items.length === 0 ? (
          <p className="text-[length:var(--fs-3)] text-muted-foreground">
            Nothing yet. When an order moves or someone writes to you, it shows here.
          </p>
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!i.read_at) void markRead(i.id);
                    setOpen(false);
                    router.push(hrefFor(i, designer));
                  }}
                  className="flex w-full items-start gap-3 rounded-[var(--r-sm)] px-2 py-3 text-left hover:bg-accent"
                >
                  <span
                    aria-hidden
                    className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", i.read_at ? "bg-transparent" : "bg-[color:var(--brand-accent)]")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[length:var(--fs-3)] leading-[var(--lh-3)]", !i.read_at && "font-medium")}>{i.summary}</span>
                    <span className="block text-[length:var(--fs-2)] text-muted-foreground">
                      {ago(i.created_at)}
                      {!i.read_at && <span className="sr-only"> · unread</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
