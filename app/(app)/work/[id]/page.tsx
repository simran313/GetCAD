import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { durationWord, jobClock, jobClockDue, jobState, slotAccept } from "@/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { References } from "@/components/work/references";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { productWord } from "@/lib/client/orders";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { jobTitle, loadJobTimes, loadMyWork } from "@/lib/work/load";
import { versionNote } from "@/lib/work/notes";
import { loadReferences } from "@/lib/work/references";
import { loadStanding } from "@/lib/work/standing";
import { StandingInstructions } from "@/components/work/standing";

import { AutoRefresh } from "../../orders/AutoRefresh";
import { setVolumeAction } from "../../orders/actions";
import { ThreadsPanel } from "../../orders/ThreadsPanel";
import { toThreadReads, type AttachmentRow, type MessageRow, type ThreadRow } from "../../orders/types";
import type { ChecklistRow, SlotRow } from "../../orders/WorkPanels";
import { countWord, stageCount } from "@/components/work/checklist";

import { WeightsCard, type SavedWeights } from "../WeightsCard";
import { PauseButton } from "../PauseButton";
import { SlotUpload } from "../SlotUpload";
import { StartWorkButton } from "../StartWorkButton";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/**
 * D4 — one job (docs/design). The brief without the client (job_brief drops
 * their label and links), the reference pictures, why this version exists,
 * the four deliverables (one tap each: choose and it uploads), the checklist count and the final review (Send to QC). Everything the
 * page offers is checked again by the database when it is pressed.
 */
export const dynamic = "force-dynamic";
// Uploads finish here: a large 3DM is rebuilt (blocks exploded) on the server.
export const maxDuration = 60;

/** What each of the four deliverables is (0056), in the designer's words. */
const SLOT_WORDS: Record<string, [string, string]> = {
  "3DM": ["Rhino 3DM", "The final model. Blocks are fine: they are exploded on upload."],
  STL: ["STL", "Print-ready mesh, binary or ASCII."],
  RENDER: ["Render views", "One image with the four basic render views."],
  TECH: ["Technical sheet", "One image: four views with measurements, diamond details and gold weight (kt)."],
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();

  const [job] = await loadMyWork(supabase, id).catch(() => []);
  if (!job) {
    return (
      <Page>
        <Link href="/work" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
          ← Open jobs
        </Link>
        <Card className="mt-6 p-[var(--s-10)] text-center">
          <p className="text-[length:var(--fs-3)] font-medium">Job not available</p>
          <p className="mt-1 text-[length:var(--fs-3)] text-muted-foreground">It isn&apos;t assigned to you, or the link is wrong.</p>
        </Card>
      </Page>
    );
  }

  const [briefRes, accentsRes, slotsRes, checklistRes, threadsRes, messagesRes, filesRes, stampRes, refs, note, specRes, readsRes, timesMap, weightsRes, standing] = await Promise.all([
    supabase.rpc("job_brief", { p_order_id: id }),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", id).order("position"),
    supabase.rpc("job_slots", { p_order_id: id }),
    supabase.rpc("job_checklist", { p_order_id: id }),
    supabase.rpc("order_threads", { p_order_id: id }),
    supabase.rpc("order_messages", { p_order_id: id }),
    supabase.rpc("thread_attachments", { p_order_id: id }),
    supabase.rpc("order_activity_stamp", { p_order_id: id }),
    loadReferences(supabase, id),
    versionNote(supabase, id, job.work_version),
    supabase.rpc("version_spec", { p_order_id: id }),
    supabase.rpc("thread_read_state", { p_order_id: id }),
    loadJobTimes(supabase, id),
    supabase.rpc("job_weights_get", { p_order_id: id }),
    loadStanding(supabase, id),
  ]);
  const volume = (specRes.data as { volume_mm3: number | null } | null)?.volume_mm3 ?? null;
  const needsVolume = job.service !== "render";

  const brief = briefRes.data as BriefRow | null;
  const slots = ((slotsRes.data ?? []) as SlotRow[]).filter((s) => s.required);
  const checklist = (checklistRes.data ?? []) as ChecklistRow[];
  const check = stageCount(checklist, "DESIGNER");
  const filled = slots.filter((s) => s.file_version_id).length;
  const working = job.status === "IN_PROGRESS";
  // Phase 13f (0060): the gold weight and diamonds, joined under the technical image.
  const weights = (weightsRes.error ? null : weightsRes.data) as SavedWeights | null;
  const weightsSaved = !needsVolume || weights?.gold_18k_g != null;
  const canSubmit =
    working && check.total > 0 && check.passed === check.total && filled === slots.length && slots.length > 0 && (!needsVolume || volume != null) && weightsSaved;
  const times = timesMap.get(id);
  // With recorded pauses taken out (0057); before 0057, from Start work.
  const { dueAt: clock, pausedLeftMs } = times ? jobClock(job.minutes, times) : { dueAt: jobClockDue(job.started_at, job.minutes), pausedLeftMs: null };
  const paused = working && !!times?.paused_at;
  const state = jobState(job.status);
  const lines = briefLines(brief, (accentsRes.data ?? []) as AccentLine[]);

  return (
    <Page>
      <Link href="/work" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Open jobs
      </Link>
      <PageHeader
        eyebrow={`Job · ${job.job_code ?? ""} · ${state.word}${job.work_version > 1 ? ` · version ${job.work_version}` : ""}`}
        title={jobTitle(job)}
        actions={
          <Link href={`/messages/${id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Ask pod lead
          </Link>
        }
      />

      {/* Now (R4): the one thing a designer watches — the clock — large, with
          the one control beside it (Start work, or Pause / Resume), and the
          rest as a quiet line under it. Cobalt rail while the job is theirs to move. */}
      <Card as="section" aria-label="Now" variant={working || job.status === "ASSIGNED" || job.status === "REVISION_REQUESTED" ? "action" : "focus"}>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              {clock && working && !paused ? (
                <Timer dueAt={clock} label="Your time left" size="lg" />
              ) : paused ? (
                <div>
                  <p className="text-[length:var(--fs-2)] text-muted-foreground">Paused</p>
                  <p className="tabular text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)] tracking-[-0.02em]">
                    {pausedLeftMs != null && pausedLeftMs > 0 ? `${durationWord(pausedLeftMs)} left` : "Over time"}
                  </p>
                </div>
              ) : job.status === "ASSIGNED" || job.status === "REVISION_REQUESTED" ? (
                <div>
                  <p className="text-[length:var(--fs-2)] text-muted-foreground">
                    {job.status === "ASSIGNED" ? "Read the brief, then start" : "Changes asked: read the notes, then start"}
                  </p>
                  <p className="tabular text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)] tracking-[-0.02em]">
                    {minutesLabel(job.minutes)}
                  </p>
                  <p className="text-[length:var(--fs-2)] text-muted-foreground">Your time starts when you press Start work.</p>
                </div>
              ) : (
                <div>
                  <p className="text-[length:var(--fs-2)] text-muted-foreground">Status</p>
                  <p className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">{state.word}</p>
                </div>
              )}
            </div>
            {(job.status === "ASSIGNED" || job.status === "REVISION_REQUESTED") && <StartWorkButton orderId={id} size="default" />}
            {working && <PauseButton orderId={id} paused={paused} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
            <CategoryBadge letter={job.category} />
            <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(job.minutes)}</span>
            <StatusTag kind={state.kind}>{state.word}</StatusTag>
            {times?.active_seconds != null && (
              <span className="tabular text-[length:var(--fs-2)] text-muted-foreground">Active {durationWord(times.active_seconds * 1000)}</span>
            )}
            {job.designer_due_at && ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(job.status) && (
              <Timer dueAt={job.designer_due_at} label="Due to QC" />
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <StandingInstructions standing={standing} />

          {note && (
            <Card as="section">
              <CardHeader>
                <CardTitle>{note.from === "client" ? "Changes the client asked for" : "Pod lead notes"}</CardTitle>
                <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">
                  Version {job.work_version}
                </span>
              </CardHeader>
              <CardBody>
                <ol className="list-decimal space-y-1 pl-5 text-[length:var(--fs-3)]">
                  {note.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          <Card as="section">
            <CardHeader>
              <CardTitle>References</CardTitle>
              <span className="text-[length:var(--fs-2)] text-muted-foreground">Client hidden</span>
            </CardHeader>
            <CardBody>
              <References images={refs} />
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader>
              <CardTitle>Version {job.work_version} deliverables</CardTitle>
              <span className="tabular text-[length:var(--fs-2)] text-muted-foreground">
                {filled} of {slots.length} uploaded
              </span>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-border">
                {slots.map((s) => (
                  <SlotUpload
                    key={s.code}
                    orderId={id}
                    code={s.code}
                    label={SLOT_WORDS[s.code]?.[0] ?? s.label}
                    hint={SLOT_WORDS[s.code]?.[1]}
                    accept={slotAccept(s.code)}
                    fileName={s.file_name}
                    enabled={working}
                  />
                ))}
              </ul>
              <p className="mt-4 text-[length:var(--fs-2)] text-muted-foreground">
                Choose or drop a file and it uploads. Names, authors and other details inside each file are removed, and the system
                names the files. The summary sheet is made automatically from these.
              </p>
            </CardBody>
          </Card>

          {needsVolume && weights && (
            <WeightsCard key={`${volume ?? ""}-${weights.updated_at ?? ""}`} orderId={id} saved={weights} volumeMm3={volume == null ? null : Number(volume)} editable={working} />
          )}

          <ThreadsPanel
            orderId={id}
            relation="DESIGNER"
            threads={(threadsRes.data ?? []) as ThreadRow[]}
            messages={(messagesRes.data ?? []) as MessageRow[]}
            attachments={(filesRes.data ?? []) as AttachmentRow[]}
            reads={toThreadReads(readsRes.data)}
            brief={
              brief
                ? {
                    title: brief.product ? productWord(brief.product as string) : "The piece",
                    lines: lines.filter((l) => l.label !== "Product"),
                    notes: typeof brief.notes === "string" && brief.notes.trim() ? brief.notes.trim() : null,
                    images: refs.map((r) => ({ id: r.id, pins: r.pins.map((p) => p.label) })),
                  }
                : null
            }
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card as="section">
            <CardHeader>
              <CardTitle>Specification</CardTitle>
            </CardHeader>
            <CardBody>
              {lines.length === 0 ? (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">No brief yet. Ask your pod lead.</p>
              ) : (
                <dl className="divide-y divide-border">
                  {lines.map((l) => (
                    <div key={l.label} className="flex justify-between gap-4 py-[var(--s-2)] text-[length:var(--fs-2)]">
                      <dt className="text-muted-foreground">{l.label}</dt>
                      <dd className="text-right">{l.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {brief?.notes && (
                <p className="mt-3 rounded-[var(--r-sm)] bg-subtle p-[var(--s-3)] text-[length:var(--fs-2)]">“{String(brief.notes)}”</p>
              )}
            </CardBody>
          </Card>

          {needsVolume && (
            <Card as="section">
              <CardHeader>
                <CardTitle>Model volume</CardTitle>
                {volume != null && <span className="tabular font-mono text-[length:var(--fs-2)]">{Number(volume).toFixed(1)} mm³</span>}
              </CardHeader>
              <CardBody className="space-y-2">
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  From Rhino (Analyze → Mass properties → Volume) on the final model. The weight sheet is made from it.{" "}
                  <Link
                    href={volume != null ? `/tools?gold=${((Number(volume) / 1000) * 14).toFixed(2)}` : "/tools"}
                    className="underline underline-offset-4"
                  >
                    Gold and diamond calculators
                  </Link>
                </p>
                {working && (
                  <form action={setVolumeAction} className="flex items-end gap-2">
                    <input type="hidden" name="order_id" value={id} />
                    <Input
                      name="volume_mm3"
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0.001"
                      required
                      defaultValue={volume ?? ""}
                      aria-label="Model volume in cubic millimetres"
                      className="flex-1"
                    />
                    <Button type="submit" variant="outline">
                      Save
                    </Button>
                  </form>
                )}
              </CardBody>
            </Card>
          )}

          <Card as="section">
            <CardHeader>
              <CardTitle>Designer check</CardTitle>
              <span className="tabular font-mono text-[length:var(--fs-2)]">{countWord(check)}</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <Link href={`/work/${id}/checklist`} className={`${buttonVariants({ variant: "outline" })} w-full`}>
                {check.passed === check.total ? "Open the QC sheet" : "Mark the QC sheet"}
              </Link>
              {/* Owner, 2 Nov 2026: every version goes to QC from the final review —
                  the client's references beside the model, the weights, then Send to QC. */}
              {working && (
                <Link href={`/work/${id}/review`} className={`${buttonVariants({ variant: canSubmit ? "default" : "outline" })} w-full`}>
                  Final review and send to QC
                </Link>
              )}
              {!canSubmit && working && (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  Pass every line of the designer check ({check.passed}/{check.total}), the files ({filled}/{slots.length})
                  {needsVolume ? `, the model volume${volume != null ? " ✓" : ""} and the gold weight${weightsSaved ? " ✓" : ""}` : ""} before sending.
                </p>
              )}
              {job.status === "QC_REVIEW" && (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">With your pod lead for QC. You&apos;ll hear if anything needs changing.</p>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
      <AutoRefresh orderId={id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
    </Page>
  );
}
