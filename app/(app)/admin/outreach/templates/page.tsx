import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { type OutreachTemplate, SENDER_CHANNELS, kindLabel, replyRate, segmentLabel } from "@/core/outreach";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { OutreachNav, OutreachUnavailable } from "../shared";
import { TemplateEdit, TemplateForm } from "./TemplateForm";

export const dynamic = "force-dynamic";

type Row = OutreachTemplate & { sent: number; replied: number };

export default async function OutreachTemplatesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const [templates, dash] = await Promise.all([supabase.rpc("outreach_templates_list"), supabase.rpc("outreach_dashboard")]);
  const err = templates.error ?? dash.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const isAdmin = (dash.data as { is_admin: boolean }).is_admin;
  const rows = (templates.data ?? []) as Row[];

  return (
    <Page>
      <PageHeader
        title="Templates"
        description="The messages for each channel and step. The right one is picked for each contact by list and business type."
      />
      <OutreachNav current="templates" isAdmin={isAdmin} />

      {SENDER_CHANNELS.map(([ch, label]) => {
        const list = rows.filter((t) => t.channel === ch);
        if (list.length === 0) return null;
        return (
          <section key={ch} aria-label={label} className="space-y-3">
            <h2 className="text-[length:var(--fs-4)] font-semibold">{label}</h2>
            {list.map((t) => {
              const rate = replyRate(Number(t.sent), Number(t.replied));
              return (
                <Card key={t.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-[length:var(--fs-2)] text-muted-foreground">
                          Message {t.step} · {t.list === "ANY" ? "both lists" : kindLabel(t.list).toLowerCase()}
                          {t.segment ? ` · ${segmentLabel(t.segment).toLowerCase()}` : ""} · sent {t.sent}× · {t.replied} replied
                          {rate !== null ? ` (${rate}%)` : ""}
                        </p>
                      </div>
                      {!t.active && <Badge variant="muted">Off</Badge>}
                    </div>
                    {t.subject && <p className="text-[length:var(--fs-2)]">Subject: {t.subject}</p>}
                    <p className="line-clamp-4 whitespace-pre-wrap text-[length:var(--fs-2)] text-muted-foreground">{t.body}</p>
                    {isAdmin && <TemplateEdit template={t} />}
                  </CardBody>
                </Card>
              );
            })}
          </section>
        );
      })}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Add a template</CardTitle>
          </CardHeader>
          <CardBody>
            <TemplateForm />
          </CardBody>
        </Card>
      )}
    </Page>
  );
}
