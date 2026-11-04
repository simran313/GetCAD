import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { AddDesigners } from "./AddDesigners";
import { bankWord, statusWord, type DesignerRow } from "./words";

/**
 * Designers (owner, 4 Nov 2026): the team adds its designers by name and
 * email, keeps their bank details and identity documents, and places each
 * in a pod, whose lead then sees and assigns them. Admin only (the database
 * refuses anyone else).
 */
export const dynamic = "force-dynamic";

export default async function DesignersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const res = await supabase.rpc("admin_designers");
  if (res.error) {
    return (
      <Page>
        <PageHeader title="Designers" />
        <ErrorPanel title="Not available to your role" message={res.error.message} className="mt-4" />
      </Page>
    );
  }
  const rows = (res.data ?? []) as DesignerRow[];
  const noPod = rows.filter((r) => !r.pod_id).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Bank details and documents are seen by admins only"
        title="Designers"
        description={noPod > 0 ? `${noPod} designer${noPod === 1 ? "" : "s"} not in a pod yet: their pod lead cannot see or assign them.` : undefined}
      />
      <Card>
        <CardHeader>
          <CardTitle>Add designers</CardTitle>
        </CardHeader>
        <CardBody>
          <AddDesigners />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} designer{rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <p className="p-[var(--s-4)] text-[length:var(--fs-2)] text-muted-foreground">No designers yet. Paste your list above.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const status = statusWord(r);
                const bank = bankWord(r);
                return (
                  <li key={r.user_id}>
                    <Link
                      href={`/admin/designers/${r.user_id}`}
                      className="grid gap-x-4 gap-y-1 px-[var(--s-4)] py-[var(--s-3)] hover:bg-accent sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.legal_name}</span>
                        <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">{r.email}</span>
                      </span>
                      <span className="text-[length:var(--fs-2)]">
                        <span className="block text-muted-foreground">Pod</span>
                        {r.pod_name ?? "Not in a pod"}
                      </span>
                      <span className="text-[length:var(--fs-2)]">
                        <span className="block text-muted-foreground">Bank · documents</span>
                        {bank.word} · {r.documents} file{r.documents === 1 ? "" : "s"}
                      </span>
                      <span className="self-center">
                        <StatusPill tone={status.tone}>{status.word}</StatusPill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}
