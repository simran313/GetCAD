import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { loadClientOrders } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Page } from "@/components/ui/page";

import { OrderFiles, POST_QC, type FileVersionRow } from "./OrderFiles";

/**
 * C8 — Files (docs/design). Every order's files in one place. Approved
 * orders offer the release set (STL, 3DM, summary); in-progress orders show
 * what will unlock and when. Each link goes through /api/files, which applies
 * the same download gate, so this page cannot offer more than it serves.
 */
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  // Three rounds to the database, not five (Phase 12): the role does not wait
  // for the orders, and the fingerprints do not wait for the file list.
  const [{ data: me }, allOrders] = await Promise.all([supabase.from("users").select("role").maybeSingle(), loadClientOrders(supabase)]);
  const role = me?.role ?? "CLIENT";

  const orders = allOrders.filter((o) => o.status !== "DRAFT");
  const ids = orders.map((o) => o.id);
  const [{ data: versions }, { data: names }, fpRows] = await Promise.all([
    ids.length
      ? supabase
          .from("file_versions")
          .select("id, order_id, kind, content_type, size_bytes, uploader_party, version_no")
          .in("order_id", ids)
          .order("version_no", { ascending: false })
      : { data: [] },
    ids.length ? supabase.from("deliverables").select("file_version_id, file_name").in("order_id", ids) : { data: [] },
    // Fingerprints (A3, 0050) for orders past QC, and their documents.
    Promise.all(
      orders
        .filter((o) => POST_QC.includes(o.status))
        .map(async (o) => ((await supabase.rpc("order_fingerprints", { p_order_id: o.id })).data ?? []) as { file_version_id: string; sha256: string }[]),
    ),
  ]);
  const shaOf = new Map(fpRows.flat().map((r) => [r.file_version_id, r.sha256]));
  const nameOf = new Map(((names ?? []) as { file_version_id: string; file_name: string }[]).map((n) => [n.file_version_id, n.file_name]));
  const byOrder = new Map<string, FileVersionRow[]>();
  for (const v of (versions ?? []) as FileVersionRow[]) byOrder.set(v.order_id, [...(byOrder.get(v.order_id) ?? []), v]);

  const withFiles = orders.filter((o) => (byOrder.get(o.id) ?? []).length > 0 || POST_QC.includes(o.status));

  return (
    <Page>
      <PageHeader title="Files" description="Files unlock when you approve the design, so you only ever cast the version you signed off." />

      {withFiles.length === 0 && (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No files yet.</Card>
      )}

      {withFiles.map((o) => (
        <Card as="section" key={o.id}>
          <CardHeader>
            <div className="min-w-0">
              <p className="text-[length:var(--fs-2)] text-muted-foreground">{o.display_ref}</p>
              <CardTitle>
                <Link href={`/orders/${o.id}`} className="hover:underline">
                  {o.title}
                </Link>
              </CardTitle>
            </div>
            <StatusBadge status={o.status} />
          </CardHeader>
          <CardBody>
            <OrderFiles order={o} files={byOrder.get(o.id) ?? []} role={role} names={nameOf} shas={shaOf} />
          </CardBody>
        </Card>
      ))}
    </Page>
  );
}
