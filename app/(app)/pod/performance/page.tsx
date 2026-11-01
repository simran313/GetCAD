import { auth } from "@clerk/nextjs/server";
import { Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { deltaWord, durationWord, formatRelative, type DesignerSummary } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { designerName, loadPodReport, periodKey, type PodFilters, type PodReport } from "@/lib/work/pod";
import { requireTeam } from "@/lib/work/team";

import { RefreshEvery } from "../RefreshEvery";
import { ResolveEscalation } from "./ResolveEscalation";

/**
 * Pod performance (Phase 13c): the pod lead's operations view. Live load,
 * bottlenecks and escalations; then each designer's output, working time,
 * turnaround, on-time rate, first-pass QC rate and rework for the period,
 * against the period before. Every number is computed from recorded events
 * (core/work/metrics); nothing is estimated.
 */
export const dynamic = "force-dynamic";

type Search = { period?: string; from?: string; to?: string; designer?: string; category?: string; product?: string };

const PERIOD_WORDS: [string, string][] = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["custom", "Custom"],
];

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const dur = (ms: number | null) => (ms == null ? "—" : durationWord(ms));

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  if (!team) redirect("/home");
  const sp = await searchParams;
  const { data: grants } = await supabase.from("user_roles").select("role");
  const roles = new Set([team.role, ...((grants ?? []) as { role: string }[]).map((g) => g.role)]);
  const isAdmin = ["SALES", "OPS", "FINANCE"].every((x) => roles.has(x));
  const tz = await viewerZone();
  const period = periodKey(sp.period);
  const filters: PodFilters = { designer: sp.designer || undefined, category: sp.category || undefined, product: sp.product || undefined };

  let r: PodReport;
  try {
    r = await loadPodReport(supabase, { period, from: sp.from, to: sp.to, zone: tz, filters });
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load performance" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }

  const query = new URLSearchParams(Object.entries({ ...sp, period }).filter(([, v]) => !!v) as [string, string][]).toString();
  const categories = [...new Set(r.jobs.map((j) => j.category).filter(Boolean))].sort() as string[];
  const products = [...new Set(r.jobs.map((j) => j.product))].sort();
  const t = r.team;
  const tb = r.teamBefore;
  const b = r.bottlenecks;

  const kpis: [string, string, string | null][] = [
    ["Submitted to QC", String(t.submitted), deltaWord(t.submitted, tb.submitted)],
    ["Passed QC", String(t.passed), deltaWord(t.passed, tb.passed)],
    ["On time", pct(t.onTimeRate), deltaWord(t.onTimeRate, tb.onTimeRate, true)],
    ["First-pass QC", pct(t.firstPassRate), deltaWord(t.firstPassRate, tb.firstPassRate, true)],
    ["Avg working time", dur(t.avgActiveMs), null],
    ["Avg turnaround", dur(t.avgTurnaroundMs), null],
  ];

  const columns: Column<{ id: string; m: DesignerSummary }>[] = [
    {
      key: "designer",
      header: "Designer",
      card: "title",
      cell: ({ id }) => {
        const d = r.designers.find((x) => x.designer_id === id);
        return (
          <span className="block min-w-0">
            <span className="block truncate font-medium">{designerName(d)}</span>
            <span className="block font-mono text-[length:var(--fs-1)] text-muted-foreground">{d?.designer_ref}</span>
          </span>
        );
      },
    },
    {
      key: "now",
      header: "Now",
      className: "whitespace-nowrap",
      cell: ({ id }) => {
        const l = r.live.get(id);
        if (!l) return "—";
        const over = l.openMinutes > l.shiftMinutes;
        return (
          <span className="block text-[length:var(--fs-2)]">
            <span className={cn("tabular", over && "font-semibold")}>
              {l.open} open · {l.openMinutes}/{l.shiftMinutes} min
            </span>
            {(l.paused > 0 || l.overdue > 0) && (
              <span className="block text-muted-foreground">
                {[l.paused ? `${l.paused} paused` : null, l.overdue ? `${l.overdue} overdue` : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        );
      },
    },
    { key: "assigned", header: "Assigned", align: "right", className: "tabular", cell: ({ m }) => m.assigned },
    { key: "submitted", header: "Submitted", align: "right", className: "tabular", cell: ({ m }) => m.submitted },
    { key: "passed", header: "Passed", align: "right", className: "tabular", cell: ({ m }) => m.passed },
    { key: "active", header: "Avg work", align: "right", className: "tabular whitespace-nowrap", cell: ({ m }) => dur(m.avgActiveMs) },
    { key: "turn", header: "Avg turnaround", align: "right", className: "tabular whitespace-nowrap", cell: ({ m }) => dur(m.avgTurnaroundMs) },
    { key: "ontime", header: "On time", align: "right", className: "tabular", cell: ({ m }) => pct(m.onTimeRate) },
    { key: "fpq", header: "First-pass QC", align: "right", className: "tabular", cell: ({ m }) => pct(m.firstPassRate) },
    { key: "rework", header: "QC returns", align: "right", className: "tabular", cell: ({ m }) => m.qcReturns },
    { key: "changes", header: "Client changes", align: "right", className: "tabular", cell: ({ m }) => m.clientChanges },
  ];
  const rows = r.designers.map((d) => ({ id: d.designer_id, m: r.current.get(d.designer_id)! })).filter((x) => x.m);

  return (
    <Page>
      <RefreshEvery seconds={60} />
      <PageHeader
        eyebrow={[...new Set(r.designers.map((d) => d.pod_name))].join(", ") || "Your pod"}
        title="Performance"
        description="Live load, bottlenecks and each designer's output, from recorded work only. Compared with the period before."
        actions={
          <div className="flex flex-wrap gap-2">
            {(["xlsx", "csv", "pdf"] as const).map((f) => (
              <a key={f} href={`/api/pod/report?format=${f}&${query}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <Download aria-hidden />
                {f === "xlsx" ? "Excel" : f.toUpperCase()}
              </a>
            ))}
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)]">
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          Period
          <Select name="period" defaultValue={period}>
            {PERIOD_WORDS.map(([k, w]) => (
              <option key={k} value={k}>
                {w}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          From
          <Input type="date" name="from" defaultValue={sp.from ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          To
          <Input type="date" name="to" defaultValue={sp.to ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          Designer
          <Select name="designer" defaultValue={sp.designer ?? ""}>
            <option value="">Everyone</option>
            {r.allDesigners.map((d) => [d.designer_id, designerName(d)] as const).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          Category
          <Select name="category" defaultValue={sp.category ?? ""}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--fs-2)] font-medium">
          Job type
          <Select name="product" defaultValue={sp.product ?? ""}>
            <option value="">All</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          Apply
        </button>
        {query !== `period=${period}` && (
          <Link href="/pod/performance" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Reset
          </Link>
        )}
      </form>

      {!r.complete && (
        <Card className="p-[var(--s-4)] text-[length:var(--fs-2)] text-muted-foreground">
          Working-time history starts once migrations 0057 and 0058 are applied. Until then the figures below are partial.
        </Card>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border shadow-[var(--e-1)] sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([label, value, delta]) => (
          <div key={label} className="flex flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="order-2 text-[length:var(--fs-2)] text-muted-foreground">{label}</dt>
            <dd className="tabular text-[22px] font-semibold leading-8">
              {value}
              {delta && <span className="ml-2 text-[length:var(--fs-1)] font-normal text-muted-foreground">{delta}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="section">
          <CardHeader>
            <CardTitle>Bottlenecks now</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-border text-[length:var(--fs-3)]">
              <Bottleneck label="Waiting for a designer" value={b.unassigned} note={b.oldestUnassignedAt ? `oldest ${formatRelative(b.oldestUnassignedAt, tz)}` : null} href="/pod/board" />
              <Bottleneck label="Waiting for QC" value={b.waitingQc} note={b.oldestQcAt ? `oldest submitted ${formatRelative(b.oldestQcAt, tz)}` : null} href="/qc" />
              <Bottleneck label="Overdue to QC" value={b.overdue} note={null} href="/pod/board" alert />
              <Bottleneck label="Paused" value={b.paused} note={null} href="/pod/board" />
              <li className="flex items-baseline justify-between gap-3 py-2">
                <span>Idle designers</span>
                <span className="text-right text-[length:var(--fs-2)] text-muted-foreground">
                  {b.idle.length === 0 ? "None" : b.idle.map((d) => designerName(d)).join(", ")}
                </span>
              </li>
              {b.imbalance && (
                <li className="py-2 text-[length:var(--fs-2)]">
                  <span className="font-medium">Uneven load:</span> {designerName(b.imbalance.most)} has {b.imbalance.most.open_minutes} min open,{" "}
                  {designerName(b.imbalance.least)} {b.imbalance.least.open_minutes}. Consider moving a job on the{" "}
                  <Link href="/pod/board" className="underline underline-offset-4">
                    team board
                  </Link>
                  .
                </li>
              )}
            </ul>
          </CardBody>
        </Card>

        <Card as="section">
          <CardHeader>
            <CardTitle>Escalated to admin</CardTitle>
            <span className="tabular text-[length:var(--fs-2)] text-muted-foreground">{r.escalations.length} open</span>
          </CardHeader>
          <CardBody>
            {r.escalations.length === 0 ? (
              <p className="text-[length:var(--fs-2)] text-muted-foreground">Nothing escalated. Escalate a job from the team board.</p>
            ) : (
              <ul className="divide-y divide-border">
                {r.escalations.map((e) => (
                  <li key={e.id} className="py-2">
                    <Link href={`/orders/${e.order_id}`} className="font-mono text-[length:var(--fs-2)] underline underline-offset-4">
                      {e.order_ref ?? "Order"}
                    </Link>
                    <p className="text-[length:var(--fs-3)]">{e.reason}</p>
                    <p className="text-[length:var(--fs-1)] text-muted-foreground">{formatRelative(e.created_at, tz)}</p>
                    {isAdmin && <ResolveEscalation id={e.id} />}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="designers-title" className="space-y-3">
        <h2 id="designers-title" className="text-[length:var(--fs-4)] font-semibold">
          Designers
        </h2>
        <ResponsiveDataList
          caption="Designer performance"
          columns={columns}
          rows={rows}
          rowKey={(x) => x.id}
          rowHref={(x) => `/pod/designers/${x.id}?${query}`}
          linkKey="designer"
          empty={<Card className="p-[var(--s-6)] text-[length:var(--fs-3)] text-muted-foreground">No designers in your pod yet.</Card>}
        />
      </section>
    </Page>
  );
}

function Bottleneck({ label, value, note, href, alert }: { label: string; value: number; note: string | null; href: string; alert?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <Link href={href} className="hover:underline">
        {label}
      </Link>
      <span className="text-right">
        <span className={cn("tabular font-semibold", alert && value > 0 && "text-[color:var(--tone-danger-fg)]", value === 0 && "font-normal text-muted-foreground")}>{value}</span>
        {note && value > 0 && <span className="ml-2 text-[length:var(--fs-2)] text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}
