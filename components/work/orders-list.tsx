import Link from "next/link";

import { staffStage, STAGE_LABELS, type StaffStage } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { when, type PodJob } from "@/lib/work/load";

/**
 * The team's order list (docs/design P3 for a pod lead, A2 for admins):
 * references only — order, client code, designer ref — never a name.
 * "Needs staff" is where the team has the next move. Filters live in the
 * URL so a view can be bookmarked or shared.
 */
export type OrdersTab = "all" | "open" | "staff" | "closed";
const CLOSED = new Set(["CLOSED", "PAYOUT_RELEASED", "CANCELLED", "REFUNDED"]);
const STAFF = new Set(["SUBMITTED", "PAYMENT_HELD", "QC_REVIEW", "DISPUTED", "APPROVED", "DELIVERED"]);

export const inTab = (t: OrdersTab, j: PodJob) =>
  t === "all" ? true : t === "closed" ? CLOSED.has(j.status) : t === "staff" ? STAFF.has(j.status) : !CLOSED.has(j.status);

export function parseTab(raw: string | undefined): OrdersTab {
  return raw === "open" || raw === "staff" || raw === "closed" ? raw : "all";
}

export function OrdersList({
  jobs,
  basePath,
  tab,
  q: rawQ,
  stage,
}: {
  jobs: PodJob[];
  basePath: string;
  tab: OrdersTab;
  q?: string;
  stage?: StaffStage | null;
}) {
  const q = (rawQ ?? "").trim().toLowerCase();
  const matches = (j: PodJob) =>
    !q || [j.order_ref, j.client_code, j.designer_ref, j.title].some((s) => s?.toLowerCase().includes(q));
  const shown = jobs.filter((j) => inTab(tab, j) && matches(j) && (!stage || staffStage(j.status) === stage));
  const href = (t: OrdersTab) =>
    `${basePath}?${new URLSearchParams({ ...(t !== "all" ? { tab: t } : {}), ...(q ? { q } : {}) })}`;
  const link = (j: PodJob) => (j.status === "QC_REVIEW" && basePath.startsWith("/qc") ? `/qc/${j.order_id}` : `/orders/${j.order_id}`);
  const due = (j: PodJob) =>
    j.sla_due_at ? when(j.sla_due_at, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <nav aria-label="Filter">
          <ul className="flex gap-6 overflow-x-auto">
            {(
              [
                ["all", "All"],
                ["open", "Open"],
                ["staff", "Needs staff"],
                ["closed", "Closed"],
              ] as [OrdersTab, string][]
            ).map(([t, label]) => (
              <li key={t}>
                <Link
                  href={href(t)}
                  aria-current={tab === t && !stage ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[var(--ctl-sm)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-2)]",
                    tab === t && !stage ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label} <span className="tabular font-mono text-[length:var(--fs-1)]">{jobs.filter((j) => inTab(t, j)).length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form className="mb-2 w-full sm:w-72" role="search">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <Input name="q" defaultValue={rawQ ?? ""} placeholder="Order, account or designer ref" aria-label="Search orders" />
        </form>
      </div>
      {stage && (
        <p className="text-[length:var(--fs-2)]">
          Showing <span className="font-medium">{STAGE_LABELS.find(([s]) => s === stage)?.[1]}</span> ·{" "}
          <Link href={basePath} className="underline underline-offset-4">
            show all
          </Link>
        </p>
      )}

      {shown.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No orders here.</Card>
      ) : (
        <>
          <Card className="md:hidden">
            {shown.map((j) => (
              <ListRow
                key={j.order_id}
                href={link(j)}
                reference={j.order_ref}
                title={j.title}
                meta={[j.client_code, j.designer_ref, due(j)].filter(Boolean).join(" · ")}
                trailing={<StatusBadge status={j.status} />}
              />
            ))}
          </Card>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  {["Order", "Client", "Designer", "Status", "First look due", "Total"].map((h) => (
                    <th key={h} className="px-[var(--s-4)] py-[var(--s-3)] font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => (
                  <tr key={j.order_id} className="border-b border-border last:border-b-0 hover:bg-subtle">
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <Link href={link(j)} className="block text-[length:var(--fs-3)] font-medium hover:underline">
                        {j.title}
                      </Link>
                      <span className="tabular font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                        {j.order_ref ?? "Not sent"}
                      </span>
                    </td>
                    <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">{j.client_code ?? "—"}</td>
                    <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">{j.designer_ref ?? "—"}</td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">{due(j)}</td>
                    <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">
                      {j.price_total ? formatMoney(j.price_total, j.currency ?? "USD") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
