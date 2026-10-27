"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, MoreVertical, PanelRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { LiveCallButton } from "@/components/ui/live-call-button";
import { cn } from "@/lib/utils";

import { ChatThread } from "../orders/chat/ChatThread";
import type { ThreadRow } from "../orders/types";
import { markConversationReadAction } from "./actions";
import type { OpenConversation } from "./MessagesView";

/**
 * One order's conversation as a chat screen (Phase 10c). On a phone it takes
 * the whole screen (the shell hides its bars on this route) and follows the
 * keyboard: its height is the visual viewport's, so the composer stays just
 * above the keys. At desk width it sits beside the list, with the order's
 * details in a panel that folds away.
 *
 * Header: back, the order, its status, the live call (clients) and an
 * overflow to the order, its brief and files. The team reads two threads
 * (client and designer) as two tabs; the database decides which exist.
 */
const KIND_LABEL: Record<ThreadRow["kind"], string> = { client_team: "Client", internal: "Designer", legacy: "Old" };

export function ChatScreen({
  open,
  call,
}: {
  open: OpenConversation;
  call: { phone: string | null; hours: string };
}) {
  const shell = useRef<HTMLDivElement>(null);
  const client = open.relation === "CLIENT";
  const designer = open.relation === "DESIGNER";
  const [kind, setKind] = useState<ThreadRow["kind"]>(open.threads[0]?.kind ?? "client_team");
  const [details, setDetails] = useState(false);
  // Kept from the first render: reading the chat clears the notifications.
  const [unreadSince] = useState(open.unreadSince);
  const thread = open.threads.find((t) => t.kind === kind) ?? open.threads[0];
  const orderHref = designer ? `/work/${open.orderId}` : `/orders/${open.orderId}`;

  useEffect(() => {
    if (open.unreadSince) void markConversationReadAction(open.orderId).catch(() => {});
  }, [open.orderId, open.unreadSince]);

  // Phone: size to the visual viewport, so the keyboard never covers the composer.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = shell.current;
    if (!vv || !el) return;
    const phone = window.matchMedia("(max-width: 767px)");
    const fit = () => {
      el.style.height = phone.matches ? `${vv.height}px` : "";
      if (phone.matches) window.scrollTo(0, 0);
    };
    fit();
    vv.addEventListener("resize", fit);
    phone.addEventListener("change", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      phone.removeEventListener("change", fit);
    };
  }, []);

  const menuItem = "flex h-[var(--ctl-sm)] w-full items-center rounded-[var(--r-xs)] px-2.5 text-[length:var(--fs-2)] outline-none data-[highlighted]:bg-accent";
  return (
    <div className="flex gap-4">
      <section
        ref={shell}
        aria-label={`Conversation: ${open.title}`}
        className="fixed inset-x-0 top-0 z-40 flex h-[100dvh] min-w-0 flex-1 flex-col bg-background md:static md:z-auto md:h-[calc(100dvh-180px)] md:min-h-[480px] md:overflow-hidden md:rounded-[var(--r-lg)] md:border md:border-border md:shadow-[var(--e-1)]"
      >
        <header className="flex items-center gap-2 border-b border-border px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-[var(--s-4)]">
          <Link
            href="/messages"
            aria-label="All conversations"
            className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] hover:bg-accent md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link href={orderHref} className="min-w-0 flex-1">
            <span className="block truncate font-semibold leading-tight">{open.title}</span>
            <span className="flex items-center gap-2 text-[length:var(--fs-1)] text-muted-foreground">
              <span className="truncate">{open.ref}</span>
              <StatusBadge status={open.status} />
            </span>
          </Link>
          {client && <LiveCallButton phone={call.phone} hours={call.hours} compact />}
          {!designer && (
            <button
              type="button"
              onClick={() => setDetails((d) => !d)}
              aria-pressed={details}
              aria-label="Order details"
              className="hidden h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent md:inline-flex"
            >
              <PanelRight className="h-5 w-5" />
            </button>
          )}
          <Menu.Root>
            <Menu.Trigger
              aria-label="More"
              className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent"
            >
              <MoreVertical className="h-5 w-5" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[180px] rounded-[var(--r-md)] border border-border bg-background p-1 shadow-[var(--e-2)]">
                <Menu.Item asChild>
                  <Link href={orderHref} className={menuItem}>
                    {designer ? "Open the job" : "Open the order"}
                  </Link>
                </Menu.Item>
                {!designer && (
                  <Menu.Item asChild>
                    <Link href={`/orders/${open.orderId}/brief`} className={menuItem}>
                      Brief
                    </Link>
                  </Menu.Item>
                )}
                {client && (
                  <Menu.Item asChild>
                    <Link href="/files" className={menuItem}>
                      Files
                    </Link>
                  </Menu.Item>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>

        {open.threads.length > 1 && (
          <div role="tablist" aria-label="Conversation" className="flex gap-1 border-b border-border px-[var(--s-3)] py-1.5">
            {open.threads.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.kind === kind}
                onClick={() => setKind(t.kind)}
                className={cn(
                  "min-h-[var(--ctl-sm)] rounded-[var(--r-full)] px-3 text-[length:var(--fs-2)] font-medium",
                  t.kind === kind ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {KIND_LABEL[t.kind]}
              </button>
            ))}
          </div>
        )}

        {client && open.next?.action && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle px-[var(--s-4)] py-2">
            <span className="min-w-0 truncate text-[length:var(--fs-2)] font-medium">{open.next.headline}</span>
            <Link href={open.next.href} className={buttonVariants({ size: "sm" })}>
              {open.next.action}
            </Link>
          </div>
        )}

        {thread ? (
          <div className="min-h-0 flex-1">
            <ChatThread
              key={thread.id}
              orderId={open.orderId}
              thread={thread}
              messages={open.messages.filter((m) => m.thread_id === thread.id)}
              attachments={open.attachments.filter((a) => a.thread_id === thread.id)}
              events={thread.kind === "client_team" ? open.events : []}
              client={client}
              unreadSince={unreadSince}
              fill
            />
          </div>
        ) : (
          <p className="p-8 text-center text-[length:var(--fs-3)] text-muted-foreground">No conversation on this order.</p>
        )}
      </section>

      {details && !designer && (
        <aside aria-label="Order details" className="hidden w-72 shrink-0 space-y-4 self-start rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)] md:block">
          <div>
            <p className="font-semibold">{open.title}</p>
            <p className="mt-1 flex items-center gap-2 text-[length:var(--fs-2)] text-muted-foreground">
              {open.ref} <StatusBadge status={open.status} />
            </p>
          </div>
          {open.next && (
            <p className="text-[length:var(--fs-3)]">
              <span className="font-medium">{open.next.headline}</span>
              {open.next.detail && <span className="block text-[length:var(--fs-2)] text-muted-foreground">{open.next.detail}</span>}
            </p>
          )}
          {open.brief.length > 0 && (
            <dl className="divide-y divide-border text-[length:var(--fs-2)]">
              {open.brief.map((r) => (
                <div key={r.label} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="min-w-0 truncate text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <Link href={orderHref} className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}>
            Open the order
          </Link>
        </aside>
      )}
    </div>
  );
}
