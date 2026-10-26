"use client";

import { Inbox, Package, Plus, Search } from "lucide-react";
import { useState } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyableID } from "@/components/ui/copyable-id";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputWithUnit } from "@/components/ui/input-suffix";
import { LiveCallButton } from "@/components/ui/live-call-button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusPill } from "@/components/ui/status-pill";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { Toaster, toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-14 first:border-0">
      <h2 className="text-[24px] leading-[1.25]">{title}</h2>
      {note && <p className="mt-1.5 max-w-2xl text-[16px] text-muted-foreground">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Frame({ src, width, height, scale }: { src: string; width: number; height: number; scale: number }) {
  return (
    <figure className="shrink-0">
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-background shadow-[var(--e-2)]" style={{ width: width * scale, height: height * scale }}>
        <iframe title={`${src} at ${width}`} src={src} width={width} height={height} loading="eager" className="origin-top-left border-0" style={{ transform: `scale(${scale})` }} />
      </div>
      <figcaption className="mt-2 text-[14px] text-muted-foreground tabular">
        {width} × {height}
      </figcaption>
    </figure>
  );
}

const SWATCHES: [string, string, string][] = [
  ["Ink", "--foreground", "#0A0A0A · text, primary"],
  ["Paper", "--background", "#FFFFFF · page, cards"],
  ["Ground", "--subtle", "#FAFAFA · app ground"],
  ["Fill", "--muted", "#F5F5F5 · fills, hover"],
  ["Secondary text", "--muted-foreground", "#525252 · 7.8:1"],
  ["Hairline", "--border", "#E5E5E5 · borders"],
  ["Control edge", "--input", "#858585 · 3.7:1"],
];
const TONES = ["neutral", "info", "attention", "success", "warning", "danger"] as const;
const TONE_NOTE: Record<(typeof TONES)[number], string> = {
  neutral: "Nothing happening",
  info: "In flight",
  attention: "Needs you",
  success: "Landed",
  warning: "SLA risk, < 1h",
  danger: "Wrong, or destructive",
};
const SCALE = [12, 14, 16, 18, 20, 24, 32, 40, 56, 72];

export function Preview() {
  const [palette, setPalette] = useState(false);
  const [density, setDensity] = useState("13.10");
  const saved = "13.10";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 md:px-8">
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Design preview</span>
          <span className="hidden text-[14px] text-muted-foreground sm:inline">The CAD Pillar · redesign step 3</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pb-40 md:px-8">
        <Section id="type" title="Type" note="Geist Sans everywhere (option A, chosen), headings 600 at −0.02em. Geist Mono only for references and IDs. Every number is tabular.">
          <div className="rounded-[var(--r-lg)] border border-border p-6">
            <p className="text-[40px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[56px]">Factory-ready jewelry CAD, checked twice.</p>
            <p className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">Every file is made to be cast.</p>
            <p className="mt-4 text-[18px] leading-[1.5] text-muted-foreground">Senior designers build every file to cast first time. Body copy at 16–18px for comfort at arm&apos;s length.</p>
            <p className="mt-4 text-[32px] font-semibold tracking-[-0.03em] tabular">$55 · 5h 42m · 19/19</p>
            <p className="mt-2 font-mono text-[14px] text-muted-foreground">MJ1-RN-C-10 · DSG-0001</p>
          </div>
          <ol className="mt-10 space-y-3">
            {SCALE.map((s) => (
              <li key={s} className="flex items-baseline gap-6 border-b border-border pb-3">
                <span className="w-12 shrink-0 font-mono text-[13px] text-muted-foreground">{s}</span>
                <span style={{ fontSize: s, lineHeight: s >= 32 ? 1.1 : 1.5 }} className={cn("truncate", s >= 20 ? "font-semibold tracking-[-0.02em]" : "")}>
                  Production-ready CAD
                </span>
              </li>
            ))}
          </ol>
          <p className="eyebrow mt-8">Eyebrow · 12px · uppercase only here</p>
        </Section>

        <Section id="colour" title="Colour" note="Black on white with pure neutral greys. Colour only carries meaning: six status tones, amber only for SLA risk, red only for errors and destructive confirmation.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map(([name, token, note]) => (
              <div key={token} className="overflow-hidden rounded-[var(--r-md)] border border-border">
                <div className="h-16" style={{ background: `hsl(var(${token}))` }} />
                <div className="p-2.5">
                  <p className="text-[14px] font-medium">{name}</p>
                  <p className="text-[13px] text-muted-foreground">{note}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {TONES.map((t) => (
              <div key={t} className="flex flex-col gap-1.5">
                <StatusPill tone={t}>{t[0]!.toUpperCase() + t.slice(1)}</StatusPill>
                <span className="text-[13px] text-muted-foreground">{TONE_NOTE[t]}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="space" title="Space, shape, depth, motion" note="4/8 spacing; sections 56–72px on a phone, 96–128px at desk. Hairlines at 8–12% ink. Two shadow levels. Motion 150–250ms ease-out, off under reduced motion.">
          <div className="flex flex-wrap items-end gap-3">
            {[4, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className="bg-foreground" style={{ width: Math.min(s, 64), height: s }} />
                <span className="font-mono text-[12px] text-muted-foreground">{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]"><p className="font-medium">Resting · e-1</p><p className="text-[14px] text-muted-foreground">Cards, rows, inputs</p></div>
            <div className="rounded-[var(--r-lg)] border border-border bg-card p-5 shadow-[var(--e-2)]"><p className="font-medium">Lifted · e-2</p><p className="text-[14px] text-muted-foreground">Menus, sheets, dialogs</p></div>
            <div className="group rounded-[var(--r-lg)] border border-border bg-card p-5 transition-transform duration-[var(--dur-base)] ease-out hover:-translate-y-1"><p className="font-medium">Motion · 200ms</p><p className="text-[14px] text-muted-foreground">Hover me</p></div>
          </div>
        </Section>

        <Section id="buttons" title="Buttons" note="One primary per view. Secondary for everything else, ghost for tertiary, destructive only inside a confirmation.">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary"><Plus /> With icon</Button>
            <Button size="sm" variant="secondary">Small</Button>
            <Button size="lg">Large</Button>
            <LiveCallButton hours="TODO hours" />
          </div>
          <div data-density="compact" className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-dashed border-border p-4">
            <span className="text-[14px] text-muted-foreground">Staff density:</span>
            <Button>Create order</Button>
            <Button variant="secondary">Export CSV</Button>
            <Button size="sm" variant="secondary">Assign</Button>
          </div>
        </Section>

        <Section id="status" title="Status" note="Sentence case and a dot; never uppercase. Every order status maps to one tone (core/orders/status).">
          <div className="flex flex-wrap gap-2">
            {["DRAFT", "SUBMITTED", "QUOTED", "PAYMENT_HELD", "ASSIGNED", "IN_PROGRESS", "QC_REVIEW", "REVISION_REQUESTED", "CLIENT_PREVIEW", "APPROVED", "DELIVERED", "DISPUTED", "CANCELLED"].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <SlaCountdown dueAt={null} />
            <SlaCountdown dueAt={inMinutes(236)} />
            <SlaCountdown dueAt={inMinutes(38)} />
            <SlaCountdown dueAt={inMinutes(-21)} />
          </div>
        </Section>

        <Section id="layout" title="Page header, cards, empty and loading">
          <div className="space-y-6 rounded-[var(--r-xl)] bg-[color:var(--app-ground)] p-4 sm:p-8">
            <PageHeader title="All orders" description="Every order the team can see, newest first." actions={<><Button variant="secondary">Export CSV</Button><Button>Create order</Button></>} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Nothing waiting</CardTitle></CardHeader>
                <EmptyState icon={<Inbox />} title="Nothing needs the team" description="New orders, payments and QC results land here as they happen." action={<Button variant="secondary">See all orders</Button>} />
              </Card>
              <Card>
                <CardHeader><CardTitle>Loading</CardTitle></CardHeader>
                <SkeletonRows rows={3} />
                <CardBody><Skeleton className="h-4 w-1/3" /></CardBody>
              </Card>
            </div>
          </div>
        </Section>

        <Section id="forms" title="Forms" note="Labels above, units beside the number, 48px controls on client screens.">
          <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
            <Field label="Business name" htmlFor="pv-biz"><Input id="pv-biz" placeholder="Meera Jewels" /></Field>
            <Field label="Came by" htmlFor="pv-src"><Select id="pv-src" defaultValue="whatsapp"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option></Select></Field>
            <Field label="14K gold density" htmlFor="pv-den" hint="Used for the weight sheet. 13.10 g/cm³ is typical.">
              <InputWithUnit id="pv-den" unit="g/cm³" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} />
            </Field>
            <Field label="First look promise" htmlFor="pv-sla"><InputWithUnit id="pv-sla" unit="hours" defaultValue="6" /></Field>
          </div>
        </Section>

        <Section id="overlays" title="Dialogs, sheets, toasts, Cmd+K, IDs" note="Destructive confirmations ask you to type the word. Sheets come up from the bottom on a phone and from the right at desk.">
          <div className="flex flex-wrap items-center gap-3">
            <ConfirmDialog
              trigger={<Button variant="secondary">Suspend account…</Button>}
              title="Suspend NA1?"
              description="They are signed out and cannot place orders until reinstated. Their orders and files are kept."
              confirmLabel="Suspend"
              typed="suspend"
              destructive
              onConfirm={() => toast("NA1 suspended")}
            />
            <Button variant="secondary" onClick={() => toast("Role changed to Pod lead")}>Show a toast</Button>
            <Sheet>
              <SheetTrigger asChild><Button variant="secondary">Open order drawer</Button></SheetTrigger>
              <SheetContent title="Halo engagement ring" description="MJ1-RN-C-10 · Ready to assign">
                <div className="space-y-4">
                  <StatusPill tone="attention">Ready to assign</StatusPill>
                  <SlaCountdown dueAt={inMinutes(48)} />
                  <p className="text-[16px] text-muted-foreground">Paid and confirmed. Pick a designer from Pod One.</p>
                  <Button className="w-full">Assign</Button>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="secondary" onClick={() => setPalette(true)}><Search /> Search · ⌘K</Button>
            <CopyableID value="user_3LBq9rdlPMeTrymYzqSxKxenELb" label="user ID" />
          </div>
          <CommandPalette
            open={palette}
            onOpenChange={setPalette}
            groups={[
              { heading: "Orders", items: [
                { id: "o1", label: "Halo engagement ring", hint: "MJ1-RN-C-10", icon: <Package />, onSelect: () => toast("Would open MJ1-RN-C-10", "info") },
                { id: "o2", label: "Eternity band", hint: "TF1-RN-C-9", icon: <Package />, onSelect: () => toast("Would open TF1-RN-C-9", "info") },
              ] },
              { heading: "Go to", items: [
                { id: "g1", label: "Queue", icon: <Inbox />, onSelect: () => toast("Would go to Queue", "info") },
                { id: "a1", label: "Create order", icon: <Plus />, onSelect: () => toast("Would open Create order", "info") },
              ] },
            ]}
          />
        </Section>

        <Section id="screens" title="Screens at 390 and 1440" note="Sample screens built from the components above (placeholder content).">
          {[
            ["Marketing", "/design-preview/frame?view=marketing"],
            ["Admin queue", "/design-preview/frame?view=portal"],
            ["Client home", "/design-preview/frame?view=client"],
          ].map(([label, src]) => (
            <div key={src} className="mb-12">
              <h3 className="mb-4 text-[18px]">{label}</h3>
              <div tabIndex={0} role="region" aria-label="Scrollable samples" className="flex gap-6 overflow-x-auto pb-4">
                <Frame src={src!} width={390} height={844} scale={0.75} />
                <Frame src={src!} width={1440} height={900} scale={0.55} />
              </div>
            </div>
          ))}
        </Section>

      </main>

      <StickySaveBar
        dirty={density !== saved}
        changes={[{ label: "14K density", before: `${saved} g/cm³`, after: `${density} g/cm³` }]}
        onDiscard={() => setDensity(saved)}
        onSave={() => toast("Saved (preview only)")}
      />
      <Toaster />
    </div>
  );
}
