import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { ContactForm } from "../ContactForm";
import { OutreachNav, OutreachUnavailable } from "../shared";
import type { SenderRow } from "../types";

export const dynamic = "force-dynamic";

export default async function NewOutreachContactPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const [senders, dash] = await Promise.all([supabase.rpc("outreach_senders_list"), supabase.rpc("outreach_dashboard")]);
  const err = senders.error ?? dash.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const active = ((senders.data ?? []) as SenderRow[]).filter((s) => s.active);

  return (
    <Page form>
      <PageHeader title="Add a contact" description="Someone you know, or a business you found. Clients and repeats are refused." />
      <OutreachNav current="new" isAdmin={(dash.data as { is_admin: boolean }).is_admin} />
      <Card>
        <CardBody>
          <ContactForm senders={active.map((s) => ({ id: s.id, label: `${s.label} (${s.address})` }))} />
        </CardBody>
      </Card>
    </Page>
  );
}
