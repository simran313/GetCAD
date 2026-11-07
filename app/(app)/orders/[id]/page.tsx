import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buildTimeline, escrowSign, staffNext, type TimelineRawRow, type TransitionRow } from "@/core";
import { LatestActivity } from "@/components/domain/latest-activity";
import { viewerZone } from "@/lib/time/zone";
import { ErrorPanel } from "@/components/error-panel";
import { StatusBadge } from "@/components/status-badge";
import { TrustLine } from "@/components/trust-line";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PodPicker, type PodOption } from "@/components/work/pod-picker";
import type { PodJob } from "@/lib/work/load";
import type { VersionSpec } from "@/lib/work/spec";
import { loadStanding } from "@/lib/work/standing";
import { StandingInstructions } from "@/components/work/standing";
import { Textarea } from "@/components/ui/textarea";
import { saveOrderMasterInstructionsAction } from "@/lib/client/standingActions";
import { ReloadForm } from "@/components/reload-form";
import { issueCertificateAction } from "../actions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { SITE_URL } from "@/lib/seo";

import { briefRows, productWord } from "@/lib/client/orders";

import { ClaimsCard, ShareCard, type ClaimRow, type PreviewLinkRow } from "../AfterDelivery";
import { ClientOrderView } from "../ClientOrderView";
import { POST_QC, type FileVersionRow } from "../../files/OrderFiles";
import { TeamClaims, type TeamClaimRow } from "../TeamClaims";
import { OrderDetail } from "../OrderDetail";
import type { PayoutStateSummary } from "../PayoutPanel";
import type { LineageRow, RevisionAllowance, RevisionRow } from "../RevisionsPanel";
import type { ClientContact, Screenshot } from "../IntakePanel";
import { AutoRefresh } from "../AutoRefresh";
import type { ChecklistRow, PodDesigner, SlotRow } from "../WorkPanels";
import { countWord, stageCount } from "@/components/work/checklist";
import { toThreadReads, type AttachmentRow, type DisputeRow, type LedgerRow, type MessageRow, type OrderRow, type ThreadRow, type VersionRow } from "../types";
import { Page } from "@/components/ui/page";

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
// Uploads finish here: a large 3DM is rebuilt (blocks exploded) on the server.
export const maxDuration = 60;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ link?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const supabase = await createUserSupabaseClient();

  // Phase 11a: one parallel wave for everything that needs only the order id
  // (each round trip to the database is a network hop in production), then
  // one for what depends on the order's relation and status.
  const [
    meRes,
    orderRes,
    transitionsRes,
    versionsRes,
    ledgerRes,
    messagesRes,
    disputesRes,
    timelineRes,
    allowanceRes,
    roundsRes,
    lineageRes,
    threadsRes,
    filesRes,
    stampRes,
    settingsRes,
    specRes,
    poRes,
    photosRes,
    accentsRes,
    namesRes,
    unreadRes,
    readsRes,
  ] =
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
      supabase.rpc("order_timeline", { p_order_id: id }),
      // Phase 3b: rounds and their notes for everyone on the order; the links
      // between orders never for a designer (order_lineage returns none).
      supabase.rpc("revision_allowance", { p_order_id: id }),
      supabase.rpc("order_revisions", { p_order_id: id }),
      supabase.rpc("order_lineage", { p_order_id: id }),
      // Phase 4a/4b: the threads this viewer may read, the files in them, and
      // the stamp the live refresh compares against.
      supabase.rpc("order_threads", { p_order_id: id }),
      supabase.rpc("thread_attachments", { p_order_id: id }),
      supabase.rpc("order_activity_stamp", { p_order_id: id }),
      // Staff only (policies/0028): the rate for showing payouts as a share of
      // the price. A client or designer gets no row, and no margin line.
      supabase.from("app_settings").select("key, value").in("key", ["usd_inr_paise_per_usd", "payout_warning_pct"]),
      // The client's view (each read is the database's to allow; unused for the team).
      supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
      supabase.from("orders").select("client_po").eq("id", id).maybeSingle(),
      supabase.from("order_reference_images").select("id").eq("order_id", id),
      supabase.from("order_spec_accents").select("quantity, shape, width_um, setting").eq("order_id", id).order("position"),
      // The Files sheet: delivered names (as on /files).
      supabase.from("deliverables").select("file_version_id, file_name").eq("order_id", id),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("kind", "MESSAGE")
        .eq("order_id", id)
        .is("read_at", null),
      // Phase 14: how far the other side has read each thread (the ticks).
      supabase.rpc("thread_read_state", { p_order_id: id }),
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
      <Page>
        <BackLink />
        <ErrorPanel
          title="Couldn't load this order"
          message={`${queryError.message} — reload the page to try again.`}
          className="mt-4"
        />
      </Page>
    );
  }

  const role: string = meRes.data?.role ?? "CLIENT";
  const order = (orderRes.data ?? null) as OrderRow | null;

  if (!order) {
    return (
      <Page>
        <BackLink />
        <div className="mt-6 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-10)] text-center">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium">Order not available</p>
          <p className="mt-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            This order isn&apos;t visible to your role, or the reference is wrong.
          </p>
        </div>
      </Page>
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

  // Wave 2: what depends on the order. Phase 3a surfaces, each only for the
  // people the database lets see it; a team-placed order's screenshots
  // (client and team only, policies/0034) and, for the team, the client's
  // contact for the WhatsApp / email buttons; past QC, fingerprints; after
  // approval, the preview links and spec claims (Phase 7b).
  const staffing = order.relation === "ADMIN" || order.relation === "POD_LEAD";
  const working = staffing || order.relation === "DESIGNER";
  const team = staffing;
  const placedByTeam = !!order.source && order.source !== "portal";
  const asClient = order.relation === "CLIENT" && role === "CLIENT";
  const shareable = asClient && ["APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED"].includes(order.status) && order.service !== "render";
  const none = Promise.resolve({ data: null });
  const teamView = order.relation !== "CLIENT";
  const [designersRes, checklistRes, slotsRes, shotsRes, contactRes, fingerprintsRes, linksRes, windowRes, claimsRes, payoutRes, jobRes, podsRes, vsRes, teamClaimsRes] = await Promise.all([
    staffing && ["PAYMENT_HELD", "ASSIGNED"].includes(order.status) ? supabase.rpc("pod_designers", { p_order_id: order.id }) : none,
    working && !["SUBMITTED", "QUOTED", "PAYMENT_HELD"].includes(order.status) ? supabase.rpc("job_checklist", { p_order_id: order.id }) : none,
    working && !["SUBMITTED", "QUOTED", "PAYMENT_HELD"].includes(order.status) ? supabase.rpc("job_slots", { p_order_id: order.id }) : none,
    placedByTeam && order.relation !== "DESIGNER"
      ? supabase.from("order_screenshots").select("id, object_key, position").eq("order_id", order.id).order("position")
      : none,
    placedByTeam && team ? supabase.rpc("order_client_contact", { p_order_id: order.id }).maybeSingle() : none,
    asClient && POST_QC.includes(order.status) ? supabase.rpc("order_fingerprints", { p_order_id: order.id }) : none,
    shareable ? supabase.rpc("my_preview_links", { p_order_id: order.id }) : none,
    shareable ? supabase.rpc("claim_window", { p_order_id: order.id }) : none,
    shareable ? supabase.rpc("order_claims", { p_order_id: order.id }) : none,
    // Payout execution state is service-role only (0024): the rows carry
    // processor references no browser session may read. FINANCE is the only
    // role that acts on them, so it is the only role we fetch them for.
    role === "FINANCE" ? createAdminSupabaseClient().rpc("payout_state", { p_order_id: order.id }) : none,
    // A3, the team's page (Phase 5d): the job, the pods, the version spec and claims.
    teamView ? supabase.rpc("pod_jobs", { p_order_id: order.id }).maybeSingle() : none,
    order.relation === "ADMIN" ? supabase.rpc("pods_overview") : none,
    teamView ? supabase.rpc("version_spec", { p_order_id: order.id }) : none,
    teamView ? supabase.rpc("order_claims", { p_order_id: order.id }) : none,
  ]);
  const screenshots: Screenshot[] = [];
  const shotRows = (shotsRes.data ?? []) as { id: string; object_key: string; position: number }[];
  if (shotRows.length > 0) {
    // Rows already filtered by RLS; the service role only signs what this
    // viewer may see (same pattern as the brief's reference pictures).
    const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
    const signed = await Promise.all(shotRows.map((row) => storage.createSignedUrl(row.object_key, 60 * 30)));
    shotRows.forEach((row, i) => {
      const url = signed[i]?.data?.signedUrl;
      if (url) screenshots.push({ id: row.id, position: row.position, url });
    });
  }
  const intake = placedByTeam
    ? {
        screenshots,
        contact: (contactRes.data as ClientContact | null) ?? null,
        orderUrl: SITE_URL.startsWith("https://") ? `${SITE_URL}/orders/${order.id}` : null,
      }
    : null;

  const settingRows = settingsRes.data;
  const setting = (key: string) =>
    (settingRows as { key: string; value: number | null }[] | null)?.find((r) => r.key === key)?.value ?? null;
  const payoutShare =
    setting("usd_inr_paise_per_usd") && setting("payout_warning_pct")
      ? { paisePerUsd: setting("usd_inr_paise_per_usd")!, warnPct: setting("payout_warning_pct")! }
      : null;

  const payoutState = (payoutRes.data as PayoutStateSummary | null) ?? null;

  // The client's own view (C4, Phase 5b). The team keeps the working view
  // below until 5d.
  if (asClient) {
    const spec = specRes.data as Record<string, string | number | boolean | null> | null;
    const briefLines = spec
      ? briefRows(spec, {
          service: order.service ?? "cad",
          photos: (photosRes.data ?? []).length,
          accents: (accentsRes.data ?? []) as { quantity: number }[],
        })
          .filter((r) => r.key !== "name" && r.value)
          .map((r) => ({ key: r.key, label: r.label, value: r.value! }))
      : [];
    // Phase 7b (0051): share a preview once approved; spec claims once delivered.
    const newLink = (await searchParams).link;
    const afterDelivery = shareable ? (
      <>
        {/* The guarantee first; sharing a preview is the extra (owner, 7 Nov 2026). */}
        <ClaimsCard
          orderId={order.id}
          claims={(claimsRes.data as ClaimRow[] | null) ?? []}
          claimWindow={(windowRes.data as { open: boolean; closes_at: string | null } | null) ?? null}
        />
        <ShareCard
          orderId={order.id}
          links={(linksRes.data as PreviewLinkRow[] | null) ?? []}
          newLink={newLink && /^[A-Za-z0-9_-]{32}$/.test(newLink) ? newLink : null}
          siteUrl={SITE_URL}
        />
      </>
    ) : null;
    return (
      <>
        <ClientOrderView
          afterDelivery={afterDelivery}
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
          messages={messages}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          files={versions as unknown as FileVersionRow[]}
          fileNames={new Map(((namesRes.data ?? []) as { file_version_id: string; file_name: string }[]).map((n) => [n.file_version_id, n.file_name]))}
          fileShas={new Map(((fingerprintsRes.data ?? []) as { file_version_id: string; sha256: string }[]).map((r) => [r.file_version_id, r.sha256]))}
          unread={unreadRes.count ?? 0}
          intake={intake}
          timelineRows={(timelineRes.data ?? []) as TimelineRawRow[]}
          threads={(threadsRes.data as ThreadRow[] | null) ?? []}
          reads={toThreadReads(readsRes.data)}
        />
        <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
      </>
    );
  }

  // A3 — the team's order page (Phase 5d): references in the header, the
  // next move first, then the work and conversation beside the controls.
  if (order.relation !== "CLIENT") {
    const teamClaims = (teamClaimsRes.data as TeamClaimRow[] | null) ?? [];
    // Phase 7a (0050): the certificate and weight sheet once QC has passed.
    const vs = (vsRes.data ?? null) as VersionSpec | null;
    const postQc = ["CLIENT_PREVIEW", "APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED", "DISPUTED"].includes(order.status);
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
    // 0062: the client's master instructions and any diamond certificate.
    // An admin may write them here for a client the team looks after.
    const standing = await loadStanding(supabase, order.id);
    const standingCard = (
      <StandingInstructions
        standing={standing}
        footer={
          order.relation === "ADMIN" ? (
            <details className="group">
              <summary className="cursor-pointer text-[length:var(--fs-2)] underline underline-offset-4">
                {standing.master ? "Edit for this client" : "Add for this client"}
              </summary>
              <ReloadForm action={saveOrderMasterInstructionsAction} className="mt-2 space-y-2">
                <input type="hidden" name="order_id" value={order.id} />
                <label htmlFor="master-body-admin" className="sr-only">
                  Master instructions for this client
                </label>
                <Textarea id="master-body-admin" name="body" rows={4} maxLength={4000} defaultValue={standing.master?.body ?? ""} />
                <Button type="submit" size="sm" variant="outline">
                  Save for every order of this client
                </Button>
              </ReloadForm>
            </details>
          ) : undefined
        }
      />
    );
    // The documents and the work so far, shown in the order facts card.
    const teamExtras = (
      <>
        {checklistRows.length > 0 && (
          <p className="tabular font-mono text-muted-foreground">
            v{job?.work_version ?? 1} · designer {countWord(stageCount(checklistRows, "DESIGNER"))} · QC{" "}
            {countWord(stageCount(checklistRows, "MANAGER"))} · files {slotRows.filter((r) => r.file_version_id).length}/{slotRows.length}
          </p>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <Link href={`/orders/${order.id}/brief`} className="underline underline-offset-4">
            Full brief
          </Link>
          {postQc && order.service !== "render" && (
            <>
              {vs?.certificate && (
                <a href={`/api/orders/${order.id}/certificate`} className="underline underline-offset-4">
                  Certificate
                </a>
              )}
              <a href={`/api/orders/${order.id}/weight-sheet`} className="underline underline-offset-4">
                Weight sheet
              </a>
            </>
          )}
          {postQc && (
            <a href={`/api/orders/${order.id}/summary`} className="underline underline-offset-4">
              Summary sheet
            </a>
          )}
        </p>
        {postQc && order.service !== "render" && vs && !vs.certificate && (
          <form action={issueCertificateAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <Button type="submit" size="sm" variant="outline">
              Issue certificate
            </Button>
          </form>
        )}
      </>
    );
    // The brief on the page (owner, 7 Nov 2026): pricing and confirming read it, so it is not a link away.
    const spec = specRes.data as Record<string, unknown> | null;
    const teamBriefRows = briefRows(spec, {
      service: order.service === "render" ? "render" : "cad",
      photos: (photosRes.data ?? []).length,
      accents: (accentsRes.data ?? []) as { quantity: number | null; shape?: string; width_um?: number | null; setting?: string }[],
      detail: true,
    }).filter((r) => r.key !== "name");
    const teamBrief = (
      <Card as="section">
        <CardHeader>
          <CardTitle>Brief</CardTitle>
          <Link href={`/orders/${order.id}/brief`} className="text-[length:var(--fs-2)] underline underline-offset-4">
            Open
          </Link>
        </CardHeader>
        <CardBody>
          {spec ? (
            <dl className="divide-y divide-border text-[length:var(--fs-3)] leading-[var(--lh-3)]">
              {teamBriefRows.map((r) => (
                <div key={r.key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1.5">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{r.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[length:var(--fs-3)] text-muted-foreground">No brief yet.</p>
          )}
        </CardBody>
      </Card>
    );
    const team = {
      // Assigning is the pod lead's move (owner, 4 Nov 2026): an admin is told who has it, not asked to do it.
      why:
        order.relation === "ADMIN" && next.stage === "assign" && job?.pod_id && order.confirmed_at
          ? "Paid and confirmed · the pod lead assigns a designer"
          : next.why,
      pod: job?.pod_name ? `${job.pod_name}${job.pod_lead_name ? ` · ${job.pod_lead_name}` : ""}` : null,
      designerRef: job?.designer_ref ?? null,
      clientCode: job?.client_code ?? null,
      podPicker: pods && (movable || !job?.pod_id) ? <PodPicker orderId={order.id} pods={pods} label={job?.pod_id ? "Move" : "Choose"} /> : null,
      brief: teamBrief,
      extras: teamExtras,
      qcHref: order.status === "QC_REVIEW" && order.relation === "POD_LEAD" ? `/qc/${order.id}` : null,
    };
    return (
      <Page>
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
          team={team}
          teamTop={
            <>
              {standingCard}
              {/* Latest (R4): the last moves and the last message, under Next. */}
              <LatestActivity
                zone={await viewerZone()}
                items={[
                  ...buildTimeline((timelineRes.data ?? []) as TimelineRawRow[])
                    .slice(-2)
                    .map((st) => ({ id: `t-${st.id}`, label: st.label, at: st.createdAt })),
                  ...messages.slice(-1).map((m) => ({
                    id: `m-${m.id}`,
                    label: `${m.is_mine ? "You" : m.sender_alias}: ${m.body}`,
                    at: m.created_at,
                    href: `/messages/${order.id}`,
                  })),
                ]}
              />
              {teamClaims.length > 0 && <TeamClaims orderId={order.id} claims={teamClaims} isAdmin={order.relation === "ADMIN"} />}
            </>
          }
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
          reads={toThreadReads(readsRes.data)}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          transitions={transitions}
          versions={versions}
          messages={messages}
          openDispute={disputes.find((d) => d.status === "OPEN")}
          held={held}
          payoutState={payoutState}
          timelineRows={(timelineRes.data ?? []) as TimelineRawRow[]}
          timelineError={timelineRes.error?.message ?? null}
        />
        <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
      </Page>
    );
  }

  return (
    <Page>
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
          reads={toThreadReads(readsRes.data)}
          attachments={(filesRes.data as AttachmentRow[] | null) ?? []}
          transitions={transitions}
          versions={versions}
          messages={messages}
          openDispute={disputes.find((d) => d.status === "OPEN")}
          held={held}
          payoutState={payoutState}
          timelineRows={(timelineRes.data ?? []) as TimelineRawRow[]}
          timelineError={timelineRes.error?.message ?? null}
        />
      </div>

      <TrustLine className="mt-6" />
      <AutoRefresh orderId={order.id} stamp={stampRes.data == null ? null : String(stampRes.data)} />
    </Page>
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
