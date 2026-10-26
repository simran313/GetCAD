import { auth } from "@clerk/nextjs/server";
import { CircleCheck, Flag, Ruler, TimerOff } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { queueRank, STAFF_STAGES, STAGE_LABELS, staffNext, staffStage, type StaffStage } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { AlertList, type Alert } from "@/components/ui/alert-list";
import { buttonVariants } from "@/components/ui/button";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { type ClaimQueueRow } from "@/components/work/claims-queue";
import { PipelineStrip } from "@/components/work/pipeline-strip";
import { PodPicker, type PodOption } from "@/components/work/pod-picker";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

/**
 * A1 — the admin queue (redesign). The pipeline strip counts every stage and
 * filters the list; anything already late or contested is pinned above it;
 * then the orders where the team has the next move, disputes first, then the
 * nearest client deadline. Each row says why it is here and offers one move.
 */
export const dynamic = "force-dynamic";

const STAGE_NAME = new Map(STAGE_LABELS);
// Black for the one stage that is a problem; the rest are routine moves.
const toneOf = (s: StaffStage): PillTone => (s === "dispute" ? "attention" : STAFF_STAGES.includes(s) ? "neutral" : "info");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Row = { job: PodJob; next: ReturnType<typeof staffNext> };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  const role = (me as { role: string } | null)?.role ?? "CLIENT";
  // Pod leads have their own queue (P1); everyone else outside the team goes home.
  if (role === "QC") redirect("/qc");
  if (!["OPS", "SALES", "FINANCE"].includes(role) && !team) redirect("/home");
  const { stage: rawStage } = await searchParams;
  const filter = STAGE_NAME.has(rawStage as StaffStage) ? (rawStage as StaffStage) : null;

  let jobs: PodJob[];
  try {
    jobs = await loadPodJobs(supabase);
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load the queue" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }
  const [podsRes, creditsRes, claimsRes] = await Promise.all([
    supabase.rpc("pods_overview"),
    supabase.rpc("pending_sla_credits"),
    supabase.rpc("claims_queue"),
  ]);
  const pods = (podsRes.data ?? []) as PodOption[];
  const pendingCredits = ((creditsRes.data ?? []) as unknown[]).length;
  const claims = ((claimsRes.data ?? []) as ClaimQueueRow[]).filter((r) => r.status === "open" || r.status === "admin_review");

  const rows: Row[] = jobs.map((j) => ({
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
  const ranked = rows
    .filter((r) => (filter ? r.next.stage === filter : STAFF_STAGES.includes(r.next.stage)))
    .map((r) => ({ ...r, stage: r.next.stage, due: r.job.sla_status === "running" ? r.job.sla_due_at : null, created: r.job.created_at }))
    .sort(queueRank);
  const needStaff = rows.filter((r) => STAFF_STAGES.includes(r.next.stage)).length;
  const disputes = count("dispute");

  const alerts: Alert[] = [
    pendingCredits > 0 && {
      key: "credits",
      tone: "danger" as const,
      icon: <TimerOff />,
      text: `First look missed on ${plural(pendingCredits, "order")}. ${pendingCredits === 1 ? "A credit is" : "Credits are"} waiting for your decision.`,
      action: (
        <Link href="/admin/credits" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Decide
        </Link>
      ),
    },
    disputes > 0 &&
      filter !== "dispute" && {
        key: "disputes",
        tone: "attention" as const,
        icon: <Flag />,
        text: `${plural(disputes, "dispute")} open. The client is waiting on the team.`,
        action: (
          <Link href="/admin?stage=dispute" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Show
          </Link>
        ),
      },
    ...claims.map((c) => ({
      key: c.id,
      tone: "attention" as const,
      icon: <Ruler />,
      text: (
        <>
          {cap(`${c.spec.replace("_", " ")} claim`)}{" "}
          <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
            {[c.order_ref, c.client_code, c.designer_ref].filter(Boolean).join(" · ")}
          </span>
          <span className="block text-[length:var(--fs-2)] text-muted-foreground">
            {[
              c.status === "admin_review" ? "Sent to you for review" : "Waiting for a re-measure",
              c.hash_match ? "file matches the delivery" : "file does not match the delivery",
              c.designer_upheld_90d > 0 ? `designer has ${plural(c.designer_upheld_90d, "upheld claim")} in 90 days` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </>
      ),
      action: (
        <Link href={`/orders/${c.order_id}#claims`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Review
        </Link>
      ),
    })),
  ].filter(Boolean) as Alert[];

  const columns: Column<Row>[] = [
    {
      key: "stage",
      header: "Status",
      card: "badge",
      className: "w-[1%] whitespace-nowrap",
      cell: ({ next }) => <StatusPill tone={toneOf(next.stage)}>{STAGE_NAME.get(next.stage) ?? next.stage}</StatusPill>,
    },
    {
      key: "order",
      header: "Order",
      card: "title",
      cell: ({ job: j }) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{j.title}</span>
          <span className="tabular block font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">
            {[j.order_ref, j.client_code].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "why",
      header: "Why it's here",
      className: "text-muted-foreground md:max-w-[22rem]",
      cell: ({ next }) => cap(next.why),
    },
    {
      key: "sla",
      header: "First look",
      className: "whitespace-nowrap",
      cell: ({ job: j }) =>
        j.sla_status === "met" ? (
          <span className="text-[length:var(--fs-2)] text-muted-foreground">Done</span>
        ) : j.sla_status === "breached" || j.sla_status === "breached_credited" ? (
          <StatusPill tone="danger">Missed</StatusPill>
        ) : (
          <SlaCountdown dueAt={j.sla_status === "running" ? j.sla_due_at : null} />
        ),
    },
    {
      key: "action",
      header: <span className="sr-only">Next move</span>,
      card: "action",
      align: "right",
      className: "w-[1%] whitespace-nowrap",
      cell: ({ job: j, next }) =>
        next.action === "Choose a pod" && pods.length > 0 ? (
          <PodPicker orderId={j.order_id} pods={pods} label="Choose" variant="secondary" />
        ) : (
          <Link href={`/orders/${j.order_id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {next.action}
          </Link>
        ),
    },
  ];

  const filterName = filter ? STAGE_NAME.get(filter) : null;
  return (
    <Page>
      <PageHeader
        title="Queue"
        description={needStaff === 0 ? "Nothing needs the team right now." : `${plural(needStaff, "order needs", "orders need")} the team. Most urgent first.`}
        actions={
          <>
            <Link href="/admin/billing" className={buttonVariants({ variant: "secondary" })}>
              Reconcile
            </Link>
            <Link href="/admin/new-order" className={buttonVariants()}>
              Create order
            </Link>
          </>
        }
      />

      <PipelineStrip
        active={filter}
        stages={STAGE_LABELS.map(([stage, label]) => ({
          key: stage,
          label,
          count: count(stage),
          href: filter === stage ? "/admin" : `/admin?stage=${stage}`,
        }))}
      />

      <AlertList alerts={alerts} />

      <section className="space-y-3" aria-labelledby="queue-list">
        <div className="flex min-h-[var(--ctl-sm)] items-center justify-between gap-3">
          <h2 id="queue-list" className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
            {filterName ? `${filterName} · ${ranked.length}` : "Needs a move"}
          </h2>
          {filter && (
            <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Clear filter
            </Link>
          )}
        </div>
        <ResponsiveDataList
          caption={filterName ? `Orders: ${filterName}` : "Orders that need a move"}
          columns={columns}
          rows={ranked}
          rowKey={(r) => r.job.order_id}
          rowHref={(r) => `/orders/${r.job.order_id}`}
          linkKey="order"
          empty={
            <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
              {filter ? (
                <EmptyState
                  icon={<CircleCheck />}
                  title={`No orders in ${filterName?.toLowerCase()}`}
                  description="Pick another stage above, or clear the filter to see everything that needs the team."
                  action={
                    <Link href="/admin" className={buttonVariants({ variant: "secondary" })}>
                      Clear filter
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  icon={<CircleCheck />}
                  title="Queue clear"
                  description="Nothing needs the team right now. New orders land here the moment they need a move."
                />
              )}
            </div>
          }
        />
      </section>
    </Page>
  );
}
