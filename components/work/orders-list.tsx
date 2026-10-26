import { staffNext, staffStage, STAGE_LABELS, statusMeta, type StaffStage } from "@/core";
import type { PillTone } from "@/components/ui/status-pill";
import { OrdersBrowser, type OrderRow, type OrdersTab } from "@/components/work/orders-browser";
import { formatMoney } from "@/lib/money";
import { when, type PodJob } from "@/lib/work/load";

/**
 * The team's order list (docs/design P3 for a pod lead, A2 for admins):
 * references only — order, client code, designer ref — never a name. The
 * rows are reduced here, on the server, to what the list shows, so nothing
 * else in the job reaches the browser. "Needs staff" is where the team has
 * the next move.
 */
export type { OrdersTab };
const CLOSED = new Set(["CLOSED", "PAYOUT_RELEASED", "CANCELLED", "REFUNDED"]);
const STAFF = new Set(["SUBMITTED", "PAYMENT_HELD", "QC_REVIEW", "DISPUTED", "APPROVED", "DELIVERED"]);
const QUIET = new Set(["REFUNDED", "CANCELLED"]);

export const inTab = (t: OrdersTab, j: PodJob) =>
  t === "all" ? true : t === "closed" ? CLOSED.has(j.status) : t === "staff" ? STAFF.has(j.status) : !CLOSED.has(j.status);

export function parseTab(raw: string | undefined): OrdersTab {
  return raw === "open" || raw === "staff" || raw === "closed" ? raw : "all";
}

const stamp = (iso: string) => when(iso, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function OrdersList({
  jobs,
  basePath,
  tab,
  q,
  stage,
}: {
  jobs: PodJob[];
  basePath: string;
  tab: OrdersTab;
  q?: string;
  stage?: StaffStage | null;
}) {
  const link = (j: PodJob) => (j.status === "QC_REVIEW" && basePath.startsWith("/qc") ? `/qc/${j.order_id}` : `/orders/${j.order_id}`);
  const rows: OrderRow[] = jobs.map((j) => {
    const meta = statusMeta(j.status);
    const next = staffNext({
      status: j.status,
      podId: j.pod_id,
      confirmed: !!j.confirmed_at,
      designerId: j.designer_id,
      category: j.category,
      source: j.source,
      disputeReason: j.dispute_reason,
    });
    return {
      id: j.order_id,
      href: link(j),
      title: j.title,
      ref: j.order_ref,
      clientCode: j.client_code,
      designerRef: j.designer_ref,
      pod: j.pod_name,
      status: { label: meta.label, tone: (QUIET.has(j.status) ? "neutral" : meta.tone) as PillTone },
      stage: staffStage(j.status),
      tabs: (["all", "open", "staff", "closed"] as OrdersTab[]).filter((t) => inTab(t, j)),
      why: next.why,
      action: next.action,
      sla: { status: j.sla_status, due: j.sla_due_at },
      designerDue: j.designer_due_at ? stamp(j.designer_due_at) : null,
      total: j.price_total ? formatMoney(j.price_total, j.currency ?? "USD") : null,
      created: stamp(j.created_at),
    };
  });
  return (
    <OrdersBrowser
      rows={rows}
      basePath={basePath}
      stages={STAGE_LABELS}
      initial={{ tab, stage: stage ?? "", q: q ?? "" }}
    />
  );
}
