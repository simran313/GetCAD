"use client";

import {
  Bell,
  Building2,
  Check,
  FileText,
  Inbox,
  KeyRound,
  ListOrdered,
  Magnet,
  MessageSquare,
  Plus,
  Settings,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";

import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { Sidebar, type NavGroup } from "@/components/shell/sidebar";
import { Button } from "@/components/ui/button";
import { LiveCallButton } from "@/components/ui/live-call-button";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusPill } from "@/components/ui/status-pill";
import { ResponsiveDataList } from "@/components/ui/data-list";
import { PipelineStrip } from "@/components/work/pipeline-strip";
import { cn } from "@/lib/utils";

/** Sample screens for the design preview. Placeholder content, no real data. */

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export function MarketingSample() {
  const display = "font-semibold tracking-[-0.03em]";
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-8">
          <span className="text-[17px] font-semibold tracking-[-0.02em]">The CAD Pillar</span>
          <nav className="hidden flex-1 items-center gap-6 text-[15px] text-muted-foreground lg:flex">
            <span>How it works</span>
            <span>Pricing</span>
            <span>Quality</span>
            <span>FAQ</span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[15px] lg:inline">Sign in</span>
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex">Talk to us live</Button>
            <Button size="sm">Start your first design</Button>
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-14 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <p className="eyebrow">Jewelry CAD for the trade · placeholder copy</p>
          <h1 className={cn("mt-4 text-[40px] leading-[1.1] sm:text-[56px] lg:text-[64px]", display)}>
            Factory-ready jewelry CAD, checked twice.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[18px] leading-[1.5] text-muted-foreground">
            Senior designers build every file to cast first time, and a master craftsman signs it off. US hours. Guaranteed in writing.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg">Start your first design</Button>
            <Button size="lg" variant="secondary">Get a free quote</Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px] text-muted-foreground">
            {["Guaranteed in writing", "We work your hours", "Live call anytime, TODO hours"].map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-foreground" />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--r-xl)] border border-border bg-card p-5 shadow-[var(--e-2)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[13px] text-muted-foreground">MJ1-RN-C-10</p>
              <p className="text-[18px] font-semibold">Halo engagement ring</p>
            </div>
            <StatusPill tone="info">In design</StatusPill>
          </div>
          <div className="mt-5 rounded-[var(--r-md)] bg-subtle p-4">
            <p className="text-[14px] text-muted-foreground">First look in</p>
            <p className="text-[40px] font-semibold leading-tight tracking-[-0.03em] tabular">5h 42m</p>
          </div>
          <ul className="mt-4 space-y-2 text-[15px]">
            {["Brief and dimensions", "Stone seats to spec", "Wall and prong minimums", "STL export, watertight"].map((t, i) => (
              <li key={t} className="flex items-center gap-2">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", i < 3 ? "bg-foreground text-background" : "border border-border")}>
                  {i < 3 && <Check className="h-3 w-3" />}
                </span>
                <span className={i < 3 ? "" : "text-muted-foreground"}>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="border-y border-border bg-subtle">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px px-4 md:px-8 lg:grid-cols-4">
          {[
            ["50+", "senior CAD designers (TODO confirm)"],
            ["2", "experts on every file"],
            ["19", "point factory check"],
            ["6h", "first look, or it's free"],
          ].map(([n, l]) => (
            <div key={l} className="py-8 pr-4">
              <dt className="sr-only">{l}</dt>
              <dd className={cn("text-[40px] leading-none tabular", display)}>{n}</dd>
              <dd className="mt-2 text-[15px] text-muted-foreground">{l}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 py-14 md:px-8">
        <h2 className={cn("text-[32px] leading-[1.1] sm:text-[40px]", display)}>Every file is made to be cast.</h2>
        <p className="mt-3 max-w-xl text-[18px] text-muted-foreground">Geist Sans everywhere (option A).</p>
      </section>
    </div>
  );
}

const ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { key: "queue", label: "Queue", href: "#", icon: <Inbox />, badge: 3 },
      { key: "orders", label: "Orders", href: "#", icon: <ListOrdered /> },
      { key: "new", label: "Create order", href: "#", icon: <Plus /> },
    ],
  },
  { label: "Money", items: [{ key: "billing", label: "Billing", href: "#", icon: <Wallet /> }] },
  {
    label: "People",
    items: [
      { key: "clients", label: "Clients", href: "#", icon: <Building2 /> },
      { key: "access", label: "Access", href: "#", icon: <KeyRound /> },
      { key: "applications", label: "Applications", href: "#", icon: <UserPlus /> },
      { key: "leads", label: "Leads", href: "#", icon: <Magnet /> },
    ],
  },
  { label: "System", items: [{ key: "settings", label: "Settings", href: "#", icon: <Settings /> }] },
];

type Row = { ref: string; name: string; status: [string, "info" | "attention" | "danger" | "neutral"]; why: string; due: string | null; verb: string };
const ROWS: Row[] = [
  { ref: "TF1-RN-C-5", name: "Late ring", status: ["First look missed", "danger"], why: "Decide the late credit", due: inMinutes(-34), verb: "Decide" },
  { ref: "MJ1-RN-C-10", name: "Halo engagement ring", status: ["Ready to assign", "attention"], why: "Paid and confirmed, needs a designer", due: inMinutes(48), verb: "Assign" },
  { ref: "TF1-RN-C-9", name: "Eternity band", status: ["In design", "info"], why: "Designer working, first look due", due: inMinutes(236), verb: "Open" },
  { ref: "NA1-RN-C-12", name: "Signet ring", status: ["Awaiting quote", "neutral"], why: "Set a price", due: null, verb: "Quote" },
];

export function PortalSample() {
  return (
    <div className="min-h-screen bg-[color:var(--app-ground)]">
      <Sidebar groups={ADMIN_GROUPS} activeKey="queue" workspace="Admin" user={{ name: "Asha R.", role: "Ops", initials: "AR" }} onSearch={() => {}} />
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
        <span className="text-[16px] font-semibold tracking-[-0.02em]">Queue</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">AR</span>
      </header>
      <main className="px-4 pb-28 pt-6 md:ml-60 md:px-8 md:pb-10 md:pt-8">
        <div className="max-w-[var(--page-max)] space-y-6">
          <PageHeader title="Queue" description="What needs the team now, most urgent first." actions={<Button>Create order</Button>} />
          <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[color:var(--tone-danger-line)] bg-[color:var(--tone-danger-bg)] px-4 py-3 text-[15px] text-[color:var(--tone-danger-fg)]">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="flex-1"><b className="font-semibold">1 first look missed.</b> A late credit is waiting for a decision.</span>
            <Button size="sm" variant="secondary">Review</Button>
          </div>
          <PipelineStrip
            active="assign"
            stages={[
              { key: "quote", label: "Awaiting quote", count: 1, href: "#" },
              { key: "pay", label: "Awaiting payment", count: 5, href: "#" },
              { key: "assign", label: "Ready to assign", count: 2, href: "#" },
              { key: "design", label: "In design", count: 4, href: "#" },
              { key: "qc", label: "In QC", count: 0, href: "#" },
              { key: "client", label: "With client", count: 0, href: "#" },
              { key: "deliver", label: "Ready to deliver", count: 0, href: "#" },
              { key: "done", label: "Delivered", count: 1, href: "#" },
            ]}
          />
          <ResponsiveDataList<Row>
            caption="Needs the team"
            rows={ROWS}
            rowKey={(r) => r.ref}
            columns={[
              { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill tone={r.status[1]}>{r.status[0]}</StatusPill>, className: "w-[200px]" },
              { key: "order", header: "Order", card: "title", cell: (r) => (<span className="flex flex-col"><span className="font-medium">{r.name}</span><span className="font-mono text-[13px] text-muted-foreground">{r.ref}</span></span>) },
              { key: "why", header: "Why it's here", card: "meta", cell: (r) => <span className="text-muted-foreground">{r.why}</span> },
              { key: "sla", header: "First look", card: "meta", cell: (r) => <SlaCountdown dueAt={r.due} /> },
              { key: "act", header: <span className="sr-only">Action</span>, card: "action", align: "right", cell: (r) => <Button size="sm" variant="secondary">{r.verb}</Button> },
            ]}
          />
        </div>
      </main>
      <MobileBottomNav
        activeKey="queue"
        create={{ href: "#", label: "Create order" }}
        items={[
          { key: "queue", label: "Queue", href: "#", icon: <Inbox /> },
          { key: "orders", label: "Orders", href: "#", icon: <ListOrdered /> },
          { key: "messages", label: "Messages", href: "#", icon: <MessageSquare /> },
          { key: "more", label: "More", href: "#", icon: <ShieldCheck /> },
        ]}
      />
    </div>
  );
}

export function ClientSample() {
  return (
    <div className="min-h-screen bg-[color:var(--app-ground)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <span className="text-[17px] font-semibold tracking-[-0.02em]">The CAD Pillar</span>
          <LiveCallButton hours="TODO hours" className="hidden sm:inline-flex" />
          <LiveCallButton hours="TODO hours" compact className="sm:hidden" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-28 pt-6">
        <PageHeader eyebrow="Meera Jewels (sample)" title="Good morning" description="One design is ready for you to look at." actions={<Button>New order</Button>} />
        <section className="rounded-[var(--r-lg)] border-2 border-foreground bg-card p-5 shadow-[var(--e-1)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <StatusPill tone="attention">Ready for you</StatusPill>
              <p className="mt-3 text-[20px] font-semibold tracking-[-0.01em]">Halo engagement ring</p>
              <p className="font-mono text-[14px] text-muted-foreground">MJ1-RN-C-10</p>
            </div>
          </div>
          <p className="mt-2 text-[16px] text-muted-foreground">Your first look is ready. Approve it or ask for changes.</p>
          <Button size="lg" className="mt-4 w-full sm:w-auto">Review the design</Button>
        </section>
        <section className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
          <h2 className="border-b border-border px-5 py-3 text-[18px]">In progress</h2>
          {[
            ["Kapoor solitaire", "MJ1-RN-C-2", "In design", inMinutes(190)],
            ["Mehta anniversary halo", "MJ1-RN-C-1", "In design", inMinutes(320)],
          ].map(([n, r, s, d]) => (
            <div key={r} className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-[18px] font-medium">{n}</p>
                <p className="font-mono text-[14px] text-muted-foreground">{r}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusPill tone="info">{s}</StatusPill>
                <SlaCountdown dueAt={d!} />
              </div>
            </div>
          ))}
        </section>
      </main>
      <MobileBottomNav
        activeKey="home"
        create={{ href: "#", label: "New order" }}
        items={[
          { key: "home", label: "Home", href: "#", icon: <Inbox /> },
          { key: "orders", label: "Orders", href: "#", icon: <ListOrdered /> },
          { key: "messages", label: "Messages", href: "#", icon: <MessageSquare /> },
          { key: "files", label: "Files", href: "#", icon: <FileText /> },
        ]}
      />
    </div>
  );
}
