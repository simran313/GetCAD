import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { kindLabel } from "@/core/outreach";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { OutreachNav, OutreachUnavailable } from "../shared";
import type { SenderRow, TeamMember } from "../types";
import { SenderEdit, SenderForm } from "./SenderForm";

export const dynamic = "force-dynamic";

export default async function OutreachSendersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const [senders, team] = await Promise.all([supabase.rpc("outreach_senders_list"), supabase.rpc("outreach_team")]);
  const err = senders.error ?? team.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const list = (senders.data ?? []) as SenderRow[];
  const people = (team.data ?? []) as TeamMember[];

  return (
    <Page>
      <PageHeader
        title="Senders"
        description="The addresses the team writes from. Imports share contacts evenly between the active ones, so their replies can be compared."
      />
      <OutreachNav current="senders" isAdmin />

      {list.map((s) => (
        <Card key={s.id}>
          <CardBody className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {s.label} <span className="font-normal text-muted-foreground">· {s.address}</span>
                </p>
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  {s.channel.toLowerCase()} · {s.for_kind === "ANY" ? "both lists" : kindLabel(s.for_kind).toLowerCase()} · {s.daily_limit} a day ·{" "}
                  {s.contacts} contacts · {s.sent_today} sent today{s.owner_name ? ` · ${s.owner_name}` : ""}
                </p>
              </div>
              {!s.active && <Badge variant="muted">Paused</Badge>}
            </div>
            <SenderEdit sender={s} team={people} />
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Add a sender</CardTitle>
        </CardHeader>
        <CardBody>
          <SenderForm team={people} />
        </CardBody>
      </Card>
    </Page>
  );
}
