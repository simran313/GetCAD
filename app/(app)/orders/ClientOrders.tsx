import Link from "next/link";

import { clientTab, type ClientTab } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { serviceWord, shortDate, type ClientOrder } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * C3 — the client's orders (docs/design): tabs by what each order needs, a
 * table at desk width and a list on a phone. "Pay to start" stands in for
 * the price while an order waits on payment.
 */
const TABS: { key: ClientTab | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs you" },
  { key: "progress", label: "In progress" },
  { key: "reopened", label: "Re-opened" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const VIA: Record<string, string> = { whatsapp: "via WhatsApp", email: "via email", phone: "by phone" };

function when(o: ClientOrder): string {
  if (o.sla_status === "running" && o.sla_due_at) return `First look ${shortDate(o.sla_due_at)}`;
  return shortDate(o.created_at);
}

function priceCell(o: ClientOrder) {
  if (o.status === "QUOTED" && o.price_total) {
    return (
      <Link href={`/orders/${o.id}/pay`} className={buttonVariants({ size: "sm" })}>
        Pay {formatMoney(o.price_total, o.currency ?? "USD")}
      </Link>
    );
  }
  return o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : "—";
}

export function ClientOrders({ orders, tab }: { orders: ClientOrder[]; tab: string }) {
  const active = (TABS.find((t) => t.key === tab)?.key ?? "all") as ClientTab | "all";
  const count = (k: ClientTab | "all") => (k === "all" ? orders.length : orders.filter((o) => clientTab(o.status) === k).length);
  const shown = active === "all" ? orders : orders.filter((o) => clientTab(o.status) === active);

  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <PageHeader
        title="Orders"
        actions={
          <Link href="/orders/new" className={buttonVariants()}>
            New order
          </Link>
        }
      />

      <nav aria-label="Filter orders" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-6 border-b border-border">
          {TABS.map((t) => {
            const n = count(t.key);
            const on = t.key === active;
            return (
              <li key={t.key}>
                <Link
                  href={t.key === "all" ? "/orders" : `/orders?tab=${t.key}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[var(--ctl-sm)] items-center gap-1.5 whitespace-nowrap border-b-2 text-[length:var(--fs-2)]",
                    on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {n > 0 && <span className="tabular font-mono text-[length:var(--fs-1)]">{n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">
          {orders.length === 0 ? (
            <>
              No orders yet.{" "}
              <Link href="/orders/new" className="underline underline-offset-4">
                Start your first one
              </Link>
              .
            </>
          ) : (
            "Nothing here."
          )}
        </Card>
      ) : (
        <>
          {/* Phone: a list (C3 mobile). */}
          <Card className="md:hidden">
            {shown.map((o) => (
              <ListRow
                key={o.id}
                href={`/orders/${o.id}`}
                reference={[o.display_ref, o.source && VIA[o.source]].filter(Boolean).join(" · ")}
                title={o.title}
                meta={`${serviceWord(o.service)} · ${when(o)}`}
                trailing={<StatusBadge status={o.status} />}
              />
            ))}
          </Card>

          {/* Desk: the table (C3 desktop). */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border font-mono text-[length:var(--fs-1)] uppercase tracking-[0.1em] text-muted-foreground">
                  {["Order", "Service", "Status", "Your PO", "Date", "Price"].map((h) => (
                    <th key={h} scope="col" className="px-[var(--s-4)] py-[var(--s-3)] font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-b-0 hover:bg-subtle">
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <Link href={`/orders/${o.id}`} className="block">
                        <span className="block text-[length:var(--fs-3)] font-medium">{o.title}</span>
                        <span className="tabular font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                          {[o.display_ref ?? "Draft", o.source && VIA[o.source]].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                    </td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--fs-2)]">{serviceWord(o.service)}</td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)] font-mono text-[length:var(--fs-2)]">{o.client_po ?? "—"}</td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--fs-2)]">{when(o)}</td>
                    <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono text-[length:var(--fs-2)]">{priceCell(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </main>
  );
}
