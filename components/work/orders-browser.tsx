"use client";

import { Bookmark, PackageOpen, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * The team's order list, interactive half (redesign A2/P3). Built-in views
 * (All · Open · Needs staff · Closed) with counts, a stage filter, instant
 * search, and views you save yourself (kept in this browser only). A row
 * opens a drawer with the order's facts and its next move; the full order is
 * one tap further. References only — never a name.
 */
export type OrdersTab = "all" | "open" | "staff" | "closed";

export interface OrderRow {
  id: string;
  href: string;
  title: string;
  ref: string | null;
  clientCode: string | null;
  designerRef: string | null;
  pod: string | null;
  status: { label: string; tone: PillTone };
  stage: string;
  tabs: OrdersTab[];
  why: string;
  action: string;
  sla: { status: string | null; due: string | null };
  designerDue: string | null;
  total: string | null;
  created: string;
}

interface View {
  name: string;
  tab: OrdersTab;
  stage: string;
  q: string;
}

const TABS: [OrdersTab, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["staff", "Needs staff"],
  ["closed", "Closed"],
];

function readViews(key: string): View[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as View[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}
function writeViews(key: string, views: View[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(views));
  } catch {
    /* private window: saved views just don't persist */
  }
}

function Clock({ sla }: { sla: OrderRow["sla"] }) {
  if (sla.status === "met") return <span className="text-[length:var(--fs-2)] text-muted-foreground">Done</span>;
  if (sla.status === "breached" || sla.status === "breached_credited") return <StatusPill tone="danger">Missed</StatusPill>;
  return <SlaCountdown dueAt={sla.status === "running" ? sla.due : null} />;
}

export function OrdersBrowser({
  rows,
  basePath,
  stages,
  initial,
}: {
  rows: OrderRow[];
  basePath: string;
  stages: [string, string][];
  initial: { tab: OrdersTab; stage: string; q: string };
}) {
  const [tab, setTab] = useState<OrdersTab>(initial.tab);
  const [stage, setStage] = useState(initial.stage);
  const [q, setQ] = useState(initial.q);
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const storeKey = `tcp_order_views:${basePath}`;

  useEffect(() => setViews(readViews(storeKey)), [storeKey]);

  // The URL follows the filters, so a view can still be bookmarked or shared.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "all") p.set("tab", tab);
    if (stage) p.set("stage", stage);
    if (q.trim()) p.set("q", q.trim());
    const next = `${basePath}${p.size ? `?${p}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [tab, stage, q, basePath]);

  const needle = q.trim().toLowerCase();
  const matches = (r: OrderRow) => !needle || [r.ref, r.clientCode, r.designerRef, r.title].some((s) => s?.toLowerCase().includes(needle));
  const counts = useMemo(() => Object.fromEntries(TABS.map(([t]) => [t, rows.filter((r) => r.tabs.includes(t)).length])), [rows]);
  const shown = rows.filter((r) => r.tabs.includes(tab) && (!stage || r.stage === stage) && matches(r));
  const filtered = tab !== "all" || !!stage || !!needle;

  const apply = (v: View) => {
    setTab(v.tab);
    setStage(v.stage);
    setQ(v.q);
  };
  const saveView = () => {
    const n = name.trim();
    if (!n) return;
    const next = [...views.filter((v) => v.name !== n), { name: n, tab, stage, q: q.trim() }];
    setViews(next);
    writeViews(storeKey, next);
    setNaming(false);
    setName("");
    toast(`Saved "${n}"`);
  };
  const removeView = (n: string) => {
    const next = views.filter((v) => v.name !== n);
    setViews(next);
    writeViews(storeKey, next);
  };
  const isView = (v: View) => v.tab === tab && v.stage === stage && v.q === q.trim();

  const columns: Column<OrderRow>[] = [
    {
      key: "order",
      header: "Order",
      card: "title",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{r.title}</span>
          <span className="tabular block font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">{r.ref ?? "Not sent yet"}</span>
        </span>
      ),
    },
    { key: "client", header: "Client", className: "tabular font-mono text-[length:var(--fs-2)]", cell: (r) => r.clientCode ?? "—" },
    { key: "designer", header: "Designer", className: "tabular font-mono text-[length:var(--fs-2)]", cell: (r) => r.designerRef ?? "—" },
    { key: "status", header: "Status", card: "badge", className: "whitespace-nowrap", cell: (r) => <StatusPill tone={r.status.tone}>{r.status.label}</StatusPill> },
    { key: "sla", header: "First look", className: "whitespace-nowrap", cell: (r) => <Clock sla={r.sla} /> },
    { key: "total", header: "Total", align: "right", className: "tabular whitespace-nowrap", cell: (r) => r.total ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Views" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex min-w-max gap-5">
            {TABS.map(([t, label]) => {
              const on = tab === t && !stage && !needle;
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => apply({ name: label, tab: t, stage: "", q: "" })}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex min-h-[var(--ctl-sm)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-3)]",
                      on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                    <span className="tabular rounded-[var(--r-full)] bg-muted px-1.5 text-[length:var(--fs-1)] leading-5 text-muted-foreground">{counts[t]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, account or designer ref" className="pl-9" />
          </label>
          <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage" className="sm:w-48">
            <option value="">Every stage</option>
            {stages.map(([s, label]) => (
              <option key={s} value={s}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {(views.length > 0 || filtered) && (
        <div className="flex flex-wrap items-center gap-2">
          {views.map((v) => (
            <span
              key={v.name}
              className={cn(
                "inline-flex min-h-[var(--ctl-sm)] items-center rounded-[var(--r-full)] border text-[length:var(--fs-2)]",
                isView(v) ? "border-foreground bg-foreground text-background" : "border-[color:var(--border-strong)] bg-background",
              )}
            >
              <button type="button" onClick={() => apply(v)} className="inline-flex min-h-[var(--ctl-sm)] items-center gap-1.5 pl-3 pr-1">
                <Bookmark className="h-3.5 w-3.5" aria-hidden />
                {v.name}
              </button>
              <button type="button" onClick={() => removeView(v.name)} aria-label={`Remove saved view ${v.name}`} className="inline-flex size-8 items-center justify-center rounded-full opacity-70 hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {filtered && !views.some(isView) &&
            (naming ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveView();
                }}
              >
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="View name" className="w-48" maxLength={40} />
                <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(true)}>
                <Bookmark /> Save this view
              </Button>
            ))}
        </div>
      )}

      <ResponsiveDataList
        caption="Orders"
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        empty={
          <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            {rows.length === 0 ? (
              <EmptyState icon={<PackageOpen />} title="No orders yet" description="Orders show up here as soon as a brief is sent." />
            ) : (
              <EmptyState
                icon={<Search />}
                title="No orders match"
                description="Try a shorter reference, another stage, or clear the filters."
                action={
                  <Button variant="secondary" onClick={() => apply({ name: "", tab: "all", stage: "", q: "" })}>
                    Clear filters
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <SheetContent title={open.title} description={open.ref ?? "Not sent yet"}>
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={open.status.tone}>{open.status.label}</StatusPill>
                <Clock sla={open.sla} />
              </div>
              <div className="rounded-[var(--r-md)] border border-border bg-subtle p-4">
                <p className="eyebrow">Next move</p>
                <p className="mt-1 text-[length:var(--fs-3)]">{open.why.charAt(0).toUpperCase() + open.why.slice(1)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[length:var(--fs-3)]">
                {(
                  [
                    ["Client", open.clientCode, true],
                    ["Designer", open.designerRef, true],
                    ["Pod", open.pod, false],
                    ["Total", open.total, false],
                    ["Designer due", open.designerDue, false],
                    ["Created", open.created, false],
                  ] as [string, string | null, boolean][]
                ).map(([k, v, mono]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[length:var(--fs-2)] text-muted-foreground">{k}</dt>
                    <dd className={cn("truncate", mono && "tabular font-mono")}>{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              <Link href={open.href} className={buttonVariants({ className: "w-full" })}>
                {open.action === "Open" ? "Open order" : `Open order to ${open.action.toLowerCase()}`}
              </Link>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
