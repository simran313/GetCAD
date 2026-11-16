import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { segmentLabel } from "@/core/outreach";
import { FITS, placeOf, searchLinks } from "@/core/outreach/research";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { OutreachNav, OutreachUnavailable, td, th } from "../shared";
import { AreaForm, AreaStatus } from "./AreaForm";
import { Capture } from "./Capture";

export const dynamic = "force-dynamic";

interface AreaRow {
  id: string;
  segment: string;
  city: string;
  region: string | null;
  country: string;
  status: string;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  prospects: number;
  contacted: number;
  replied: number;
  added_7d: number;
}

interface Stats {
  mine_today: number;
  with_detail: number;
  prospects: number;
  by_person: { name: string; n: number }[];
}

const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)]">
      <p className="text-[length:var(--fs-2)] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">{value}</p>
      {note && <p className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Research: choose an area, search it by hand, capture each prospect with a real detail and a fit grade. */
export default async function OutreachResearchPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const sp = await searchParams;
  const supabase = await createUserSupabaseClient();
  const [areas, stats, dash] = await Promise.all([
    supabase.rpc("outreach_areas_list"),
    supabase.rpc("outreach_research_stats"),
    supabase.rpc("outreach_dashboard"),
  ]);
  const err = areas.error ?? stats.error ?? dash.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const isAdmin = (dash.data as { is_admin: boolean }).is_admin;
  const list = ((areas.data ?? []) as AreaRow[]).map((a) => ({ ...a, prospects: Number(a.prospects), added_7d: Number(a.added_7d) }));
  const s = stats.data as Stats;
  const current = list.find((a) => a.id === sp.area) ?? null;
  const canEdit = (a: AreaRow) => isAdmin || !a.owner_id || a.owner_id === userId;
  const detailShare = s.prospects > 0 ? Math.round((Number(s.with_detail) / Number(s.prospects)) * 100) : null;

  return (
    <Page>
      <PageHeader
        title="Research"
        description="Find prospects by hand from public sources: choose an area, open the searches, and capture each business with a real detail and a fit grade."
      />
      <OutreachNav current="research" isAdmin={isAdmin} />

      <section aria-label="Research so far" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Added by you today" value={s.mine_today} note="Aim for 20–30 good ones" />
        <Stat label="Prospects" value={s.prospects} note={isAdmin ? "on every list" : "you own"} />
        <Stat label="With a real detail" value={detailShare === null ? "—" : `${detailShare}%`} note="Personal first lines get more replies" />
        <Stat
          label="Last 7 days"
          value={s.by_person.reduce((n, p) => n + Number(p.n), 0)}
          note={s.by_person.length > 0 ? s.by_person.map((p) => `${p.name} ${p.n}`).join(" · ") : "added by research"}
        />
      </section>

      {current ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>
                {segmentLabel(current.segment)} · {placeOf(current)}
              </CardTitle>
              <span className="flex items-center gap-3 text-[length:var(--fs-2)]">
                <AreaStatus area={current} canEdit={canEdit(current)} />
                <Link href="/admin/outreach/research" className="underline underline-offset-2">All areas</Link>
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                Open a search, go through the results one by one, and capture each business that fits below. Each opens in a new tab;
                nothing is collected automatically.
              </p>
              <ul className="flex flex-wrap gap-2">
                {searchLinks(current).map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--fs-2)] transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{l.source}</span>
                      <span className="text-muted-foreground">{l.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capture a prospect</CardTitle>
            </CardHeader>
            <CardBody>
              <Capture area={current} />
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Start an area</CardTitle>
          </CardHeader>
          <CardBody>
            <AreaForm taken={list.map((a) => `${a.segment}|${a.city.toLowerCase()}|${(a.region ?? "").toLowerCase()}`)} />
          </CardBody>
        </Card>
      )}

      <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Research areas">
        <CardHeader>
          <CardTitle>Areas</CardTitle>
        </CardHeader>
        {list.length === 0 ? (
          <CardBody className="text-[length:var(--fs-2)] text-muted-foreground">No areas yet. Start with one above.</CardBody>
        ) : (
          <table className="w-full text-left text-[length:var(--fs-2)]">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {["Area", "Status", "Who", "Prospects", "7 days", "Written to", "Replied", ""].map((h, i) => (
                  <th key={h || i} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className={cn("border-b border-border last:border-b-0", a.id === current?.id && "bg-accent/40")}>
                  <td className={td}>
                    <span className="font-medium">{placeOf(a)}</span>
                    <span className="block text-muted-foreground">{segmentLabel(a.segment)}</span>
                  </td>
                  <td className={td}>
                    {canEdit(a) ? <AreaStatus area={a} canEdit /> : <Badge variant={a.status === "DONE" ? "muted" : "outline"}>{STATUS[a.status]}</Badge>}
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>{a.owner_name ?? "Nobody yet"}</td>
                  <td className={cn(td, "tabular")}>{a.prospects}</td>
                  <td className={cn(td, "tabular")}>{a.added_7d}</td>
                  <td className={cn(td, "tabular")}>{a.contacted}</td>
                  <td className={cn(td, "tabular")}>{a.replied}</td>
                  <td className={td}>
                    {canEdit(a) ? (
                      <Link href={`/admin/outreach/research?area=${a.id}`} className="font-medium underline underline-offset-2">
                        {a.id === current?.id ? "Working" : "Work this area"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Taken</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Start another area</CardTitle>
          </CardHeader>
          <CardBody>
            <AreaForm taken={list.map((a) => `${a.segment}|${a.city.toLowerCase()}|${(a.region ?? "").toLowerCase()}`)} />
          </CardBody>
        </Card>
      )}

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-[var(--s-5)]">
            <CardTitle>How to research well</CardTitle>
            <span className="text-[length:var(--fs-2)] underline underline-offset-2">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <CardBody className="space-y-4 pt-0 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
            <div>
              <p className="font-medium">Grade every business</p>
              <ul className="mt-1 list-inside list-disc">
                {FITS.map(([v, l, why]) => (
                  <li key={v}>
                    <span className="font-medium">
                      {v}, {l.toLowerCase()}:
                    </span>{" "}
                    {why}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Finding the email</p>
              <p>
                The website&apos;s Contact or About page, the Instagram bio (the Email button on a business profile), the Google Maps listing,
                or the Facebook page&apos;s About tab. Use the address the business publishes; never guess one. No email? Save the phone,
                WhatsApp or Instagram instead.
              </p>
            </div>
            <div>
              <p className="font-medium">The real detail</p>
              <p>
                One specific thing from their recent posts or site that finishes &ldquo;I saw &hellip;&rdquo;: &ldquo;the oval halo you
                posted on Tuesday&rdquo;, &ldquo;your design-your-own-ring page&rdquo;. It goes straight into message 1, so it is worth 30
                seconds.
              </p>
            </div>
            <div>
              <p className="font-medium">Rules</p>
              <ul className="mt-1 list-inside list-disc">
                <li>Public business information only, found and typed by hand. No scraping tools, no bought lists.</li>
                <li>Business contacts only: the shop&apos;s address, phone and published email, not someone&apos;s personal details.</li>
                <li>If the portal says a business is already in outreach or a client, skip it.</li>
              </ul>
            </div>
          </CardBody>
        </details>
      </Card>
    </Page>
  );
}
