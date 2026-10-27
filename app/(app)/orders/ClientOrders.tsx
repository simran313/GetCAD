import { CircleCheck, PackageOpen, Plus } from "lucide-react";
import Link from "next/link";

import { clientTab, type ClientTab } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { serviceWord, shortDate, type ClientOrder } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { viewerZone } from "@/lib/time/zone";

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

function when(o: ClientOrder, tz: string): string {
  if (o.sla_status === "running" && o.sla_due_at) return `First look ${shortDate(o.sla_due_at, tz)}`;
  return shortDate(o.created_at, tz);
}

export async function ClientOrders({ orders, tab }: { orders: ClientOrder[]; tab: string }) {
  const tz = await viewerZone();
  const active = (TABS.find((t) => t.key === tab)?.key ?? "all") as ClientTab | "all";
  const count = (k: ClientTab | "all") => (k === "all" ? orders.length : orders.filter((o) => clientTab(o.status) === k).length);
  const shown = active === "all" ? orders : orders.filter((o) => clientTab(o.status) === active);
  // Tabs with nothing in them are hidden, except All and Needs you.
  const tabs = TABS.filter((t) => t.key === "all" || t.key === "needs" || count(t.key) > 0);

  const columns: Column<ClientOrder>[] = [
    {
      key: "order",
      header: "Order",
      card: "title",
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{o.title}</span>
          <span className="tabular block font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">
            {[o.display_ref ?? "Draft", o.source && VIA[o.source]].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", card: "badge", className: "whitespace-nowrap", cell: (o) => <StatusBadge status={o.status} /> },
    { key: "service", header: "Service", className: "text-[length:var(--fs-2)]", cell: (o) => serviceWord(o.service) },
    { key: "po", header: "Your PO", className: "font-mono text-[length:var(--fs-2)]", cell: (o) => o.client_po ?? "—" },
    { key: "date", header: "Date", className: "whitespace-nowrap text-[length:var(--fs-2)]", cell: (o) => when(o, tz) },
    {
      key: "price",
      header: "Price",
      align: "right",
      className: "tabular whitespace-nowrap text-[length:var(--fs-2)]",
      cell: (o) => (o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : "—"),
    },
    {
      key: "pay",
      header: <span className="sr-only">Pay</span>,
      card: "action",
      align: "right",
      className: "w-[1%] whitespace-nowrap",
      cell: (o) =>
        o.status === "QUOTED" && o.price_total ? (
          <Link href={`/orders/${o.id}/pay`} className={buttonVariants({ size: "sm" })}>
            Pay {formatMoney(o.price_total, o.currency ?? "USD")}
          </Link>
        ) : null,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Orders"
        description="Every design you have sent us, newest first."
        actions={
          <Link href="/orders/new" className={buttonVariants()}>
            <Plus /> New order
          </Link>
        }
      />

      <nav aria-label="Filter orders" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-6 border-b border-border">
          {tabs.map((t) => {
            const n = count(t.key);
            const on = t.key === active;
            return (
              <li key={t.key}>
                <Link
                  href={t.key === "all" ? "/orders" : `/orders?tab=${t.key}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[var(--ctl)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-3)]",
                    on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "tabular rounded-[var(--r-full)] px-2 text-[length:var(--fs-1)] leading-5",
                      t.key === "needs" && n > 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ResponsiveDataList
        caption="Your orders"
        columns={columns}
        rows={shown}
        rowKey={(o) => o.id}
        rowHref={(o) => `/orders/${o.id}`}
        empty={
          <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            {orders.length === 0 ? (
              <EmptyState
                icon={<PackageOpen />}
                title="No orders yet"
                description="Send a sketch or a photo. You see the price before you pay anything."
                action={
                  <Link href="/orders/new" className={buttonVariants()}>
                    Start your first design
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<CircleCheck />}
                title={active === "needs" ? "Nothing needs you" : "Nothing here"}
                description={active === "needs" ? "We'll tell you the moment something does." : "Pick another tab to see your other orders."}
              />
            )}
          </div>
        }
      />
    </Page>
  );
}
