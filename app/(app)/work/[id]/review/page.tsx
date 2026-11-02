import { auth } from "@clerk/nextjs/server";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTime } from "@/core";
import { techPanel, weightWord, type SavedStone } from "@/core/tools/calculators";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checklist, countWord, stageCount } from "@/components/work/checklist";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { jobTitle, loadMyWork } from "@/lib/work/load";
import { loadReferences } from "@/lib/work/references";
import { cn } from "@/lib/utils";

import { transitionAction } from "../../../orders/actions";
import type { ChecklistRow, SlotRow } from "../../../orders/WorkPanels";
import type { SavedWeights } from "../../WeightsCard";
import { ModelTabs, type ModelView } from "./ModelTabs";
import { RefViewer } from "./RefViewer";

/**
 * The final review before QC (owner, 2 Nov 2026), full screen: the client's
 * references and brief on the left, the designer's model large in the
 * middle (the STL in 3D, the render, the technical sheet), and on the right
 * the designer check to mark while matching, the gold weight and diamonds,
 * what is still missing, and Send to QC — live as soon as the last line
 * passes. The only way a version goes to the pod lead from the job screens;
 * the database checks it all again on Send.
 */
export const dynamic = "force-dynamic";

const th = "py-1.5 pr-2 text-left text-[length:var(--fs-1)] font-medium text-muted-foreground";
const td = "py-1.5 pr-2 tabular text-[length:var(--fs-2)]";
const h2 = "text-[length:var(--fs-3)] font-semibold";

export default async function FinalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();

  const [job] = await loadMyWork(supabase, id).catch(() => []);
  if (!job) redirect("/work");

  const [briefRes, accentsRes, slotsRes, checklistRes, specRes, weightsRes, refs, zone] = await Promise.all([
    supabase.rpc("job_brief", { p_order_id: id }),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", id).order("position"),
    supabase.rpc("job_slots", { p_order_id: id }),
    supabase.rpc("job_checklist", { p_order_id: id }),
    supabase.rpc("version_spec", { p_order_id: id }),
    supabase.rpc("job_weights_get", { p_order_id: id }),
    loadReferences(supabase, id),
    viewerZone(),
  ]);

  const slots = ((slotsRes.data ?? []) as SlotRow[]).filter((s) => s.required);
  const file = (code: string) => slots.find((s) => s.code === code)?.file_version_id ?? null;
  const rows = (checklistRes.data ?? []) as ChecklistRow[];
  const check = stageCount(rows, "DESIGNER");
  const volume = (specRes.data as { volume_mm3: number | null } | null)?.volume_mm3 ?? null;
  const weights = (weightsRes.error ? null : weightsRes.data) as SavedWeights | null;
  const isCad = job.service !== "render";
  const working = job.status === "IN_PROGRESS";
  const lines = briefLines(briefRes.data as BriefRow | null, (accentsRes.data ?? []) as AccentLine[]);

  // The STL is signed for the browser's 3D view only after RLS has shown it
  // to this designer (as the reference pictures are). If the storage host
  // refuses the browser's read, the viewer falls back to our own stream.
  let stlUrl: string | null = null;
  const stlId = file("STL");
  if (stlId) {
    const { data: fv } = await supabase.from("file_versions").select("object_key").eq("id", stlId).maybeSingle();
    if (fv?.object_key) {
      const { data: signed } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).createSignedUrl(fv.object_key as string, 60 * 30);
      stlUrl = signed?.signedUrl ?? null;
    }
  }
  const views: ModelView[] = [
    ...(stlUrl && stlId
      ? [{ key: "stl" as const, id: stlId, label: "3D model (STL)", url: stlUrl, fallbackUrl: `/api/files/${stlId}/stream`, downloadUrl: `/api/files/${stlId}` }]
      : []),
    ...(file("RENDER") ? [{ key: "render" as const, id: file("RENDER")!, label: "Render views", url: `/api/files/${file("RENDER")}` }] : []),
    ...(file("TECH") ? [{ key: "tech" as const, id: file("TECH")!, label: "Technical sheet", url: `/api/files/${file("TECH")}` }] : []),
  ];

  const missing = [
    ...(check.total > 0 && check.passed === check.total ? [] : [`Designer check: ${countWord(check)}`]),
    ...slots.filter((s) => !s.file_version_id).map((s) => `Upload the ${s.label}`),
    ...(isCad && volume == null ? ["Enter the model volume"] : []),
    ...(isCad && weights?.gold_18k_g == null ? ["Save the gold weight and diamonds"] : []),
  ];
  const ready = working && missing.length === 0;
  const panel =
    weights?.gold_18k_g != null
      ? techPanel({
          gold18k: Number(weights.gold_18k_g),
          castingAllowance: Number(weights.casting_allowance_g),
          postAllowance: Number(weights.post_allowance_g),
          stones: (weights.stones ?? []) as SavedStone[],
        })
      : null;

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2">
        <Link href={`/work/${id}`} className="text-[length:var(--fs-2)] text-muted-foreground hover:text-foreground">
          ← Back to the job
        </Link>
        <div className="min-w-0">
          <p className="eyebrow">
            Final review · {job.job_code ?? ""} · version {job.work_version}
          </p>
          <h1 className="truncate text-[length:var(--fs-4)] font-semibold">{jobTitle(job)}</h1>
        </div>
        <p
          className={cn(
            "ml-auto flex items-center gap-1.5 text-[length:var(--fs-2)]",
            ready ? "text-[color:var(--tone-success-fg)]" : "text-muted-foreground",
          )}
        >
          {ready ? <CircleCheck className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
          {!working ? "Sent to QC" : ready ? "Ready to send" : `${missing.length} to finish`}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.7fr)_minmax(320px,1fr)] lg:overflow-hidden">
        <section aria-labelledby="ref-title" className="space-y-4 border-border p-4 lg:overflow-y-auto lg:border-r">
          <h2 id="ref-title" className={h2}>
            The client&apos;s references
          </h2>
          <RefViewer images={refs} />
          {lines.length > 0 && (
            <div className="space-y-1">
              <h2 className={h2}>The brief</h2>
              <dl className="divide-y divide-border">
                {lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-4 py-1.5 text-[length:var(--fs-2)]">
                    <dt className="text-muted-foreground">{l.label}</dt>
                    <dd className="text-right">{l.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        <section aria-label="Your model" className="flex h-[75vh] flex-col p-4 lg:h-auto lg:min-h-0">
          <ModelTabs views={views} />
        </section>

        <section aria-label="Check and send" className="space-y-5 border-border p-4 lg:overflow-y-auto lg:border-l">
          <Checklist
            orderId={id}
            rows={rows}
            stages={["DESIGNER"]}
            canMark={working ? "DESIGNER" : null}
            zone={zone}
            compact
          />

          {isCad && (
            <div aria-labelledby="weights-title" role="group" className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 border-b border-border pb-[var(--s-1)]">
                <h3 id="weights-title" className="text-[length:var(--fs-3)] font-medium">
                  Gold weight and diamonds
                </h3>
                {panel && (
                  <span className="tabular font-mono text-[length:var(--fs-1)] text-muted-foreground">
                    {panel.totals.pcs} stones · {weightWord(panel.totals.ct, 3)} ct
                  </span>
                )}
              </div>
              {!panel ? (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  Not saved yet.{" "}
                  <Link href={`/work/${id}`} className="underline underline-offset-4">
                    Save them on the job page
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <table className="w-full">
                    <caption className="sr-only">Cast gold weight per metal</caption>
                    <thead>
                      <tr>
                        <th scope="col" className={th}>Metal</th>
                        <th scope="col" className={th}>Cast</th>
                        <th scope="col" className={th}>With post</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {panel.gold.map((g) => (
                        <tr key={g.metal} className={g.metal === "18K" ? "font-medium" : undefined}>
                          <th scope="row" className="py-1.5 pr-2 text-left text-[length:var(--fs-2)] font-medium">{g.metal}</th>
                          <td className={td}>{weightWord(g.cast)} g</td>
                          <td className={td}>{weightWord(g.withPost)} g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full">
                    <caption className="sr-only">Diamond details</caption>
                    <thead>
                      <tr>
                        <th scope="col" className={th}>Shape</th>
                        <th scope="col" className={th}>Size</th>
                        <th scope="col" className={th}>Pcs</th>
                        <th scope="col" className={th}>Ct</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {panel.stones.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={`${td} text-muted-foreground`}>No diamonds</td>
                        </tr>
                      ) : (
                        panel.stones.map((st, i) => (
                          <tr key={i}>
                            <th scope="row" className="py-1.5 pr-2 text-left text-[length:var(--fs-2)] font-medium">{st.shape}</th>
                            <td className={td}>{st.size}</td>
                            <td className={td}>{st.pcs}</td>
                            <td className={td}>{weightWord(st.totalCt, 3)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-[var(--r-md)] border border-border p-3">
            {!working ? (
              <p className="text-[length:var(--fs-2)]" role="status">
                {job.status === "QC_REVIEW"
                  ? `With your pod lead for QC${job.submitted_at ? ` since ${formatDateTime(job.submitted_at, zone)}` : ""}. You'll hear if anything needs changing.`
                  : "This version is not in progress."}
              </p>
            ) : missing.length > 0 ? (
              <ul className="space-y-1 text-[length:var(--fs-2)]">
                {missing.map((m) => (
                  <li key={m} className="flex items-center gap-2">
                    <CircleAlert className="h-4 w-4 shrink-0 text-[color:var(--tone-danger-fg)]" aria-hidden />
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-[length:var(--fs-2)]">
                <CircleCheck className="h-4 w-4 shrink-0 text-[color:var(--tone-success-fg)]" aria-hidden />
                Everything is in. Matches the references? Send it.
              </p>
            )}
            {working && (
              <form action={transitionAction}>
                <input type="hidden" name="order_id" value={id} />
                <input type="hidden" name="to_status" value="DESIGNER_SUBMITTED" />
                <Button type="submit" className="w-full" disabled={!ready}>
                  Send to QC
                </Button>
              </form>
            )}
            {!working && (
              <Link href={`/work/${id}`} className={`${buttonVariants({ variant: "outline" })} w-full`}>
                Back to the job
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
