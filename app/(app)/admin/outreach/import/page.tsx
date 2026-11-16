import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { formatDate } from "@/core";
import { kindLabel } from "@/core/outreach";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

import { OutreachNav, OutreachUnavailable, td, th } from "../shared";
import type { SenderRow } from "../types";
import { ImportFlow } from "./ImportFlow";

export const dynamic = "force-dynamic";

interface ImportRowSummary {
  id: string;
  kind: string;
  file_name: string | null;
  source: string | null;
  total: number;
  added: number;
  duplicates: number;
  skipped_clients: number;
  invalid: number;
  created_at: string;
  by_name: string | null;
}

export default async function OutreachImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const tz = await viewerZone();
  const supabase = await createUserSupabaseClient();
  const [senders, imports, dash] = await Promise.all([
    supabase.rpc("outreach_senders_list"),
    supabase.rpc("outreach_imports_list"),
    supabase.rpc("outreach_dashboard"),
  ]);
  const err = senders.error ?? imports.error ?? dash.error;
  if (err) return <OutreachUnavailable message={err.message} />;
  const isAdmin = (dash.data as { is_admin: boolean }).is_admin;
  const active = ((senders.data ?? []) as SenderRow[]).filter((s) => s.active);
  const past = (imports.data ?? []) as ImportRowSummary[];

  return (
    <Page>
      <PageHeader
        title="Import a list"
        description="A CSV saved from Excel or Google Sheets, or cells pasted from one. Repeats, existing clients and do-not-contact people are left out."
      />
      <OutreachNav current="import" isAdmin={isAdmin} />
      <ImportFlow senders={active.map((s) => ({ id: s.id, label: s.label, address: s.address, channel: s.channel, for_kind: s.for_kind }))} />

      {past.length > 0 && (
        <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Recent imports">
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <table className="w-full text-left text-[length:var(--fs-2)]">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {["When", "List", "File", "Rows", "Added", "Repeats", "Clients", "Unusable"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {past.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-b-0">
                  <td className={td}>
                    {formatDate(i.created_at, tz)}
                    {i.by_name && <span className="block text-muted-foreground">{i.by_name}</span>}
                  </td>
                  <td className={td}>{kindLabel(i.kind)}</td>
                  <td className={td}>
                    {i.file_name ?? "Pasted"}
                    {i.source && <span className="block text-muted-foreground">{i.source}</span>}
                  </td>
                  <td className={`${td} tabular`}>{i.total}</td>
                  <td className={`${td} tabular`}>{i.added}</td>
                  <td className={`${td} tabular`}>{i.duplicates}</td>
                  <td className={`${td} tabular`}>{i.skipped_clients}</td>
                  <td className={`${td} tabular`}>{i.invalid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Page>
  );
}
