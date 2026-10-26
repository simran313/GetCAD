import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { minutesWord, mmWord, rupeesWord } from "@/core";
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
import { addWaiverAction, qcDecisionAction, recordMeasurementsAction } from "../../orders/actions";
import type { ChecklistRow } from "../../orders/WorkPanels";
import { Page } from "@/components/ui/page";

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
      <Page>
        <Link href="/qc" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
          ← QC queue
        </Link>
        <Card className="mt-6 p-[var(--s-10)] text-center text-[length:var(--fs-3)]">This order is not in your pod.</Card>
      </Page>
    );
  }
  const version = Math.min(Math.max(Number(v) || job.work_version, 1), job.work_version);

  const [filesRes, checklistRes, specRes, accentsRes, stampRes, refs, relRes, vsRes] = await Promise.all([
    supabase.from("deliverables").select("slot, file_version_id, file_name").eq("order_id", id).eq("version", version),
    supabase.rpc("job_checklist", { p_order_id: id }),
    supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", id).order("position"),
    supabase.rpc("order_activity_stamp", { p_order_id: id }),
    loadReferences(supabase, id),
    supabase.rpc("my_order_relation", { p_order_id: id }),
    supabase.rpc("version_spec", { p_order_id: id }),
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
  const designerDone = rows.filter((r) => r.designer_at).length;
  const qcDone = rows.filter((r) => r.qc_at).length;
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
                          <span className="block font-mono text-[length:var(--fs-2)]">{f.slot}</span>
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

          {inReview && (
            <Card as="section">
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                  Pass unlocks at 19 / 19{isCad ? " + measurements" : ""}
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
                  <Button type="submit" disabled={qcDone < 19 || !measured} className="w-full md:w-auto">
                    Pass to client
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
                  Minimums: wall {mmWord(vs?.minimums.wall_um)}, prong {mmWord(vs?.minimums.prong_um)}.
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
    </Page>
  );
}
