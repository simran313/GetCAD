import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTime, mmWord, rupeesWord } from "@/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { VersionSpec } from "@/lib/work/spec";
import { Timer } from "@/components/ui/timer";
import { Checklist, countWord, stageCount } from "@/components/work/checklist";
import { References } from "@/components/work/references";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { loadPodJobs } from "@/lib/work/load";
import { loadReferences } from "@/lib/work/references";
import { loadStanding } from "@/lib/work/standing";
import { StandingInstructions } from "@/components/work/standing";
import { requireTeam } from "@/lib/work/team";
import { cn } from "@/lib/utils";

import { AutoRefresh } from "../../orders/AutoRefresh";
import { addWaiverAction, qcDecisionAction, recordMeasurementsAction } from "../../orders/actions";
import type { ChecklistRow } from "../../orders/WorkPanels";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/**
 * P2 — QC review (docs/design). The designer's files for this version (and
 * any earlier one, to compare), the brief they were working to, and the
 * two-stage QC sheet (0059): the pod lead marks the QC manager check line by
 * line, with the designer's own check below. Approve needs every line
 * passed; a send-back carries the failed lines (and any note) to the
 * designer's thread (qc_decide).
 */
export const dynamic = "force-dynamic";

/** The two images of a version (0056); older versions show their old slot codes. */
const SLOT_NAMES: Record<string, string> = { RENDER: "Render views", TECH: "Technical sheet" };

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
      <Page>
        <Link href="/qc" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
          ← QC queue
        </Link>
        <Card className="mt-6 p-[var(--s-10)] text-center text-[length:var(--fs-3)]">This order is not in your pod.</Card>
      </Page>
    );
  }
  const version = Math.min(Math.max(Number(v) || job.work_version, 1), job.work_version);

  const [filesRes, checklistRes, specRes, accentsRes, stampRes, refs, relRes, vsRes, standing] = await Promise.all([
    supabase.from("deliverables").select("slot, file_version_id, file_name").eq("order_id", id).eq("version", version),
    supabase.rpc("job_checklist", { p_order_id: id }),
    supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", id).order("position"),
    supabase.rpc("order_activity_stamp", { p_order_id: id }),
    loadReferences(supabase, id),
    supabase.rpc("my_order_relation", { p_order_id: id }),
    supabase.rpc("version_spec", { p_order_id: id }),
    loadStanding(supabase, id),
  ]);
  // Phase 7a (0050): this version's measured minimums, the designer's
  // volume and any waivers; Pass needs the measurements, with no open edges.
  const vs = (vsRes.data ?? null) as VersionSpec | null;
  const m = vs?.measurements ?? null;
  const isCad = job.service !== "render";
  const measured = !isCad || (!!m && m.open_edges === 0);
  const files = (filesRes.data ?? []) as { slot: string; file_version_id: string; file_name: string }[];
  const images = files.filter((f) => IMAGE.test(f.file_name));
  const others = files.filter((f) => !IMAGE.test(f.file_name));
  const rows = (checklistRes.data ?? []) as ChecklistRow[];
  const designer = stageCount(rows, "DESIGNER");
  const manager = stageCount(rows, "MANAGER");
  const allPassed = manager.total > 0 && manager.passed === manager.total;
  const failed = rows.filter((r) => r.stage === "MANAGER" && r.qc_at && r.outcome === "FAIL");
  const zone = await viewerZone();
  // Only the order's own pod lead records QC (record_qc_decision); an admin
  // looking in sees the review read-only.
  const inReview = job.status === "QC_REVIEW" && relRes.data === "POD_LEAD";
  const lines = briefLines(specRes.data as BriefRow | null, (accentsRes.data ?? []) as AccentLine[]);

  return (
    <Page>
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
        <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(job.minutes)}</span>
        <StatusBadge status={job.status} />
        {job.sla_due_at && job.status === "QC_REVIEW" && <Timer dueAt={job.sla_due_at} label="First look due" />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <StandingInstructions standing={standing} />
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
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {images.map((f) => (
                      <li key={f.slot}>
                        <a href={`/api/files/${f.file_version_id}`} target="_blank" rel="noreferrer" className="block space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- served through the download gate */}
                          <img
                            src={`/api/files/${f.file_version_id}`}
                            alt={SLOT_NAMES[f.slot] ?? `${f.slot} view`}
                            className="aspect-[4/3] w-full rounded-[var(--r-sm)] border border-border bg-subtle object-contain"
                          />
                          <span className="block text-[length:var(--fs-2)]">{SLOT_NAMES[f.slot] ?? f.slot}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {others.length > 0 && (
                    <ul className="divide-y divide-border rounded-[var(--r-sm)] border border-border">
                      {others.map((f) => (
                        <li key={f.slot} className="flex items-center justify-between gap-3 px-[var(--s-3)] py-[var(--s-2)]">
                          <span className="min-w-0">
                            <span className="font-mono text-[length:var(--fs-2)]">{f.slot}</span>{" "}
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

          <Card as="section">
            <CardHeader>
              <CardTitle>QC checklist</CardTitle>
              <span className="tabular font-mono text-[length:var(--fs-2)]">QC manager {countWord(manager)}</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                {designer.total > 0 && designer.passed === designer.total
                  ? `The designer passed all ${designer.total} lines of their check. Check each line yourself; a failed line goes back to the designer with your finding and remark.`
                  : `The designer has passed ${designer.passed} of ${designer.total} lines.`}
              </p>
              <Checklist
                orderId={id}
                rows={rows}
                stages={["MANAGER", "DESIGNER"]}
                canMark={inReview ? "MANAGER" : null}
                zone={zone}
                signature={{
                  DESIGNER: job.submitted_at ? `Signed by ${job.designer_ref ?? "the designer"} at submission, ${formatDateTime(job.submitted_at, zone)}.` : null,
                  MANAGER: inReview ? "Signature and date: you, recorded with your decision." : null,
                }}
              />
            </CardBody>
          </Card>

          {inReview && (
            <Card as="section">
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                  Approve needs every QC manager line passed{isCad ? " + measurements" : ""}
                  {job.qc_payout_paise ? ` · your QC payout ${rupeesWord(job.qc_payout_paise)}` : ""}
                  {job.price_total ? ` (${formatMoney(job.price_total, job.currency ?? "USD")} order)` : ""}
                </span>
              </CardHeader>
              <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <form action={qcDecisionAction} className="space-y-2">
                  <input type="hidden" name="order_id" value={id} />
                  <input type="hidden" name="outcome" value="REVISION" />
                  {failed.length > 0 && (
                    <div className="space-y-1 text-[length:var(--fs-2)]">
                      <p className="font-medium">Revision needed · the designer receives these failed lines:</p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        {failed.map((r) => (
                          <li key={r.item_id}>{[r.label, r.finding, r.remark].filter(Boolean).join(" — ")}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <label htmlFor="qc-note" className="text-[length:var(--fs-2)] font-medium">
                    {failed.length > 0 ? "Anything else for the designer (optional)" : "Revision note · required to send back"}
                  </label>
                  <Textarea
                    id="qc-note"
                    name="notes"
                    required={failed.length === 0}
                    minLength={failed.length === 0 ? 3 : undefined}
                    rows={3}
                    placeholder="1. Halo claws to 0.8 mm  2. Blend the band seam"
                  />
                  <Button type="submit" variant={failed.length > 0 ? "default" : "outline"}>
                    Send back · revision needed
                  </Button>
                </form>
                <form action={qcDecisionAction} className="flex items-end">
                  <input type="hidden" name="order_id" value={id} />
                  <input type="hidden" name="outcome" value="PASS" />
                  <Button type="submit" variant={failed.length > 0 ? "outline" : "default"} disabled={!allPassed || !measured} className="w-full md:w-auto">
                    Approve · pass to client
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}

          {isCad && (
            <Card as="section">
              <CardHeader>
                <CardTitle>Measured specification</CardTitle>
                <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                  {m ? `Recorded · v${vs?.version}` : "Needed to pass"} · goes on the certificate
                </span>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  Model volume from the designer: {vs?.volume_mm3 != null ? `${Number(vs.volume_mm3).toFixed(1)} mm³` : "not entered"}.
                  Minimums: wall {mmWord(vs?.minimums.wall_um)}, prong {mmWord(vs?.minimums.prong_um)}.{" "}
                  <Link
                    href={vs?.volume_mm3 != null ? `/tools?gold=${((Number(vs.volume_mm3) / 1000) * 14).toFixed(2)}` : "/tools"}
                    className="underline underline-offset-4"
                  >
                    Gold and diamond calculators
                  </Link>
                </p>
                {inReview ? (
                  <form action={recordMeasurementsAction} className="grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="order_id" value={id} />
                    {(
                      [
                        ["min_wall_mm", "Minimum wall (mm)", m ? m.min_wall_um / 1000 : "", true],
                        ["min_prong_mm", "Minimum prong (mm)", m?.min_prong_um != null ? m.min_prong_um / 1000 : "", false],
                        ["inner_diameter_mm", "Inner diameter (mm)", m?.inner_diameter_um != null ? m.inner_diameter_um / 1000 : "", false],
                        ["mesh_tolerance_mm", "Mesh tolerance (mm)", m ? m.mesh_tolerance_um / 1000 : 0.005, true],
                      ] as [string, string, number | string, boolean][]
                    ).map(([name, label, value, required]) => (
                      <Field key={name} label={label} htmlFor={name}>
                        <Input id={name} name={name} type="number" step="0.001" min="0.001" inputMode="decimal" required={required} defaultValue={value} />
                      </Field>
                    ))}
                    <Field label="Ring size" htmlFor="ring_size">
                      <Input id="ring_size" name="ring_size" maxLength={40} defaultValue={m?.ring_size ?? ""} />
                    </Field>
                    <Field label="Open edges" htmlFor="open_edges" hint="Must be 0 to pass">
                      <Input id="open_edges" name="open_edges" type="number" min="0" step="1" required defaultValue={m?.open_edges ?? 0} />
                    </Field>
                    {[0, 1, 2].map((i) => (
                      <Field key={i} label={`Stone seat ${i + 1}`} htmlFor={`seat${i}`} optional>
                        <Input
                          id={`seat${i}`}
                          name="seat"
                          maxLength={80}
                          placeholder={i === 0 ? "Centre oval 9 × 7" : ""}
                          defaultValue={m?.stone_seats[i]?.size_mm ?? ""}
                        />
                      </Field>
                    ))}
                    <div className="sm:col-span-3">
                      <Button type="submit" variant="outline">
                        {m ? "Update measurements" : "Record measurements"}
                      </Button>
                    </div>
                  </form>
                ) : m ? (
                  <p className="text-[length:var(--fs-2)]">
                    Wall {mmWord(m.min_wall_um)} · prong {mmWord(m.min_prong_um)} · open edges {m.open_edges}
                  </p>
                ) : null}

                <div className="space-y-2 border-t border-border pt-[var(--s-3)]">
                  <p className="text-[length:var(--fs-2)] font-medium">Client waivers</p>
                  {(vs?.waivers ?? []).length === 0 ? (
                    <p className="text-[length:var(--fs-2)] text-muted-foreground">None. Record one when the client asks for less than a minimum.</p>
                  ) : (
                    <ul className="space-y-1 text-[length:var(--fs-2)]">
                      {vs!.waivers.map((w, i) => (
                        <li key={i}>
                          {w.spec}: client requested {w.requested}
                          {w.note ? ` — ${w.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={addWaiverAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="order_id" value={id} />
                    <Select name="spec" required defaultValue="" aria-label="Which spec" className="w-auto">
                      <option value="" disabled>
                        Spec…
                      </option>
                      {["wall", "prong", "stone_seat", "size", "mesh", "other"].map((x) => (
                        <option key={x} value={x}>
                          {x.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                    <Input name="requested" required maxLength={200} placeholder="e.g. 0.6 mm wall" aria-label="What the client asked for" className="w-48" />
                    <Input name="note" maxLength={300} placeholder="Note (optional)" aria-label="Note" className="min-w-0 flex-1" />
                    <Button type="submit" size="sm" variant="outline">
                      Add waiver
                    </Button>
                  </form>
                </div>
              </CardBody>
            </Card>
          )}

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
    </Page>
  );
}
