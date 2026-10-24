import Link from "next/link";

import { clientNextStep, clientTab } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Timer } from "@/components/ui/timer";
import type { ClientOrder } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";

/**
 * C1 — the client's home (docs/design). What needs them first, then what is
 * in flight with its clock, then their wallet. Every number comes from their
 * own orders; nothing here is sample data.
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

  const stats: [string, string][] = [
    [String(needs.length), "need you"],
    [String(inProgress.length), "in progress"],
    [String(approved.length), "approved designs"],
    [formatMoney(spent, "USD"), "spent this year"],
  ];

  return (
    <main className="container max-w-5xl space-y-8 py-8">
      <PageHeader
        eyebrow={name ?? "Your workspace"}
        title="Home"
        actions={
          <Link href="/orders/new" className={buttonVariants()}>
            New order
          </Link>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-4">
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col bg-card p-[var(--s-4)]">
            <dt className="order-2 text-[length:var(--fs-2)] text-muted-foreground">{label}</dt>
            <dd className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="needs-title" className="space-y-3">
          <h2 id="needs-title" className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">
            Needs you
          </h2>
          {needs.length === 0 && unreadMessages.length === 0 ? (
            <Card>
              <CardBody className="text-[length:var(--fs-3)] text-muted-foreground">
                Nothing is waiting on you. We&apos;ll tell you the moment something is.
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-3">
              {needs.map((o) => {
                const step = clientNextStep(o.id, o.status);
                return (
                  <li key={o.id}>
                    <Card>
                      <CardBody className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                            {o.display_ref ?? "Draft"}
                          </p>
                          <p className="text-[length:var(--fs-4)] font-medium">{step.headline}</p>
                          <p className="text-[length:var(--fs-2)] text-muted-foreground">
                            {o.title}
                            {o.status === "QUOTED" && o.price_total ? ` · price ${formatMoney(o.price_total, o.currency ?? "USD")}` : ""}
                          </p>
                        </div>
                        <Link href={step.href} className={buttonVariants({ size: "sm" })}>
                          {o.status === "QUOTED" && o.price_total
                            ? `Pay ${formatMoney(o.price_total, o.currency ?? "USD")}`
                            : step.action}
                        </Link>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
              {unreadMessages.slice(0, 3).map((m, i) => {
                const o = m.order_id ? byId.get(m.order_id) : undefined;
                return (
                  <li key={`m${i}`}>
                    <Card>
                      <CardBody className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[length:var(--fs-4)] font-medium">New message{o ? ` · ${o.title}` : ""}</p>
                          <p className="text-[length:var(--fs-2)] text-muted-foreground">From the team</p>
                        </div>
                        <Link
                          href={m.order_id ? `/messages/${m.order_id}` : "/messages"}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Open
                        </Link>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="pt-4 font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">
            In progress
          </h2>
          <Card>
            {inProgress.length === 0 ? (
              <CardBody className="text-[length:var(--fs-3)] text-muted-foreground">No orders in progress.</CardBody>
            ) : (
              inProgress.map((o) => (
                <ListRow
                  key={o.id}
                  href={`/orders/${o.id}`}
                  reference={o.display_ref}
                  title={o.title}
                  trailing={
                    <>
                      {o.sla_status === "running" && o.sla_due_at && <Timer dueAt={o.sla_due_at} label="First look" />}
                      <StatusBadge status={o.status} />
                    </>
                  }
                />
              ))
            )}
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
              <Link href="/wallet" className="text-[length:var(--fs-2)] underline underline-offset-4">
                Activity
              </Link>
            </CardHeader>
            <CardBody>
              <p className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">
                {formatMoney(creditCents, "USD")}
              </p>
              <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">Credit to use on your next order</p>
              <Link href="/wallet/invoices" className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}>
                Invoices
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </main>
  );
}
