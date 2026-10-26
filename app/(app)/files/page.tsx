import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { fileGrantFor, type FileKind } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { loadClientOrders } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Page } from "@/components/ui/page";

/**
 * C8 — Files (docs/design). Every order's files in one place. Approved
 * orders offer the release set (STL, 3DM, summary); in-progress orders show
 * what will unlock and when. Each link goes through /api/files, which applies
 * the same download gate, so this page cannot offer more than it serves.
 */
export const dynamic = "force-dynamic";

interface VersionRow {
  id: string;
  order_id: string;
  kind: FileKind;
  content_type: string;
  size_bytes: number;
  uploader_party: string;
  version_no: number;
}

const KIND_WORDS: Partial<Record<FileKind, [string, string]>> = {
  STL: ["For your caster", "STL · print-ready"],
  RHINO_3DM: ["For editing", "3DM · Rhino, layered"],
  SUMMARY_SHEET: ["Summary sheet", "Weights, stones, sizes"],
  RENDER: ["Render", "Image"],
  WEIGHT_CHART: ["Gold weight", "Image"],
  DIAMOND_DETAILS: ["Diamond details", "Image"],
  CLIENT_REFERENCE: ["Your file", "Sent by you"],
  OTHER: ["File", ""],
};

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default async function FilesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  const role = me?.role ?? "CLIENT";

  const orders = (await loadClientOrders(supabase)).filter((o) => o.status !== "DRAFT");
  const ids = orders.map((o) => o.id);
  const [{ data: versions }, { data: names }] = ids.length
    ? await Promise.all([
        supabase
          .from("file_versions")
          .select("id, order_id, kind, content_type, size_bytes, uploader_party, version_no")
          .in("order_id", ids)
          .order("version_no", { ascending: false }),
        supabase.from("deliverables").select("file_version_id, file_name").in("order_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  // Fingerprints (A3, 0050) for orders past QC, and their documents.
  const POST_QC = ["CLIENT_PREVIEW", "APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED", "DISPUTED", "REVISION_REQUESTED"];
  const fpRows = await Promise.all(
    orders
      .filter((o) => POST_QC.includes(o.status))
      .map(async (o) => ((await supabase.rpc("order_fingerprints", { p_order_id: o.id })).data ?? []) as { file_version_id: string; sha256: string }[]),
  );
  const shaOf = new Map(fpRows.flat().map((r) => [r.file_version_id, r.sha256]));
  const nameOf = new Map(((names ?? []) as { file_version_id: string; file_name: string }[]).map((n) => [n.file_version_id, n.file_name]));
  const byOrder = new Map<string, VersionRow[]>();
  for (const v of (versions ?? []) as VersionRow[]) byOrder.set(v.order_id, [...(byOrder.get(v.order_id) ?? []), v]);

  const withFiles = orders.filter((o) => (byOrder.get(o.id) ?? []).length > 0 || POST_QC.includes(o.status));

  return (
    <Page>
      <PageHeader title="Files" description="Files unlock when you approve the design, so you only ever cast the version you signed off." />

      {withFiles.length === 0 && (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No files yet.</Card>
      )}

      {withFiles.map((o) => {
        const files = byOrder.get(o.id) ?? [];
        const rows = files.map((f) => {
          const grant = fileGrantFor({
            orderStatus: o.status,
            role,
            isOrderClient: true,
            isOrderDesigner: false,
            isUploader: f.uploader_party === "CLIENT",
            fileKind: f.kind,
          });
          return { f, grant };
        }).filter((r) => r.grant !== "NONE");
        const ready = rows.some((r) => r.grant === "ALLOW" && ["STL", "RHINO_3DM", "SUMMARY_SHEET"].includes(r.f.kind));
        return (
          <Card as="section" key={o.id}>
            <CardHeader>
              <div className="min-w-0">
                <p className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                  {o.display_ref}
                </p>
                <CardTitle>
                  <Link href={`/orders/${o.id}`} className="hover:underline">
                    {o.title}
                  </Link>
                </CardTitle>
              </div>
              <StatusBadge status={o.status} />
            </CardHeader>
            <CardBody className="space-y-2">
              {!ready && (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  STL, 3DM and the summary sheet unlock when you approve the design.
                </p>
              )}
              {POST_QC.includes(o.status) && o.service !== "render" && (
                <p className="flex flex-wrap gap-3 text-[length:var(--fs-2)]">
                  <a href={`/api/orders/${o.id}/certificate`} className="underline underline-offset-4">
                    QC certificate (PDF)
                  </a>
                  <a href={`/api/orders/${o.id}/weight-sheet`} className="underline underline-offset-4">
                    Weight sheet (PDF)
                  </a>
                </p>
              )}
              <ul className="divide-y divide-border">
                {rows.map(({ f, grant }) => {
                  const [what, how] = KIND_WORDS[f.kind] ?? ["File", ""];
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-[var(--s-2)]">
                      <span className="min-w-0">
                        <span className="block text-[length:var(--fs-3)]">{what}</span>
                        <span className="block truncate font-mono text-[length:var(--fs-1)] text-muted-foreground">
                          {[nameOf.get(f.id), how, size(f.size_bytes)].filter(Boolean).join(" · ")}
                        </span>
                        {shaOf.get(f.id) && (
                          <span className="block truncate font-mono text-[length:var(--fs-1)] text-muted-foreground" title={shaOf.get(f.id)}>
                            SHA-256 {shaOf.get(f.id)!.slice(0, 16)}…
                          </span>
                        )}
                      </span>
                      {grant === "ALLOW" ? (
                        <a href={`/api/files/${f.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Download
                        </a>
                      ) : (
                        <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                          Locked
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </Page>
  );
}
