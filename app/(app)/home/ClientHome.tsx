import { ArrowRight, CircleCheck, FilePen, PackageOpen, Plus } from "lucide-react";
import Link from "next/link";

import { clientNextStep, clientTab, formatRelative } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import type { ClientOrder } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { viewerZone } from "@/lib/time/zone";

import { InboxRow } from "../messages/InboxRow";
import type { Conversation } from "../messages/MessagesView";

/**
 * C1 — the client's home (order hub, Phase 10b). What needs them first (one
 * card per order with its one button; the first is the primary), the draft
 * they left as one row, then their conversations (the same row as Messages),
 * then recent orders. Every number comes from their own orders.
 */
const CARD = "rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]";

export async function ClientHome({
  name,
  orders,
  creditCents,
  conversations,
  draft,
}: {
  name: string | null;
  orders: ClientOrder[];
  creditCents: number;
  conversations: Conversation[];
  draft: { id: string; name: string; progress: string } | null;
}) {
  const tz = await viewerZone();
  const needs = orders.filter((o) => clientTab(o.status) === "needs" && o.status !== "DRAFT");
  // Recent orders: what is not already above.
  const recent = orders.filter((o) => o.status !== "DRAFT" && !needs.includes(o)).slice(0, 5);
  const inProgress = orders.filter((o) => clientTab(o.status) === "progress" || clientTab(o.status) === "reopened");
  const approved = orders.filter((o) => clientTab(o.status) === "completed");
  const year = new Date().getFullYear();
  const spent = orders
    .filter((o) => o.paid_at && new Date(o.paid_at).getFullYear() === year)
    .reduce((s, o) => s + (o.price_total ?? 0), 0);
  // Unread first, then newest; three at most.
  const inbox = conversations
    .filter((c) => c.last_body)
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0))
    .slice(0, 3);

  const summary: [string, string, string][] = [
    [String(inProgress.length), inProgress.length === 1 ? "order in progress" : "orders in progress", "/orders"],
    [String(approved.length), approved.length === 1 ? "approved design" : "approved designs", "/orders?tab=completed"],
    [formatMoney(spent, "USD"), `spent in ${year}`, "/wallet/invoices"],
  ];

  return (
    <Page>
      <PageHeader
        title="Welcome back"
        description={name ?? undefined}
        actions={
          <Link href="/orders/new" className={buttonVariants({ variant: needs.length > 0 ? "outline" : "default" })}>
            <Plus /> New order
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="needs-title" className="space-y-3">
            <h2 id="needs-title" className="text-[length:var(--fs-5)] leading-[var(--lh-5)]">
              Needs your action
            </h2>
            {needs.length === 0 && !draft ? (
              <p className={`${CARD} flex items-center gap-3 p-[var(--s-4)] text-[length:var(--fs-3)] text-muted-foreground`}>
                <CircleCheck className="h-5 w-5 shrink-0" aria-hidden /> You&apos;re all caught up
              </p>
            ) : (
              <ul className="space-y-3">
                {needs.map((o, i) => {
                  const price = o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : null;
                  const step = clientNextStep(o.id, o.status, { price, service: o.service });
                  return (
                    <li key={o.id} className={`${CARD} flex flex-col gap-4 p-[var(--s-5)] sm:flex-row sm:items-center`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{step.headline}</p>
                        <p className="mt-0.5 truncate text-[length:var(--fs-3)] text-muted-foreground">{o.title}</p>
                      </div>
                      {step.action && (
                        <Link
                          href={step.href}
                          className={buttonVariants({ variant: i === 0 ? "default" : "outline", size: "lg", className: "w-full sm:w-auto" })}
                        >
                          {o.status === "QUOTED" && price ? `Pay ${price}` : step.action}
                        </Link>
                      )}
                    </li>
                  );
                })}
                {draft && (
                  <li>
                    <Link href={`/orders/${draft.id}/brief`} className={`${CARD} flex min-h-[var(--ctl-lg)] items-center gap-3 px-[var(--s-4)] py-[var(--s-3)] hover:bg-subtle`}>
                      <FilePen className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">Finish your brief</span>
                        <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">
                          {draft.name} · {draft.progress}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          {inbox.length > 0 && (
            <section aria-labelledby="inbox-title" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 id="inbox-title" className="text-[length:var(--fs-5)] leading-[var(--lh-5)]">
                  Messages
                </h2>
                <Link href="/messages" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  All <ArrowRight />
                </Link>
              </div>
              <ul className={`${CARD} overflow-hidden`}>
                {inbox.map((c) => (
                  <li key={c.thread_id}>
                    <InboxRow c={c} client at={c.last_at ? formatRelative(c.last_at, tz) : ""} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="recent-title" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="recent-title" className="text-[length:var(--fs-5)] leading-[var(--lh-5)]">
                Recent orders
              </h2>
              {recent.length > 0 && (
                <Link href="/orders" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  All <ArrowRight />
                </Link>
              )}
            </div>
            <div className={`${CARD} overflow-hidden`}>
              {recent.length === 0 ? (
                <EmptyState icon={<PackageOpen />} title="No orders yet" className="py-8" />
              ) : (
                recent.map((o) => (
                  <ListRow
                    key={o.id}
                    href={`/orders/${o.id}`}
                    reference={o.display_ref}
                    title={o.title}
                    trailing={
                      <>
                        {o.sla_status === "running" && o.sla_due_at && <SlaCountdown dueAt={o.sla_due_at} />}
                        <StatusBadge status={o.status} />
                      </>
                    }
                  />
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Your account">
          <section className={`${CARD} p-[var(--s-5)]`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">Wallet</h2>
              <Link href="/wallet" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Activity
              </Link>
            </div>
            <p className="tabular mt-2 text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)] tracking-[-0.02em]">
              {formatMoney(creditCents, "USD")}
            </p>
            <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">Credit for your next order</p>
          </section>
          <ul className={`${CARD} divide-y divide-border overflow-hidden`}>
            {summary.map(([value, label, href]) => (
              <li key={label}>
                <Link href={href} className="flex min-h-[var(--ctl-lg)] items-center justify-between gap-3 px-5 py-3 hover:bg-subtle">
                  <span className="text-[length:var(--fs-3)] text-muted-foreground">{label}</span>
                  <span className="tabular text-[length:var(--fs-4)] font-semibold">{value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Page>
  );
}
