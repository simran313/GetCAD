import { auth } from "@clerk/nextjs/server";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDateTime } from "@/core";
import { techPanel, weightWord, type SavedStone } from "@/core/tools/calculators";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { countWord, stageCount } from "@/components/work/checklist";
import { References } from "@/components/work/references";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";
import { jobTitle, loadMyWork } from "@/lib/work/load";
import { loadReferences } from "@/lib/work/references";

import { transitionAction } from "../../../orders/actions";
import type { ChecklistRow, SlotRow } from "../../../orders/WorkPanels";
import type { SavedWeights } from "../../WeightsCard";
import { ModelTabs, type ModelView } from "./ModelTabs";

/**
 * The final review before QC (owner, 2 Nov 2026): the client's references
 * and brief on one side, the designer's own model on the other (the STL in
 * 3D, the render, the technical sheet with its weights), the gold weight and
 * diamonds, and what is still missing — then Send to QC, the only way a
 * version is submitted from the job screens. The database checks it all
 * again on Send.
 */
export const dynamic = "force-dynamic";

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
  const check = stageCount((checklistRes.data ?? []) as ChecklistRow[], "DESIGNER");
  const volume = (specRes.data as { volume_mm3: number | null } | null)?.volume_mm3 ?? null;
  const weights = (weightsRes.error ? null : weightsRes.data) as SavedWeights | null;
  const isCad = job.service !== "render";
  const working = job.status === "IN_PROGRESS";
  const lines = briefLines(briefRes.data as BriefRow | null, (accentsRes.data ?? []) as AccentLine[]);

  // The STL is signed for the browser's 3D view only after RLS has shown it
  // to this designer (the same pattern as the reference pictures).
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
    ...(stlUrl ? [{ key: "stl" as const, label: "3D model (STL)", url: stlUrl }] : []),
    ...(file("RENDER") ? [{ key: "render" as const, label: "Render views", url: `/api/files/${file("RENDER")}` }] : []),
    ...(file("TECH") ? [{ key: "tech" as const, label: "Technical sheet", url: `/api/files/${file("TECH")}` }] : []),
  ];

  const missing = [
    ...(check.total > 0 && check.passed === check.total ? [] : [`Designer check: ${countWord(check)}`]),
    ...slots.filter((s) => !s.file_version_id).map((s) => `Upload the ${s.label}`),
    ...(isCad && volume == null ? ["Enter the model volume"] : []),
    ...(isCad && weights?.gold_18k_g == null ? ["Save the gold weight and diamonds"] : []),
  ];
  const panel =
    weights?.gold_18k_g != null
      ? techPanel({
          gold18k: Number(weights.gold_18k_g),
          castingAllowance: Number(weights.casting_allowance_g),
          postAllowance: Number(weights.post_allowance_g),
          stones: (weights.stones ?? []) as SavedStone[],
        })
      : null;

  const th = "py-[var(--s-2)] pr-3 text-left text-[length:var(--fs-2)] font-medium text-muted-foreground";
  const td = "py-[var(--s-2)] pr-3 tabular";

  return (
    <Page>
      <Link href={`/work/${id}`} className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Back to the job
      </Link>
      <PageHeader
        eyebrow={`Final review · ${job.job_code ?? ""} · version ${job.work_version}`}
        title={jobTitle(job)}
        description="Match your model against the client's references, check the weights, then send it to QC."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="ref-title">
          <CardHeader>
            <CardTitle id="ref-title">The client&apos;s references</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <References images={refs} />
            {lines.length > 0 && (
              <dl className="divide-y divide-border border-t border-border">
                {lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-4 py-[var(--s-2)] text-[length:var(--fs-2)]">
                    <dt className="text-muted-foreground">{l.label}</dt>
                    <dd className="text-right">{l.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>

        <Card as="section" aria-labelledby="model-title">
          <CardHeader>
            <CardTitle id="model-title">Your model</CardTitle>
          </CardHeader>
          <CardBody>
            <ModelTabs views={views} />
          </CardBody>
        </Card>
      </div>

      {isCad && (
        <Card as="section" aria-labelledby="weights-title">
          <CardHeader>
            <CardTitle id="weights-title">Gold weight and diamonds</CardTitle>
            {panel && (
              <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
                {panel.totals.pcs} stones · {weightWord(panel.totals.ct, 3)} ct · {weightWord(panel.totals.grams, 3)} g
              </span>
            )}
          </CardHeader>
          <CardBody>
            {!panel ? (
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                Not saved yet.{" "}
                <Link href={`/work/${id}`} className="underline underline-offset-4">
                  Save them on the job page
                </Link>
                ; they are added under the technical sheet.
              </p>
            ) : (
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[16rem] text-[length:var(--fs-3)]">
                    <caption className="sr-only">Cast gold weight per metal</caption>
                    <thead className="border-b border-border">
                      <tr>
                        <th scope="col" className={th}>Metal</th>
                        <th scope="col" className={th}>Cast</th>
                        <th scope="col" className={th}>With post</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {panel.gold.map((g) => (
                        <tr key={g.metal} className={g.metal === "18K" ? "font-medium" : undefined}>
                          <th scope="row" className="py-[var(--s-2)] pr-3 text-left font-medium">{g.metal}</th>
                          <td className={td}>{weightWord(g.cast)} g</td>
                          <td className={td}>{weightWord(g.withPost)} g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-[length:var(--fs-3)]">
                    <caption className="sr-only">Diamond details</caption>
                    <thead className="border-b border-border">
                      <tr>
                        <th scope="col" className={th}>Shape</th>
                        <th scope="col" className={th}>Size (mm)</th>
                        <th scope="col" className={th}>Pcs</th>
                        <th scope="col" className={th}>Total ct</th>
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
                            <th scope="row" className="py-[var(--s-2)] pr-3 text-left font-medium">{st.shape}</th>
                            <td className={td}>{st.size}</td>
                            <td className={td}>{st.pcs}</td>
                            <td className={td}>{weightWord(st.totalCt, 3)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card as="section" aria-labelledby="send-title">
        <CardHeader>
          <CardTitle id="send-title">{working ? "Send to QC" : "Sent to QC"}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {!working ? (
            <p className="text-[length:var(--fs-3)]" role="status">
              {job.status === "QC_REVIEW"
                ? `With your pod lead for QC${job.submitted_at ? ` since ${formatDateTime(job.submitted_at, zone)}` : ""}. You'll hear if anything needs changing.`
                : "This version is not in progress."}
            </p>
          ) : missing.length > 0 ? (
            <ul className="space-y-1.5 text-[length:var(--fs-3)]">
              {missing.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <CircleAlert className="h-4 w-4 shrink-0 text-[color:var(--tone-danger-fg)]" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-[length:var(--fs-3)]">
              <CircleCheck className="h-4 w-4 shrink-0 text-[color:var(--tone-success-fg)]" aria-hidden />
              Everything is in. Matches the references? Send it.
            </p>
          )}
          {working && (
            <div className="flex flex-wrap items-center gap-3">
              <form action={transitionAction}>
                <input type="hidden" name="order_id" value={id} />
                <input type="hidden" name="to_status" value="DESIGNER_SUBMITTED" />
                <Button type="submit" disabled={missing.length > 0}>
                  Send to QC
                </Button>
              </form>
              <Link href={`/work/${id}`} className={buttonVariants({ variant: "outline" })}>
                Back to fix something
              </Link>
            </div>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}
