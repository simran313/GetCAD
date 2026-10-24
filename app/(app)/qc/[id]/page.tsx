import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { minutesWord, rupeesWord } from "@/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Timer } from "@/components/ui/timer";
import { Checklist } from "@/components/work/checklist";
import { References } from "@/components/work/references";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { loadPodJobs } from "@/lib/work/load";
import { loadReferences } from "@/lib/work/references";
import { requireTeam } from "@/lib/work/team";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../../orders/AutoRefresh";
import { qcDecisionAction } from "../../orders/actions";
import type { ChecklistRow } from "../../orders/WorkPanels";

/**
 * P2 — QC review (docs/design). The designer's files for this version (and
 * any earlier one, to compare), the brief they were working to, and the
 * two-level checklist: the designer's ticks beside the pod lead's own.
 * Pass unlocks at 19 / 19; a send-back needs a note, which goes to the
 * designer's thread (record_qc_decision).
 */
export const dynamic = "force-dynamic";

const IMAGE = /\.(png|jpe?g)$/i;

export default async function QcReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const { v } = await searchParams;
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");

  const [job] = await loadPodJobs(supabase, id).catch(() => []);
  if (!job) {
    return (
      <main className="container max-w-3xl py-8">
        <Link href="/qc" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
          ← QC queue
        </Link>
        <Card className="mt-6 p-[var(--s-10)] text-center text-[length:var(--fs-3)]">This order is not in your pod.</Card>
      </main>
    );
  }
  const version = Math.min(Math.max(Number(v) || job.work_version, 1), job.work_version);

  const [filesRes, checklistRes, specRes, accentsRes, stampRes, refs, relRes] = await Promise.all([
    supabase.from("deliverables").select("slot, file_version_id, file_name").eq("order_id", id).eq("version", version),
    supabase.rpc("job_checklist", { p_order_id: id }),
    supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", id).order("position"),
    supabase.rpc("order_activity_stamp", { p_order_id: id }),
    loadReferences(supabase, id),
    supabase.rpc("my_order_relation", { p_order_id: id }),
  ]);
  const files = (filesRes.data ?? []) as { slot: string; file_version_id: string; file_name: string }[];
  const images = files.filter((f) => IMAGE.test(f.file_name));
  const others = files.filter((f) => !IMAGE.test(f.file_name));
  const rows = (checklistRes.data ?? []) as ChecklistRow[];
  const designerDone = rows.filter((r) => r.designer_at).length;
  const qcDone = rows.filter((r) => r.qc_at).length;
  // Only the order's own pod lead records QC (record_qc_decision); an admin
  // looking in sees the review read-only.
  const inReview = job.status === "QC_REVIEW" && relRes.data === "POD_LEAD";
  const lines = briefLines(specRes.data as BriefRow | null, (accentsRes.data ?? []) as AccentLine[]);

  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <Link href="/qc" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← QC queue
      </Link>
      <PageHeader
        eyebrow={`QC review · ${job.order_ref ?? ""} · ${[job.designer_name, job.designer_ref].filter(Boolean).join(" · ") || "unassigned"} · v${job.work_version}`}
        title={job.title}
        actions={
          <Link href={`/orders/${id}`} className={buttonVariants({ variant: "outline" })}>
            Full order
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <CategoryBadge letter={job.category} />
        <span className="font-mono text-[length:var(--fs-1)]">{minutesWord(job.minutes)}</span>
        <StatusBadge status={job.status} />
        {job.sla_due_at && job.status === "QC_REVIEW" && <Timer dueAt={job.sla_due_at} label="First look due" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card as="section">
            <CardHeader>
              <CardTitle>Version {version}</CardTitle>
              {job.work_version > 1 && (
                <nav aria-label="Versions" className="flex gap-1">
                  {Array.from({ length: job.work_version }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={n === job.work_version ? `/qc/${id}` : `/qc/${id}?v=${n}`}
                      aria-current={n === version ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-[var(--ctl-sm)] min-w-[var(--ctl-sm)] items-center justify-center rounded-[var(--r-sm)] border font-mono text-[length:var(--fs-2)]",
                        n === version ? "border-foreground bg-foreground text-background" : "border-border",
                      )}
                    >
                      v{n}
                    </Link>
                  ))}
                </nav>
              )}
            </CardHeader>
            <CardBody className="space-y-4">
              {files.length === 0 ? (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">No files for this version yet.</p>
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((f) => (
                      <li key={f.slot}>
                        <a href={`/api/files/${f.file_version_id}`} target="_blank" rel="noreferrer" className="block space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- served through the download gate */}
                          <img
                            src={`/api/files/${f.file_version_id}`}
                            alt={`${f.slot} view`}
                            className="aspect-square w-full rounded-[var(--r-sm)] border border-border bg-subtle object-cover"
                          />
                          <span className="block font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em]">{f.slot}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {others.length > 0 && (
                    <ul className="divide-y divide-border rounded-[var(--r-sm)] border border-border">
                      {others.map((f) => (
                        <li key={f.slot} className="flex items-center justify-between gap-3 px-[var(--s-3)] py-[var(--s-2)]">
                          <span className="min-w-0">
                            <span className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em]">{f.slot}</span>{" "}
                            <span className="truncate font-mono text-[length:var(--fs-2)] text-muted-foreground">{f.file_name}</span>
                          </span>
                          <a href={`/api/files/${f.file_version_id}`} className="text-[length:var(--fs-2)] underline underline-offset-4">
                            Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          {inReview && (
            <Card as="section">
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <span className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                  Pass unlocks at 19 / 19
                  {job.qc_payout_paise ? ` · your QC payout ${rupeesWord(job.qc_payout_paise)}` : ""}
                  {job.price_total ? ` (${formatMoney(job.price_total, job.currency ?? "USD")} order)` : ""}
                </span>
              </CardHeader>
              <CardBody className="grid gap-4 md:grid-cols-[1fr_auto]">
                <form action={qcDecisionAction} className="space-y-2">
                  <input type="hidden" name="order_id" value={id} />
                  <input type="hidden" name="outcome" value="REVISION" />
                  <label htmlFor="qc-note" className="text-[length:var(--fs-2)] font-medium">
                    Revision note · required to send back
                  </label>
                  <Textarea id="qc-note" name="notes" required minLength={3} rows={3} placeholder="1. Halo claws to 0.8 mm  2. Blend the band seam" />
                  <Button type="submit" variant="outline">
                    Send back
                  </Button>
                </form>
                <form action={qcDecisionAction} className="flex items-end">
                  <input type="hidden" name="order_id" value={id} />
                  <input type="hidden" name="outcome" value="PASS" />
                  <Button type="submit" disabled={qcDone < 19} className="w-full md:w-auto">
                    Pass to client
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}

          <Card as="section">
            <CardHeader>
              <CardTitle>Two-level checklist</CardTitle>
              <span className="tabular font-mono text-[length:var(--fs-2)]">QC {qcDone} / 19</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                {designerDone === 19
                  ? "The designer ticked 19 of 19 and signed off. Re-check each line yourself."
                  : `The designer has ticked ${designerDone} of 19.`}
              </p>
              <Checklist
                orderId={id}
                rows={rows}
                canTickDesigner={false}
                canTickQc={inReview && designerDone === 19}
                signoffLabel="QC sign-off · when all 18 are re-checked"
              />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card as="section">
            <CardHeader>
              <CardTitle>The brief</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="divide-y divide-border">
                {lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-4 py-[var(--s-2)] text-[length:var(--fs-2)]">
                    <dt className="text-muted-foreground">{l.label}</dt>
                    <dd className="text-right">{l.value}</dd>
                  </div>
                ))}
              </dl>
              {(specRes.data as BriefRow | null)?.notes && (
                <p className="mt-3 rounded-[var(--r-sm)] bg-subtle p-[var(--s-3)] text-[length:var(--fs-2)]">
                  “{String((specRes.data as BriefRow).notes)}”
                </p>
              )}
            </CardBody>
          </Card>
          <Card as="section">
            <CardHeader>
              <CardTitle>References</CardTitle>
            </CardHeader>
            <CardBody>
              <References images={refs} />
            </CardBody>
          </Card>
          <Link href={`/messages/${id}`} className={`${buttonVariants({ variant: "outline" })} w-full`}>
            Message the designer or client
          </Link>
        </aside>
      </div>
      <AutoRefresh orderId={id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
    </main>
  );
}
