import { auth } from "@clerk/nextjs/server";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDay } from "@/core";
import type { OutreachTemplate } from "@/core/outreach";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { cn } from "@/lib/utils";

import { Compose, type ComposeContact, type ComposeSender } from "../Compose";
import { OutreachNav, OutreachUnavailable } from "../shared";
import { contactTitle } from "../types";

export const dynamic = "force-dynamic";

type TodayContact = ComposeContact & {
  fit: string | null;
  stage: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  step: number;
  sender: ComposeSender | null;
};

interface Today {
  is_admin: boolean;
  due: TodayContact[];
  start: TodayContact[];
  senders: { id: string; label: string; channel: string; address: string; daily_limit: number; sent_today: number; due: number }[];
  no_sender: number;
}

function Row({ c, templates, myName, tz, due }: { c: TodayContact; templates: OutreachTemplate[]; myName: string | null; tz: string; due: boolean }) {
  return (
    <li className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-[var(--s-4)]">
          <span className="min-w-0">
            <span className="font-medium">{contactTitle(c)}</span>
            <span className="block text-[length:var(--fs-2)] text-muted-foreground">
              {[c.business_name && c.contact_name, c.email ?? c.whatsapp ?? c.phone ?? (c.instagram ? `@${c.instagram}` : null), c.city]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2 text-[length:var(--fs-2)]">
            <Badge variant={due ? "default" : "outline"}>Message {c.step} of 3</Badge>
            {c.fit && <Badge variant="muted">Fit {c.fit}</Badge>}
            {due && c.next_follow_up_at && <span className="text-muted-foreground">due {formatDay(c.next_follow_up_at, tz)}</span>}
            {c.sender && <span className="text-muted-foreground">from {c.sender.label}</span>}
            <span className="font-medium underline underline-offset-2 group-open:hidden">Write</span>
            <span className="hidden font-medium underline underline-offset-2 group-open:inline">Close</span>
          </span>
        </summary>
        <div className="border-t border-border p-[var(--s-4)]">
          <Compose contact={c} sender={c.sender} templates={templates} myName={myName} />
          <p className="mt-3 text-[length:var(--fs-2)]">
            <Link href={`/admin/outreach/${c.id}`} className="underline underline-offset-2">Open the contact</Link>
          </p>
        </div>
      </details>
    </li>
  );
}

export default async function OutreachTodayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const tz = await viewerZone();
  const supabase = await createUserSupabaseClient();
  const [today, templates, me] = await Promise.all([
    supabase.rpc("outreach_today"),
    supabase.rpc("outreach_templates_list"),
    supabase.from("staff_profiles").select("first_name").eq("user_id", userId).maybeSingle(),
  ]);
  const err = today.error ?? templates.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const t = today.data as Today;
  const tpl = (templates.data ?? []) as OutreachTemplate[];
  const myName = (me.data as { first_name?: string } | null)?.first_name ?? null;
  const total = t.due.length + t.start.length;

  return (
    <Page>
      <PageHeader
        title="Today"
        description="Follow-ups due, then new contacts up to each sender's daily limit. Open one, send it from Gmail or WhatsApp, then mark it sent."
      />
      <OutreachNav current="today" isAdmin={t.is_admin} />

      {t.senders.length > 0 && (
        <section aria-label="Senders today" className="flex flex-wrap gap-2">
          {t.senders.map((s) => {
            const used = s.sent_today + s.due;
            return (
              <span
                key={s.id}
                className={cn(
                  "rounded-full border px-3 py-1 text-[length:var(--fs-2)]",
                  used >= s.daily_limit ? "border-[color:var(--border-strong)] font-medium" : "border-border text-muted-foreground",
                )}
              >
                {s.label}: {s.sent_today} sent · {s.due} due · limit {s.daily_limit}
              </span>
            );
          })}
        </section>
      )}

      {t.no_sender > 0 && t.is_admin && (
        <Card className="p-[var(--s-4)] text-[length:var(--fs-2)]">
          {t.no_sender} new contact{t.no_sender === 1 ? " has" : "s have"} no sender, so they are not offered here.{" "}
          <Link href="/admin/outreach/senders" className="underline underline-offset-2">Add a sender</Link>, then import again or hand them
          over from a contact page.
        </Card>
      )}

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarCheck />}
            title="Nothing left for today"
            description={t.senders.length === 0 ? "Add a sender first, then import a list." : "Every follow-up is done and each sender has reached its limit, or the lists are empty."}
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Follow-ups due ({t.due.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {t.due.length === 0 ? (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">None due today.</p>
              ) : (
                <ul className="space-y-3">
                  {t.due.map((c) => (
                    <Row key={c.id} c={c} templates={tpl} myName={myName} tz={tz} due />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Start today ({t.start.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {t.start.length === 0 ? (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">No new contacts left within today&apos;s limits.</p>
              ) : (
                <ul className="space-y-3">
                  {t.start.map((c) => (
                    <Row key={c.id} c={c} templates={tpl} myName={myName} tz={tz} due={false} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </Page>
  );
}
