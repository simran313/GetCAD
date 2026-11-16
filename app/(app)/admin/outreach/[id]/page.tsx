import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatDate, formatDateTime } from "@/core";
import { type OutreachTemplate, channelLabel, gmailComposeUrl, instagramUrl, kindLabel, segmentLabel, stageLabel, websiteUrl, whatsappUrl } from "@/core/outreach";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

import { OutreachUnavailable } from "../shared";
import { type ContactDetail, type SenderRow, type TeamMember, contactTitle } from "../types";
import { fitLabel } from "@/core/outreach/research";
import { Compose } from "../Compose";
import { ContactSide, LogTouch } from "./ContactActions";

export const dynamic = "force-dynamic";

const ACTIVITY: Record<string, string> = {
  IMPORTED: "Imported",
  CREATED: "Added",
  EDITED: "Details edited",
  NOTE: "Note",
  SENT: "Wrote to them",
  REPLIED: "They replied",
  STAGE: "Stage",
  ASSIGNED: "Handed over",
  DNC: "Do not contact",
};

export default async function OutreachContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const tz = await viewerZone();
  const supabase = await createUserSupabaseClient();

  const [contact, senders, dash, templates, me] = await Promise.all([
    supabase.rpc("outreach_contact", { p_id: id }),
    supabase.rpc("outreach_senders_list"),
    supabase.rpc("outreach_dashboard"),
    supabase.rpc("outreach_templates_list"),
    supabase.from("staff_profiles").select("first_name").eq("user_id", userId).maybeSingle(),
  ]);
  if (contact.error && /no such contact/i.test(contact.error.message)) notFound();
  const err = contact.error ?? senders.error ?? dash.error ?? templates.error;
  if (err) return <OutreachUnavailable message={err.message} />;

  const c = contact.data as ContactDetail;
  const isAdmin = (dash.data as { is_admin: boolean }).is_admin;
  const team = isAdmin ? (((await supabase.rpc("outreach_team")).data ?? []) as TeamMember[]) : [];
  const allSenders = (senders.data ?? []) as SenderRow[];
  const emailFrom = c.sender?.channel === "EMAIL" ? c.sender.address : null;
  const greeting = c.contact_name ? `Hi ${c.contact_name.split(" ")[0]},\n\n` : "";
  const signature = c.sender?.signature ? `\n\n${c.sender.signature}` : "";
  const wa = whatsappUrl(c.whatsapp ?? c.phone ?? "");
  const site = c.website ? websiteUrl(c.website) : null;
  const place = [c.city, c.region, c.country].filter(Boolean).join(", ");

  const reach: { href: string; label: string; external?: boolean }[] = [];
  if (c.email && !c.do_not_contact) {
    reach.push({ href: gmailComposeUrl(c.email, { from: emailFrom, body: `${greeting}${signature}`.trim() ? `${greeting}${signature}` : undefined }), label: emailFrom ? `Gmail from ${emailFrom}` : "Write in Gmail", external: true });
  }
  if (wa && !c.do_not_contact) reach.push({ href: wa, label: "WhatsApp", external: true });
  if (c.instagram) reach.push({ href: instagramUrl(c.instagram), label: `@${c.instagram}`, external: true });
  if (c.linkedin && websiteUrl(c.linkedin)) reach.push({ href: websiteUrl(c.linkedin)!, label: "LinkedIn", external: true });
  if (site) reach.push({ href: site, label: "Website", external: true });

  return (
    <Page>
      <p className="text-[length:var(--fs-2)]">
        <Link href="/admin/outreach" className="text-muted-foreground underline-offset-2 hover:underline">← Outreach</Link>
      </p>
      <PageHeader
        eyebrow={kindLabel(c.kind)}
        title={contactTitle(c)}
        description={[c.business_name && c.contact_name, place, c.segment && segmentLabel(c.segment)].filter(Boolean).join(" · ") || undefined}
        actions={
          <span className="flex flex-wrap gap-1.5">
            {c.do_not_contact ? <Badge variant="muted">Do not contact</Badge> : <Badge>{stageLabel(c.stage)}</Badge>}
            {c.conversion && <Badge variant="default">{c.conversion.orders > 0 ? "Ordered" : c.conversion.verified ? "Client" : "Signed up"}</Badge>}
          </span>
        }
      />

      {reach.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reach.map((r) => (
            <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {r.label}
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody className="grid gap-x-6 gap-y-3 text-[length:var(--fs-2)] sm:grid-cols-2">
              {[
                ["Email", c.email],
                ["Phone", c.phone],
                ["WhatsApp", c.whatsapp],
                ["Sender", c.sender ? `${c.sender.label} (${c.sender.address})` : null],
                ["Owner", c.owner_name],
                ["Written to", c.touches > 0 ? `${c.touches}×, last ${c.last_contacted_at ? formatDate(c.last_contacted_at, tz) : ""}` : "Not yet"],
                ["Follow up", c.next_follow_up_at ? formatDate(c.next_follow_up_at, tz) : null],
                ["Replied", c.replied_at ? formatDate(c.replied_at, tz) : null],
                ["Fit", c.fit ? `${c.fit}: ${fitLabel(c.fit)}` : null],
                ["Real detail", c.detail],
                ["Source", c.source],
                ["Tags", c.tags.length ? c.tags.join(", ") : null],
                ["Added", formatDate(c.created_at, tz)],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <p className="text-muted-foreground">{k}</p>
                  <p className="break-words">{v || "—"}</p>
                </div>
              ))}
              {c.notes && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap break-words">{c.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {c.conversion && (
            <Card>
              <CardHeader>
                <CardTitle>In the portal</CardTitle>
              </CardHeader>
              <CardBody className="text-[length:var(--fs-2)]">
                Signed up {formatDate(c.conversion.signed_up_at, tz)} · {c.conversion.verified ? "verified" : "waiting for verification"} ·{" "}
                {c.conversion.orders} order{c.conversion.orders === 1 ? "" : "s"}
                {c.conversion.first_order_at && `, first ${formatDate(c.conversion.first_order_at, tz)}`}
                {c.conversion.order_value !== null && c.conversion.order_value > 0 && ` · ${formatMoney(c.conversion.order_value, "USD")}`}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Write the next message</CardTitle>
            </CardHeader>
            <CardBody>
              <Compose
                contact={c}
                sender={c.sender}
                templates={(templates.data ?? []) as OutreachTemplate[]}
                myName={(me.data as { first_name?: string } | null)?.first_name ?? null}
              />
            </CardBody>
          </Card>

          <LogTouch contact={c} senders={allSenders.filter((s) => s.active)} />

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-4">
                {c.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-border pl-4 text-[length:var(--fs-2)]">
                    <p>
                      <span className="font-medium">{ACTIVITY[a.kind] ?? a.kind}</span>
                      {a.channel && ` · ${channelLabel(a.channel)}`}
                      {a.sender_label && ` · ${a.sender_label}`}
                    </p>
                    {a.body && <p className="mt-1 whitespace-pre-wrap break-words">{a.body}</p>}
                    <p className="mt-1 text-muted-foreground">
                      {formatDateTime(a.created_at, tz)}
                      {a.actor_name && ` · ${a.actor_name}`}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <ContactSide contact={c} senders={allSenders} team={team} isAdmin={isAdmin} />
      </div>
    </Page>
  );
}
