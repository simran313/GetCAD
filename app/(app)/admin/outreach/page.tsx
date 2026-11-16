import { auth } from "@clerk/nextjs/server";
import { Send } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDay, formatRelative } from "@/core";
import { KINDS, STAGES, kindLabel, replyRate, stageLabel } from "@/core/outreach";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { cn } from "@/lib/utils";

import { OutreachNav, OutreachUnavailable, td, th } from "./shared";
import { type ContactRow, type Dashboard, contactTitle } from "./types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = { list?: string; stage?: string; sender?: string; q?: string; page?: string };

/** The list filters as a query string, with one changed. */
function href(current: Search, change: Partial<Search>): string {
  const next = { ...current, ...change };
  if (!("page" in change)) delete next.page;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
  const s = p.toString();
  return `/admin/outreach${s ? `?${s}` : ""}`;
}

function Pill({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-[length:var(--fs-2)] leading-[var(--lh-2)] transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)]">
      <p className="text-[length:var(--fs-2)] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">{value}</p>
      {note && <p className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{note}</p>}
    </div>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function OutreachPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const tz = await viewerZone();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const due = sp.stage === "DUE";

  const supabase = await createUserSupabaseClient();
  const [dash, list] = await Promise.all([
    supabase.rpc("outreach_dashboard"),
    supabase.rpc("outreach_contacts_list", {
      p_kind: sp.list || null,
      p_stage: due ? null : sp.stage || null,
      p_sender_id: sp.sender || null,
      p_owner_id: null,
      p_search: sp.q || null,
      p_due: due,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  if (dash.error) return <OutreachUnavailable message={dash.error.message} />;
  if (list.error) return <OutreachUnavailable message={list.error.message} />;

  const d = dash.data as Dashboard;
  const rows = (list.data ?? []) as ContactRow[];
  const total = Number(rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const t = d.totals;
  const won = d.conversion.reduce((s, c) => s + Number(c.signed_up), 0);
  const ordered = d.conversion.reduce((s, c) => s + Number(c.ordered), 0);
  const value = d.conversion.reduce((s, c) => s + Number(c.order_value ?? 0), 0);
  const funnel = (kind: string, stage: string) => d.funnel.find((f) => f.kind === kind && f.stage === stage)?.n ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={d.is_admin ? "Every contact, every sender" : "Your contacts"}
        title="Outreach"
        description="Who the team writes to, from which address, and what came back."
      />
      <OutreachNav current="dashboard" isAdmin={d.is_admin} />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Contacts" value={t.contacts} note={`${t.existing} existing · ${t.prospects} prospects`} />
        <Stat label="Due to follow up" value={t.due} note={<Link className="underline underline-offset-2" href={href(sp, { stage: "DUE" })}>Show them</Link>} />
        <Stat label="Sent today" value={t.sent_today} note={`${t.sent_7d} in 7 days`} />
        <Stat label="Replied" value={t.replied} note={`${pct(replyRate(Number(t.contacted), Number(t.replied)))} of ${t.contacted} written to`} />
        <Stat
          label="Became clients"
          value={won}
          note={`${ordered} ordered${d.is_admin && value > 0 ? ` · ${formatMoney(value, "USD")}` : ""}`}
        />
      </section>

      {d.senders.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>Senders</CardTitle>
          </CardHeader>
          <table className="w-full text-left text-[length:var(--fs-2)]">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {["Sender", "Contacts", "Today", "7 days", "Written to", "Replied", "Reply rate", "Clients"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.senders.map((s) => (
                <tr key={s.id} className={cn("border-b border-border last:border-b-0", !s.active && "text-muted-foreground")}>
                  <td className={td}>
                    <Link href={href(sp, { sender: s.id })} className="font-medium underline-offset-2 hover:underline">{s.label}</Link>
                    <span className="block text-muted-foreground">
                      {s.address}
                      {s.owner_name && ` · ${s.owner_name}`}
                      {!s.active && " · paused"}
                    </span>
                  </td>
                  <td className={cn(td, "tabular")}>{s.contacts}</td>
                  <td className={cn(td, "tabular", s.sent_today >= s.daily_limit && "font-semibold")}>
                    {s.sent_today}/{s.daily_limit}
                  </td>
                  <td className={cn(td, "tabular")}>{s.sent_7d}</td>
                  <td className={cn(td, "tabular")}>{s.contacted}</td>
                  <td className={cn(td, "tabular")}>{s.replied}</td>
                  <td className={cn(td, "tabular")}>{pct(replyRate(Number(s.contacted), Number(s.replied)))}</td>
                  <td className={cn(td, "tabular")}>{s.clients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>Where each list stands</CardTitle>
          </CardHeader>
          <table className="w-full text-left text-[length:var(--fs-2)]">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className={th}>Stage</th>
                {KINDS.map(([k, l]) => (
                  <th key={k} className={th}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAGES.map(([s, l]) => (
                <tr key={s} className="border-b border-border last:border-b-0">
                  <td className={td}>
                    <Link href={href(sp, { stage: s })} className="underline-offset-2 hover:underline">{l}</Link>
                  </td>
                  {KINDS.map(([k]) => (
                    <td key={k} className={cn(td, "tabular")}>{funnel(k, s)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className={cn(td, "text-muted-foreground")}>
                  <Link href={href(sp, { stage: "DNC" })} className="underline-offset-2 hover:underline">Do not contact</Link>
                </td>
                <td className={cn(td, "tabular text-muted-foreground")} colSpan={KINDS.length}>{t.do_not_contact}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {d.is_admin && d.owners.length > 0 ? (
          <Card className="overflow-x-auto">
            <CardHeader>
              <CardTitle>Who works them</CardTitle>
            </CardHeader>
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {["Person", "Contacts", "Written to", "Replied", "Due"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.owners.map((o) => (
                  <tr key={o.owner_id ?? "none"} className="border-b border-border last:border-b-0">
                    <td className={td}>{o.name}</td>
                    <td className={cn(td, "tabular")}>{o.contacts}</td>
                    <td className={cn(td, "tabular")}>{o.contacted}</td>
                    <td className={cn(td, "tabular")}>{o.replied}</td>
                    <td className={cn(td, "tabular")}>{o.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Became clients</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[length:var(--fs-2)]">
              {d.conversion.length === 0 ? (
                <p className="text-muted-foreground">Nobody yet. A contact counts once they open an account with the same email.</p>
              ) : (
                d.conversion.map((c) => (
                  <p key={c.kind}>
                    {kindLabel(c.kind)}: {c.signed_up} signed up · {c.verified} verified · {c.ordered} ordered
                  </p>
                ))
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <section aria-label="Contacts" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill to={href(sp, { list: "" })} active={!sp.list}>All lists</Pill>
          {KINDS.map(([k, l]) => (
            <Pill key={k} to={href(sp, { list: k })} active={sp.list === k}>{l}</Pill>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Pill to={href(sp, { stage: "" })} active={!sp.stage}>Any stage</Pill>
          <Pill to={href(sp, { stage: "DUE" })} active={due}>Due</Pill>
          {STAGES.map(([s, l]) => (
            <Pill key={s} to={href(sp, { stage: s })} active={sp.stage === s}>{l}</Pill>
          ))}
          <Pill to={href(sp, { stage: "DNC" })} active={sp.stage === "DNC"}>Do not contact</Pill>
        </div>

        <form role="search" className="flex flex-wrap items-center gap-3">
          {sp.list && <input type="hidden" name="list" value={sp.list} />}
          {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
          {sp.sender && <input type="hidden" name="sender" value={sp.sender} />}
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email, city, tag" aria-label="Search contacts" className="w-full sm:w-80" />
          {sp.sender && (
            <Link href={href(sp, { sender: "" })} className="text-[length:var(--fs-2)] underline underline-offset-2">
              Sender: {d.senders.find((s) => s.id === sp.sender)?.label ?? "none"} ×
            </Link>
          )}
          <span className="text-[length:var(--fs-2)] text-muted-foreground">{total} contacts</span>
        </form>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Send />}
              title={t.contacts === 0 ? "No contacts yet" : "Nobody matches"}
              description={t.contacts === 0 ? "Import a list or add a contact to start." : "Try another list, stage or search."}
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {["Contact", "Stage", "Sender", "Last touch", "Follow up", ...(d.is_admin ? ["Owner"] : [])].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className={td}>
                      <Link href={`/admin/outreach/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                        {contactTitle(c)}
                      </Link>
                      <span className="block text-muted-foreground">
                        {[c.business_name && c.contact_name, c.email, [c.city, c.region, c.country].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-1">
                        {c.do_not_contact ? <Badge variant="muted">Do not contact</Badge> : <Badge>{stageLabel(c.stage)}</Badge>}
                        {c.conversion && <Badge variant="default">{c.conversion.orders > 0 ? "Ordered" : c.conversion.verified ? "Client" : "Signed up"}</Badge>}
                        <span className="text-muted-foreground">{c.kind === "EXISTING" ? "existing" : "prospect"}</span>
                      </span>
                    </td>
                    <td className={cn(td, "text-muted-foreground")}>{c.sender_label ?? "—"}</td>
                    <td className={cn(td, "text-muted-foreground")}>
                      {c.last_contacted_at ? `${formatRelative(c.last_contacted_at, tz)} · ${c.touches}×` : "Never"}
                    </td>
                    <td className={cn(td, c.next_follow_up_at && new Date(c.next_follow_up_at) <= new Date() ? "font-semibold" : "text-muted-foreground")}>
                      {c.next_follow_up_at ? formatDay(c.next_follow_up_at, tz) : "—"}
                    </td>
                    {d.is_admin && <td className={cn(td, "text-muted-foreground")}>{c.owner_name ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-3 text-[length:var(--fs-2)]">
            {page > 1 && <Link className="underline underline-offset-2" href={href(sp, { page: String(page - 1) })}>Previous</Link>}
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            {page < pages && <Link className="underline underline-offset-2" href={href(sp, { page: String(page + 1) })}>Next</Link>}
          </nav>
        )}
      </section>
    </Page>
  );
}
