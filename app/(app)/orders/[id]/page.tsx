import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { escrowSign, staffNext, type TransitionRow } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { StatusBadge } from "@/components/status-badge";
import { TrustLine } from "@/components/trust-line";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PodPicker, type PodOption } from "@/components/work/pod-picker";
import type { PodJob } from "@/lib/work/load";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { SITE_URL } from "@/lib/seo";

import { productWord } from "@/lib/client/orders";

import { ClientOrderView } from "../ClientOrderView";
import { OrderDetail } from "../OrderDetail";
import type { PayoutStateSummary } from "../PayoutPanel";
import type { LineageRow, RevisionAllowance, RevisionRow } from "../RevisionsPanel";
import type { ClientContact, Screenshot } from "../IntakePanel";
import { AutoRefresh } from "../AutoRefresh";
import type { ChecklistRow, PodDesigner, SlotRow } from "../WorkPanels";
import type { AttachmentRow, DisputeRow, LedgerRow, MessageRow, OrderRow, ThreadRow, VersionRow } from "../types";

/**
 * One order, on its own route.
 *
 * This used to be the same page as the list, switched by `?focus=<id>`. That
 * worked on a desktop and fails at everything a phone app has to do:
 *
 *   - the back button returned to the list only by accident of history,
 *   - a link from a notification or an email could not deep-link to an order,
 *   - and there was nowhere for a push notification to eventually point.
 *
 * A real route fixes all three at once, which is why it comes before any of the
 * screens that depend on it.
 *
 * The queries here are scoped to THIS order rather than fetching everything and
 * filtering in memory, which is what the combined page had to do. On a phone,
 * over a slow connection, that difference is the whole experience.
 */
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");

  const [meRes, orderRes, transitionsRes, versionsRes, ledgerRes, messagesRes, disputesRes] =
    await Promise.all([
      supabase.from("users").select("role").maybeSingle(),
      // visible_orders() decides whether this order is visible at all, and in
      // what shape: a designer gets the job code and no money (0036). A `null`
      // here is the same answer as "no such order" on purpose — the existence
      // of an order is itself something a stranger should not probe for.
      supabase
        .rpc("visible_orders", { p_order_id: id })
        .select(
          "id, relation, display_ref, product_type, status, currency, price_total, designer_payout, qc_payout, platform_commission, designer_payout_paise, qc_payout_paise, category, tier, complex_deadline_hours, sla_status, sla_due_at, first_look_at, confirmed_at, paid_at, source, service, created_at",
        )
        .maybeSingle(),
      supabase.from("order_transitions").select("from_status, to_status, actor_role, actor_scope"),
      supabase
        .from("file_versions")
        .select("id, order_id, version_no, content_type, size_bytes, kind, uploader_party")
        .eq("order_id", id)
        .order("version_no", { ascending: false }),
      supabase.from("escrow_ledger").select("order_id, kind, amount").eq("order_id", id),
      // Aliases and is_mine only: the sender's id never leaves the database.
      supabase.rpc("order_messages", { p_order_id: id }),
      supabase
        .from("disputes")
        .select("id, order_id, reason, status, resolution, resolution_notes")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const queryError =
    meRes.error ??
    orderRes.error ??
    transitionsRes.error ??
    versionsRes.error ??
    ledgerRes.error ??
    messagesRes.error ??
    disputesRes.error;

  if (queryError) {
    return (
      <main className="container max-w-3xl py-8">
        <BackLink />
        <ErrorPanel
          title="Couldn't load this order"
          message={`${queryError.message} — reload the page to try again.`}
          className="mt-4"
        />
      </main>
    );
  }

  const role: string = meRes.data?.role ?? "CLIENT";
  const order = (orderRes.data ?? null) as OrderRow | null;

  if (!order) {
    return (
      <main className="container max-w-3xl py-8">
        <BackLink />
        <div className="mt-6 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-10)] text-center">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium">Order not available</p>
          <p className="mt-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            This order isn&apos;t visible to your role, or the reference is wrong.
          </p>
        </div>
      </main>
    );
  }

  // A designer works the job on its own screen (D4, Phase 5c); links in
  // notifications and emails still say /orders/[id].
  if ((order.relation as string) === "DESIGNER") redirect(`/work/${order.id}`);

  const transitions = (transitionsRes.data ?? []) as TransitionRow[];
  const versions = (versionsRes.data ?? []) as VersionRow[];
  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const disputes = (disputesRes.data ?? []) as DisputeRow[];

  const held = ledger.reduce((net, l) => net + escrowSign(l.kind) * l.amount, 0);

  const timelineRes = await supabase.rpc("order_timeline", { p_order_id: order.id });

  // Phase 3a surfaces, each only for the people the database lets see it.
  const staffing = order.relation === "ADMIN" || order.relation === "POD_LEAD";
  const working = staffing || order.relation === "DESIGNER";
  const [designersRes, checklistRes, slotsRes, allowanceRes, roundsRes, lineageRes] = await Promise.all([
    staffing && ["PAYMENT_HELD", "ASSIGNED"].includes(order.status)
      ? supabase.rpc("pod_designers", { p_order_id: order.id })
      : Promise.resolve({ data: null }),
    working && !["SUBMITTED", "QUOTED", "PAYMENT_HELD"].includes(order.status)
      ? supabase.rpc("job_checklist", { p_order_id: order.id })
      : Promise.resolve({ data: null }),
    working && !["SUBMITTED", "QUOTED", "PAYMENT_HELD"].includes(order.status)
      ? supabase.rpc("job_slots", { p_order_id: order.id })
      : Promise.resolve({ data: null }),
    // Phase 3b: rounds and their notes for everyone on the order; the links
    // between orders never for a designer (order_lineage returns none).
    supabase.rpc("revision_allowance", { p_order_id: order.id }),
    supabase.rpc("order_revisions", { p_order_id: order.id }),
    supabase.rpc("order_lineage", { p_order_id: order.id }),
  ]);

  // Phase 4a: the threads this viewer may read, and for a team-placed order
  // its screenshots (client and team only — policies/0034) and, for the team,
  // the client's contact for the WhatsApp / email buttons.
  const team = order.relation === "ADMIN" || order.relation === "POD_LEAD";
  const placedByTeam = !!order.source && order.source !== "portal";
  const [threadsRes, shotsRes, contactRes, filesRes, stampRes] = await Promise.all([
    supabase.rpc("order_threads", { p_order_id: order.id }),
    placedByTeam && order.relation !== "DESIGNER"
      ? supabase
          .from("order_screenshots")
          .select("id, object_key, position")
          .eq("order_id", order.id)
          .order("position")
      : Promise.resolve({ data: null }),
    placedByTeam && team
      ? supabase.rpc("order_client_contact", { p_order_id: order.id }).maybeSingle()
      : Promise.resolve({ data: null }),
    // Phase 4b: files in the threads this viewer may read, and the stamp the
    // live refresh compares against.
    supabase.rpc("thread_attachments", { p_order_id: order.id }),
    supabase.rpc("order_activity_stamp", { p_order_id: order.id }),
  ]);
  const screenshots: Screenshot[] = [];
  const shotRows = (shotsRes.data ?? []) as { id: string; object_key: string; position: number }[];
  if (shotRows.length > 0) {
    // Rows already filtered by RLS; the service role only signs what this
    // viewer may see (same pattern as the brief's reference pictures).
    const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
    for (const row of shotRows) {
      const { data: signed } = await storage.createSignedUrl(row.object_key, 60 * 30);
      if (signed?.signedUrl) screenshots.push({ id: row.id, position: row.position, url: signed.signedUrl });
    }
  }
  const intake = placedByTeam
    ? {
        screenshots,
        contact: (contactRes.data as ClientContact | null) ?? null,
        orderUrl: SITE_URL.startsWith("https://") ? `${SITE_URL}/orders/${order.id}` : null,
      }
    : null;

  // Staff only (policies/0028): the rate for showing payouts as a share of
  // the price. A client or designer gets no row, and no margin line.
  const { data: settingRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["usd_inr_paise_per_usd", "payout_warning_pct"]);
  const setting = (key: string) =>
    (settingRows as { key: string; value: number | null }[] | null)?.find((r) => r.key === key)?.value ?? null;
  const payoutShare =
    setting("usd_inr_paise_per_usd") && setting("payout_warning_pct")
      ? { paisePerUsd: setting("usd_inr_paise_per_usd")!, warnPct: setting("payout_warning_pct")! }
      : null;

  // Payout execution state is service-role only (0024): the rows carry
  // processor references no browser session may read. FINANCE is the only role
  // that acts on them, so it is the only role we fetch them for.
  let payoutState: PayoutStateSummary | null = null;
  if (role === "FINANCE") {
    const { data } = await createAdminSupabaseClient().rpc("payout_state", {
      p_order_id: order.id,
    });
    payoutState = (data as PayoutStateSummary | null) ?? null;
  }

  // The client's own view (C4, Phase 5b). The team keeps the working view
  // below until 5d.
  if (order.relation === "CLIENT" && role === "CLIENT") {
    const [specRes, poRes] = await Promise.all([
      supabase.from("order_specs").select("*").eq("order_id", order.id).maybeSingle(),
      supabase.from("orders").select("client_po").eq("id", order.id).maybeSingle(),
    ]);
    const spec = specRes.data as Record<string, string | number | boolean | null> | null;
    const pretty = (v: unknown) =>
      typeof v === "string" && v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;
    const briefLines = spec
      ? (
          [
            ["Product", productWord(spec.product as string)],
            ["Metal", [pretty(spec.metal), spec.karatage].filter(Boolean).join(" · ") || null],
            ["Ring size", (spec.ring_size as string) || null],
            ["Inner diameter", spec.inner_diameter_um ? `${Number(spec.inner_diameter_um) / 1000} mm` : null],
            ["Length", spec.length_um ? `${Number(spec.length_um) / 1000} mm` : null],
            ["Centre stone", spec.has_centre_stone ? [pretty(spec.centre_shape), pretty(spec.centre_setting)].filter(Boolean).join(" · ") : "None"],
            ["Finish", pretty(spec.finish)],
          ] as [string, string | null][]
        )
          .filter((l): l is [string, string] => !!l[1])
          .map(([label, value]) => ({ label, value }))
      : [];
    return (
      <>
        <ClientOrderView
          order={order}
          title={(spec?.reference_name as string) || productWord(order.product_type)}
          clientPo={(poRes.data as { client_po: string | null } | null)?.client_po ?? null}
          briefLines={briefLines}
          held={held}
          revisions={{
            allowance: (allowanceRes.data as RevisionAllowance | null) ?? null,
            rounds: (roundsRes.data as RevisionRow[] | null) ?? [],
            lineage: (lineageRes.data as LineageRow[] | null) ?? [],
          }}
          threads={(threadsRes.data as ThreadRow[] | null) ?? []}
          messages={messages}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          intake={intake}
          timelineRows={timelineRes.data ?? []}
        />
        <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
      </>
    );
  }

  // A3 — the team's order page (Phase 5d): references in the header, the
  // next move first, then the work and conversation beside the controls.
  if (order.relation !== "CLIENT") {
    const [jobRes, podsRes] = await Promise.all([
      supabase.rpc("pod_jobs", { p_order_id: order.id }).maybeSingle(),
      order.relation === "ADMIN" ? supabase.rpc("pods_overview") : Promise.resolve({ data: null }),
    ]);
    const job = (jobRes.data as PodJob | null) ?? null;
    const pods = (podsRes.data as PodOption[] | null) ?? null;
    const next = staffNext({
      status: order.status,
      podId: job?.pod_id ?? null,
      confirmed: !!order.confirmed_at,
      category: order.category ?? null,
      source: order.source ?? null,
      disputeReason: job?.dispute_reason ?? null,
    });
    const checklistRows = (checklistRes.data as ChecklistRow[] | null) ?? [];
    const slotRows = ((slotsRes.data as SlotRow[] | null) ?? []).filter((r) => r.required);
    const movable = ["SUBMITTED", "QUOTED", "PAYMENT_HELD", "ASSIGNED"].includes(order.status);
    const teamTop = (
      <Card as="section">
        <CardHeader>
          <CardTitle>Next</CardTitle>
          <StatusBadge status={order.status} />
        </CardHeader>
        <CardBody className="space-y-3 text-[length:var(--fs-3)]">
          <p className="font-medium">{next.why}</p>
          {order.status === "QC_REVIEW" && (
            <Link href={`/qc/${order.id}`} className={`${buttonVariants()} w-full`}>
              Open the QC review
            </Link>
          )}
          {pods && (movable || !job?.pod_id) && (
            <div className="space-y-1">
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                Pod: {job?.pod_name ? `${job.pod_name}${job.pod_lead_name ? ` · ${job.pod_lead_name}` : ""}` : "none yet"}
              </p>
              <PodPicker orderId={order.id} pods={pods} label={job?.pod_id ? "Move" : "Choose"} />
            </div>
          )}
          {checklistRows.length > 0 && (
            <p className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
              v{job?.work_version ?? 1} · designer {checklistRows.filter((r) => r.designer_at).length}/19 · QC{" "}
              {checklistRows.filter((r) => r.qc_at).length}/19 · files {slotRows.filter((r) => r.file_version_id).length}/{slotRows.length}
            </p>
          )}
          <Link href={`/orders/${order.id}/brief`} className="inline-block text-[length:var(--fs-2)] underline underline-offset-4">
            The brief
          </Link>
        </CardBody>
      </Card>
    );
    return (
      <main className="container max-w-6xl space-y-6 py-8">
        <Link
          href={order.relation === "POD_LEAD" ? "/qc/orders" : "/admin/orders"}
          className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground"
        >
          ← All orders
        </Link>
        <PageHeader
          eyebrow={["Order", order.display_ref, job?.client_code, job?.designer_ref, job?.pod_lead_name].filter(Boolean).join(" · ")}
          title={job?.title ?? productWord(order.product_type)}
        />
        <OrderDetail
          layout="team"
          teamTop={teamTop}
          order={order}
          role={role}
          payoutShare={payoutShare}
          designers={(designersRes.data as PodDesigner[] | null) ?? null}
          checklist={null}
          slots={null}
          revisions={{
            allowance: (allowanceRes.data as RevisionAllowance | null) ?? null,
            rounds: (roundsRes.data as RevisionRow[] | null) ?? [],
            lineage: (lineageRes.data as LineageRow[] | null) ?? [],
          }}
          intake={intake}
          threads={(threadsRes.data as ThreadRow[] | null) ?? []}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          transitions={transitions}
          versions={versions}
          messages={messages}
          openDispute={disputes.find((d) => d.status === "OPEN")}
          held={held}
          payoutState={payoutState}
          timelineRows={timelineRes.data ?? []}
          timelineError={timelineRes.error?.message ?? null}
        />
        <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
      </main>
    );
  }

  return (
    <main className="container max-w-3xl py-8">
      <BackLink />

      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[var(--ls-5)]">
          {order.product_type}
        </h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="tabular mt-0.5 font-mono text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
        {order.display_ref ?? order.id}
      </p>

      {/* The brief is a route, not a panel: it is long, and it must be
          resumable and linkable. */}
      <Link
        href={`/orders/${order.id}/brief`}
        className="mt-4 flex min-h-[var(--ctl)] items-center justify-between rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] px-4 transition-colors duration-[var(--dur-fast)] hover:bg-accent"
      >
        <span className="text-[length:var(--fs-4)] font-medium">The brief</span>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
      </Link>

      <div className="mt-6">
        <OrderDetail
          order={order}
          role={role}
          payoutShare={payoutShare}
          designers={(designersRes.data as PodDesigner[] | null) ?? null}
          checklist={(checklistRes.data as ChecklistRow[] | null) ?? null}
          slots={(slotsRes.data as SlotRow[] | null) ?? null}
          revisions={{
            allowance: (allowanceRes.data as RevisionAllowance | null) ?? null,
            rounds: (roundsRes.data as RevisionRow[] | null) ?? [],
            lineage: (lineageRes.data as LineageRow[] | null) ?? [],
          }}
          intake={intake}
          threads={(threadsRes.data as ThreadRow[] | null) ?? []}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          transitions={transitions}
          versions={versions}
          messages={messages}
          openDispute={disputes.find((d) => d.status === "OPEN")}
          held={held}
          payoutState={payoutState}
          timelineRows={timelineRes.data ?? []}
          timelineError={timelineRes.error?.message ?? null}
        />
      </div>

      <TrustLine className="mt-6" />
      <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex min-h-[var(--ctl)] items-center gap-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground transition-colors hover:text-foreground"
    >
      ← All orders
    </Link>
  );
}
