import { ArrowRight, CircleCheck, MessageSquare, PackageOpen, Plus } from "lucide-react";
import Link from "next/link";

import { clientNextStep, clientTab } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import type { ClientOrder } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";

/**
 * C1 — the client's home (docs/design). What needs them first, then what is
 * in flight with its clock, then their wallet. Every number comes from their
 * own orders; nothing here is sample data.
 *
 * Redesign: one primary action (the first thing that needs them), large
 * type, full-width buttons on a phone, the totals as quiet links at the side.
 */
export function ClientHome({
  name,
  orders,
  creditCents,
  unreadMessages,
}: {
  name: string | null;
  orders: ClientOrder[];
  creditCents: number;
  unreadMessages: { order_id: string | null; created_at: string }[];
}) {
  const needs = orders.filter((o) => clientTab(o.status) === "needs");
  const inProgress = orders.filter((o) => clientTab(o.status) === "progress" || clientTab(o.status) === "reopened");
  const approved = orders.filter((o) => clientTab(o.status) === "completed");
  const year = new Date().getFullYear();
  const spent = orders
    .filter((o) => o.paid_at && new Date(o.paid_at).getFullYear() === year)
    .reduce((s, o) => s + (o.price_total ?? 0), 0);
  const byId = new Map(orders.map((o) => [o.id, o]));

  const summary: [string, string, string][] = [
    [String(inProgress.length), inProgress.length === 1 ? "order in progress" : "orders in progress", "/orders"],
    [String(approved.length), approved.length === 1 ? "approved design" : "approved designs", "/orders?tab=completed"],
    [formatMoney(spent, "USD"), `spent in ${year}`, "/wallet/invoices"],
  ];
  const waiting = needs.length + Math.min(unreadMessages.length, 3);

  return (
    <Page>
      <PageHeader
        title={name ? `Welcome back` : "Home"}
        description={
          name
            ? `${name} · ${waiting === 0 ? "nothing needs you right now." : waiting === 1 ? "one thing needs you." : `${waiting} things need you.`}`
            : undefined
        }
        actions={
          <Link href="/orders/new" className={buttonVariants({ variant: waiting > 0 ? "secondary" : "default" })}>
            <Plus /> New order
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="needs-title" className="space-y-3">
            <h2 id="needs-title" className="text-[length:var(--fs-5)] leading-[var(--lh-5)]">
              Needs you
            </h2>
            {waiting === 0 ? (
              <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
                <EmptyState
                  icon={<CircleCheck />}
                  title="You're all caught up"
                  description="Nothing is waiting on you. We'll tell you the moment something is."
                  className="py-8"
                />
              </div>
            ) : (
              <ul className="space-y-3">
                {needs.map((o, i) => {
                  const step = clientNextStep(o.id, o.status);
                  const price = o.status === "QUOTED" && o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : null;
                  return (
                    <li key={o.id} className="flex flex-col gap-4 rounded-[var(--r-lg)] border border-border bg-card p-5 shadow-[var(--e-1)] sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{step.headline}</p>
                        <p className="mt-0.5 text-[length:var(--fs-3)] text-muted-foreground">
                          {o.title}
                          {price ? ` · ${price}` : ""}
                        </p>
                        <p className="tabular mt-1 font-mono text-[length:var(--fs-2)] text-muted-foreground">{o.display_ref ?? "Draft"}</p>
                      </div>
                      <Link
                        href={step.href}
                        className={buttonVariants({ variant: i === 0 ? "default" : "secondary", size: "lg", className: "w-full sm:w-auto" })}
                      >
                        {price ? `Pay ${price}` : step.action}
                      </Link>
                    </li>
                  );
                })}
                {unreadMessages.slice(0, 3).map((m, i) => {
                  const o = m.order_id ? byId.get(m.order_id) : undefined;
                  return (
                    <li key={`m${i}`} className="flex flex-col gap-4 rounded-[var(--r-lg)] border border-border bg-card p-5 shadow-[var(--e-1)] sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <MessageSquare className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">New message from your team</p>
                          {o && <p className="mt-0.5 truncate text-[length:var(--fs-3)] text-muted-foreground">{o.title}</p>}
                        </div>
                      </div>
                      <Link
                        href={m.order_id ? `/messages/${m.order_id}` : "/messages"}
                        className={buttonVariants({ variant: needs.length === 0 && i === 0 ? "default" : "secondary", size: "lg", className: "w-full sm:w-auto" })}
                      >
                        Read it
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="progress-title" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="progress-title" className="text-[length:var(--fs-5)] leading-[var(--lh-5)]">
                In progress
              </h2>
              {inProgress.length > 0 && (
                <Link href="/orders" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  All orders <ArrowRight />
                </Link>
              )}
            </div>
            <div className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
              {inProgress.length === 0 ? (
                <EmptyState
                  icon={<PackageOpen />}
                  title="No orders in progress"
                  description="Send a sketch or a photo and we take it from there."
                  className="py-8"
                />
              ) : (
                inProgress.map((o) => (
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
          <section className="rounded-[var(--r-lg)] border border-border bg-card p-5 shadow-[var(--e-1)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">Wallet</h2>
              <Link href="/wallet" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Activity
              </Link>
            </div>
            <p className="tabular mt-2 text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)] tracking-[-0.02em]">
              {formatMoney(creditCents, "USD")}
            </p>
            <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">Credit to use on your next order</p>
          </section>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
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
