import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { jobClockDue, jobState, slotAccept } from "@/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { Circle, CircleCheck } from "lucide-react";
import { References } from "@/components/work/references";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { jobTitle, loadMyWork } from "@/lib/work/load";
import { versionNote } from "@/lib/work/notes";
import { loadReferences } from "@/lib/work/references";

import { AutoRefresh } from "../../orders/AutoRefresh";
import { setVolumeAction, transitionAction } from "../../orders/actions";
import { uploadSlotAction } from "../../orders/fileActions";
import { ThreadsPanel } from "../../orders/ThreadsPanel";
import type { AttachmentRow, MessageRow, ThreadRow } from "../../orders/types";
import type { ChecklistRow, SlotRow } from "../../orders/WorkPanels";
import { StartWorkButton } from "../StartWorkButton";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/**
 * D4 — one job (docs/design). The brief without the client (job_brief drops
 * their label and links), the reference pictures, why this version exists,
 * the ten upload slots, the checklist count and Submit to QC. Everything the
 * page offers is checked again by the database when it is pressed.
 */
export const dynamic = "force-dynamic";

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

  const [briefRes, accentsRes, slotsRes, checklistRes, threadsRes, messagesRes, filesRes, stampRes, refs, note, specRes] = await Promise.all([
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
  ]);
  const volume = (specRes.data as { volume_mm3: number | null } | null)?.volume_mm3 ?? null;
  const needsVolume = job.service !== "render";

  const brief = briefRes.data as BriefRow | null;
  const slots = ((slotsRes.data ?? []) as SlotRow[]).filter((s) => s.required);
  const checklist = (checklistRes.data ?? []) as ChecklistRow[];
  const ticked = checklist.filter((r) => r.designer_at).length;
  const filled = slots.filter((s) => s.file_version_id).length;
  const working = job.status === "IN_PROGRESS";
  const canSubmit = working && ticked === 19 && filled === slots.length && slots.length > 0 && (!needsVolume || volume != null);
  const clock = jobClockDue(job.started_at, job.minutes);
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
          <Link href={`/messages/${id}`} className={buttonVariants({ variant: "outline" })}>
            Ask pod lead
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <CategoryBadge letter={job.category} />
        <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(job.minutes)}</span>
        <StatusTag kind={state.kind}>{state.word}</StatusTag>
        {clock && working && <Timer dueAt={clock} label="Your time left" />}
        {job.designer_due_at && ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(job.status) && (
          <Timer dueAt={job.designer_due_at} label="Due to QC" />
        )}
      </div>

      {(job.status === "ASSIGNED" || job.status === "REVISION_REQUESTED") && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[length:var(--fs-3)]">
              {job.status === "ASSIGNED"
                ? `Read the brief, then press Start work. Your ${minutesLabel(job.minutes)} starts then.`
                : "This version needs changes. Read the notes, then press Start work."}
            </p>
            <StartWorkButton orderId={id} size="default" />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
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
                  <li key={s.code} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {s.file_name ? (
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--tone-success-fg)]" aria-label="Uploaded" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Empty" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[length:var(--fs-3)] font-medium leading-[var(--lh-3)]">
                          {s.label} <span className="font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">{s.code}</span>
                        </p>
                        <p className="truncate font-mono text-[length:var(--fs-2)] text-muted-foreground">{s.file_name ?? "Not uploaded yet"}</p>
                      </div>
                    </div>
                    {working && (
                      <form action={uploadSlotAction} className="flex flex-wrap items-center gap-2 md:justify-end">
                        <input type="hidden" name="order_id" value={id} />
                        <input type="hidden" name="slot" value={s.code} />
                        <FilePicker
                          name="file"
                          required
                          accept={slotAccept(s.code)}
                          label={`File for ${s.code}`}
                          buttonLabel="Choose"
                          className="md:max-w-[16rem]"
                        />
                        <Button type="submit" size="sm" variant="secondary">
                          {s.file_version_id ? "Replace" : "Upload"}
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[length:var(--fs-2)] text-muted-foreground">
                Names, authors and other details inside each file are removed on upload, and the system names the files.
              </p>
            </CardBody>
          </Card>

          <ThreadsPanel
            orderId={id}
            relation="DESIGNER"
            threads={(threadsRes.data ?? []) as ThreadRow[]}
            messages={(messagesRes.data ?? []) as MessageRow[]}
            attachments={(filesRes.data ?? []) as AttachmentRow[]}
          />
        </div>

        <aside className="space-y-4">
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
                  From Rhino (Analyze → Mass properties → Volume) on the final model. The weight sheet is made from it.
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
              <CardTitle>Designer checklist</CardTitle>
              <span className="tabular font-mono text-[length:var(--fs-2)]">{ticked} / 19</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <Link href={`/work/${id}/checklist`} className={`${buttonVariants({ variant: "outline" })} w-full`}>
                Open checklist
              </Link>
              <form action={transitionAction}>
                <input type="hidden" name="order_id" value={id} />
                <input type="hidden" name="to_status" value="DESIGNER_SUBMITTED" />
                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  Submit to QC
                </Button>
              </form>
              {!canSubmit && working && (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  Finish the checklist ({ticked}/19), the files ({filled}/{slots.length})
                  {needsVolume ? ` and the model volume${volume != null ? " ✓" : ""}` : ""} to submit.
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
