import { Magnet } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { LeadControls } from "./LeadControls";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";
import { formatDate } from "@/core";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  name: string;
  company: string | null;
  email: string;
  role: string;
  message: string;
  status: string;
  handled_at: string | null;
  created_at: string;
}

const FILTERS = [
  { key: "NEW", label: "New" },
  { key: "HANDLED", label: "Handled" },
  { key: "", label: "All" },
] as const;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { userId } = await auth();
  const tz = await viewerZone();
  if (!userId) redirect("/sign-in");

  const status = (await searchParams).status ?? "NEW";

  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase.rpc("list_marketing_leads", {
    p_status: status === "" ? null : status,
  });

  if (error) {
    const denied = /only OPS or SALES/i.test(error.message);
    return (
      <Page>
        <h1 className="text-[length:var(--fs-6)] leading-[var(--lh-6)] tracking-[var(--ls-6)] font-semibold">Contact leads</h1>
        <div className="mt-4 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)] text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
          {denied
            ? "This inbox is for OPS and SALES. Switch to one of those roles to work leads."
            : `Couldn't load leads: ${error.message}`}
        </div>
      </Page>
    );
  }

  const leads = (data ?? []) as LeadRow[];

  return (
    <Page>
      <PageHeader
        eyebrow="From the website contact form"
        title="Contact leads"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <Link
              key={f.key || "all"}
              href={`/admin/leads${f.key ? `?status=${f.key}` : "?status="}`}
              className={`rounded-full border px-3 py-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
          <EmptyState icon={<Magnet />} title="No leads here" description="Messages from the website contact form land in New." />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {leads.map((lead) => (
            <li key={lead.id} className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {lead.name}
                    {lead.company && <span className="text-muted-foreground"> · {lead.company}</span>}
                  </p>
                  <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
                    <a className="underline underline-offset-2" href={`mailto:${lead.email}`}>
                      {lead.email}
                    </a>{" "}
                    · {lead.role.toLowerCase()} · {formatDate(lead.created_at, tz)}
                  </p>
                </div>
                <Badge variant={lead.status === "HANDLED" ? "muted" : "outline"}>
                  {lead.status.toLowerCase()}
                </Badge>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-[length:var(--fs-3)] leading-[var(--lh-3)]">{lead.message}</p>

              <div className="mt-3">
                <LeadControls id={lead.id} status={lead.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
