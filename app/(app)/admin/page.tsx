import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { queueRank, STAFF_STAGES, STAGE_LABELS, staffNext, staffStage, type StaffStage } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { PodPicker, type PodOption } from "@/components/work/pod-picker";
import { ClaimsQueue, type ClaimQueueRow } from "@/components/work/claims-queue";
import { SectionLabel } from "@/components/work/stats";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

/**
 * A1 — the admin queue (docs/design). Counters for every stage of the flow,
 * then the orders where the team has the next move: disputes first, then
 * whatever is closest to a client deadline. Each row says why it is here
 * and offers the one move it needs.
 */
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  const role = (me as { role: string } | null)?.role ?? "CLIENT";
  // Pod leads have their own queue (P1); everyone else outside the team goes home.
  if (role === "QC") redirect("/qc");
  if (!["OPS", "SALES", "FINANCE"].includes(role) && !team) redirect("/home");

  let jobs: PodJob[];
  try {
    jobs = await loadPodJobs(supabase);
  } catch (e) {
    return (
      <main className="container max-w-6xl py-8">
        <ErrorPanel title="Couldn't load the queue" message={`${(e as Error).message} — reload the page to try again.`} />
      </main>
    );
  }
  const [podsRes, creditsRes, claimsRes] = await Promise.all([
    supabase.rpc("pods_overview"),
    supabase.rpc("pending_sla_credits"),
    supabase.rpc("claims_queue"),
  ]);
  const pods = (podsRes.data ?? []) as PodOption[];
  const pendingCredits = ((creditsRes.data ?? []) as unknown[]).length;

  const rows = jobs.map((j) => ({
    job: j,
    next: staffNext({
      status: j.status,
      podId: j.pod_id,
      confirmed: !!j.confirmed_at,
      designerId: j.designer_id,
      category: j.category,
      source: j.source,
      disputeReason: j.dispute_reason,
    }),
  }));
  const count = (s: StaffStage) => jobs.filter((j) => staffStage(j.status) === s).length;
  const urgent = rows
    .filter((r) => STAFF_STAGES.includes(r.next.stage))
    .map((r) => ({ ...r, stage: r.next.stage, due: r.job.sla_status === "running" ? r.job.sla_due_at : null, created: r.job.created_at }))
    .sort(queueRank);

  return (
    <main className="container max-w-6xl space-y-8 py-8">
      <PageHeader
        eyebrow={`${urgent.length} order${urgent.length === 1 ? "" : "s"} need staff`}
        title="Queue"
        actions={
          <>
            <Link href="/admin/billing" className={buttonVariants({ variant: "outline" })}>
              Reconcile
            </Link>
            <Link href="/admin/new-order" className={buttonVariants()}>
              Create order
            </Link>
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-5">
        {STAGE_LABELS.map(([stage, label]) => (
          <li key={stage} className="bg-card">
            <Link href={`/admin/orders?stage=${stage}`} className="flex flex-col p-[var(--s-4)] hover:bg-subtle">
              <span className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{count(stage)}</span>
              <span className="text-[length:var(--fs-2)] text-muted-foreground">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {pendingCredits > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[length:var(--fs-3)]">
              <StatusTag kind="needs">SLA missed</StatusTag>{" "}
              {pendingCredits} late-order credit{pendingCredits === 1 ? "" : "s"} waiting for your decision.
            </p>
            <Link href="/admin/credits" className={buttonVariants({ size: "sm" })}>
              Decide
            </Link>
          </CardBody>
        </Card>
      )}

      <ClaimsQueue rows={(claimsRes.data ?? []) as ClaimQueueRow[]} />

      <section className="space-y-3">
        <SectionLabel>Most urgent first · disputes, then anything blocking a client deadline</SectionLabel>
        {urgent.length === 0 ? (
          <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">Queue clear. Nothing needs staff right now.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  {["Needs", "Order", "Why", "SLA left", ""].map((h) => (
                    <th key={h} className="px-[var(--s-4)] py-[var(--s-3)] font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urgent.map(({ job: j, next }) => (
                  <tr key={j.order_id} className="border-b border-border align-middle last:border-b-0">
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <StatusTag kind={next.stage === "dispute" ? "needs" : "active"}>
                        {STAGE_LABELS.find(([s]) => s === next.stage)?.[1] ?? next.stage}
                      </StatusTag>
                    </td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      <Link href={`/orders/${j.order_id}`} className="block text-[length:var(--fs-3)] font-medium hover:underline">
                        {j.title}
                      </Link>
                      <span className="tabular font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                        {[j.order_ref, j.client_code].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="max-w-[22rem] px-[var(--s-4)] py-[var(--s-3)]">{next.why}</td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)]">
                      {j.sla_status === "running" && j.sla_due_at ? (
                        <Timer dueAt={j.sla_due_at} />
                      ) : (
                        <span className="text-muted-foreground">{j.sla_status === "breached" ? "Missed" : "Not started"}</span>
                      )}
                    </td>
                    <td className="px-[var(--s-4)] py-[var(--s-3)] text-right">
                      {next.action === "Choose a pod" && pods.length > 0 ? (
                        <PodPicker orderId={j.order_id} pods={pods} label="Choose" />
                      ) : (
                        <Link href={`/orders/${j.order_id}`} className={buttonVariants({ size: "sm" })}>
                          {next.action}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <p className="flex flex-wrap gap-4 text-[length:var(--fs-2)]">
        <Link href="/admin/payouts" className="underline underline-offset-4">
          Payouts
        </Link>
        <Link href="/admin/credits" className="underline underline-offset-4">
          Late-order credits
        </Link>
        <Link href="/admin/access/pods" className="underline underline-offset-4">
          Pods
        </Link>
      </p>
    </main>
  );
}
