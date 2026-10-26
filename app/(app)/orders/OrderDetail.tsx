import {
  availableTransitions,
  fileGrantFor,
  grantExplanation,
  type FileKind,
  type TimelineRawRow,
  type TransitionRow,
} from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { TONE_TEXT } from "@/lib/tone";

import {
  transitionAction,
  quoteAction,
  confirmOrderAction,
  markPaidAction,
  releaseEscrowAction,
  refundEscrowAction,
  raiseDisputeAction,
  resolveDisputeAction,
  qcDecisionAction,
} from "./actions";
import { uploadFileAction } from "./fileActions";
import {
  AssignPanel,
  ChecklistPanel,
  SlotsPanel,
  type ChecklistRow,
  type PodDesigner,
  type SlotRow,
} from "./WorkPanels";
import { PayButton } from "./PayButton";
import { OrderTimeline } from "./OrderTimeline";
import { PayoutPanel, type PayoutStateSummary } from "./PayoutPanel";
import { RevisionsPanel, type RevisionsData } from "./RevisionsPanel";
import { IntakePanel, type ClientContact, type Screenshot } from "./IntakePanel";
import { ThreadsPanel } from "./ThreadsPanel";
import type { AttachmentRow, DisputeRow, MessageRow, OrderRow, ThreadRow, VersionRow } from "./types";

const HIDDEN_TARGETS = new Set(["QUOTED", "PAYMENT_HELD", "PAYOUT_RELEASED", "REFUNDED", "DISPUTED"]);

/**
 * How each kind is named to a human.
 *
 * The list used to show content types — "model/stl", "image/png" — which told
 * the reader what a file was made of and nothing about what it was for. On a
 * delivery of six or more artefacts that is unreadable.
 */
const FILE_KIND_LABELS: Record<string, string> = {
  CLIENT_REFERENCE: "Your reference material",
  RENDER: "Render",
  WEIGHT_CHART: "Gold weight chart",
  DIAMOND_DETAILS: "Diamond details",
  STL: "STL",
  RHINO_3DM: "Rhino 3DM",
  SUMMARY_SHEET: "Order summary sheet",
  OTHER: "File",
};

/**
 * The order screen is nine of these stacked, so it is the surface the product
 * is mostly made of.
 *
 * It used to draw itself: its own radius, its own 10px header padding, its own
 * 14px title — none of which matched the dashboard's version of the same idea,
 * because there was no shared version to match. Now it composes `Card`, and the
 * only thing left here is the title/aside arrangement that is genuinely local
 * to this screen.
 */
const CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/**
 * Where the first-look clock stands (DECISIONS §6, v1.1): it starts only once
 * the order is both paid and confirmed by the team.
 */
function slaLine(o: OrderRow): string {
  switch (o.sla_status) {
    case "running":
      return o.sla_due_at ? `First look due by ${when(o.sla_due_at)}.` : "The clock is running.";
    case "met":
      return o.first_look_at ? `First look shared on time (${when(o.first_look_at)}).` : "First look shared on time.";
    case "breached":
      return "The first-look deadline was missed. A credit is being reviewed.";
    case "breached_credited":
      return "The first-look deadline was missed and a credit was issued.";
    default: {
      const waiting = [!o.paid_at && "payment", !o.confirmed_at && "confirmation"].filter(Boolean);
      return waiting.length
        ? `The 6-hour clock starts once the order is paid and confirmed — waiting for ${waiting.join(" and ")}.`
        : "The clock is about to start.";
    }
  }
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {aside}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function OrderDetail({
  order: o,
  role,
  payoutShare = null,
  designers = null,
  checklist = null,
  slots = null,
  revisions = null,
  intake = null,
  threads = [],
  attachments = [],
  transitions,
  versions,
  messages,
  openDispute,
  held,
  payoutState,
  timelineRows,
  timelineError,
  layout = "stack",
  teamTop = null,
}: {
  order: OrderRow;
  role: string;
  /** Staff only: the admin FX rate and warning threshold (DECISIONS §4). */
  payoutShare?: { paisePerUsd: number; warnPct: number } | null;
  /** Phase 3a working surfaces; null when this viewer has no part in them. */
  designers?: PodDesigner[] | null;
  checklist?: ChecklistRow[] | null;
  slots?: SlotRow[] | null;
  /** Phase 3b: revision rounds, notes and linked change orders. */
  revisions?: RevisionsData | null;
  /** Phase 4a: a team-placed order's screenshots and, for the team, the client's contact. */
  intake?: { screenshots: Screenshot[]; contact: ClientContact | null; orderUrl: string | null } | null;
  /** The threads this viewer may read (0036). */
  threads?: ThreadRow[];
  /** Files sent in those threads (0045). */
  attachments?: AttachmentRow[];
  transitions: TransitionRow[];
  versions: VersionRow[];
  messages: MessageRow[];
  openDispute?: DisputeRow;
  held: number;
  payoutState?: PayoutStateSummary | null;
  timelineRows: TimelineRawRow[];
  timelineError?: string | null;
  /** "team": the two-column admin / pod lead layout (A3, Phase 5d). */
  layout?: "stack" | "team";
  /** The team layout's first card: the next move, pod and refs. */
  teamTop?: React.ReactNode;
}) {
  const isOrderClient = o.relation === "CLIENT";
  const isOrderDesigner = o.relation === "DESIGNER";
  const isParticipant = isOrderClient || isOrderDesigner;

  // The SAME function the download route calls, so the list and the API cannot
  // disagree: a row offered here is a row that will actually serve, and a row
  // the API would refuse is never shown as a link. NONE rows are dropped
  // entirely — for those viewers the file's existence is itself the secret.
  const visibleFiles = versions
    .map((version) => {
      const grant = fileGrantFor({
        orderStatus: o.status,
        role,
        isOrderClient,
        isOrderDesigner,
        isUploader:
          (version.uploader_party === "CLIENT" && isOrderClient) ||
          (version.uploader_party === "DESIGNER" && isOrderDesigner),
        fileKind: version.kind,
      });
      return {
        version,
        grant,
        explanation: grantExplanation(grant, { orderStatus: o.status, fileKind: version.kind }),
      };
    })
    .filter((f) => f.grant !== "NONE");
  const allActions = availableTransitions(o.status, transitions, {
    role,
    isOrderClient,
    isOrderDesigner,
  })
    .filter((to) => !HIDDEN_TARGETS.has(to))
    // Assigning has its own panel with the pod's designers (0041).
    .filter((to) => to !== "ASSIGNED");

  // The QC pass/revision decision is the independent quality gate — surfaced as
  // its own clearly-labelled panel rather than a generic status chip.
  const isQcDecision = o.relation === "POD_LEAD" && o.status === "QC_REVIEW";
  const qcTargets = new Set(["CLIENT_PREVIEW", "REVISION_REQUESTED"]);
  const actions = isQcDecision ? allActions.filter((to) => !qcTargets.has(to)) : allActions;

  // The primary role is not the whole story since roles stack (0033): an
  // admin's primary role may be OPS, but visible_orders says ADMIN.
  const isAdmin = o.relation === "ADMIN";
  const canQuote = (role === "SALES" || isAdmin) && o.status === "SUBMITTED";
  const canConfirm =
    (isAdmin || o.relation === "POD_LEAD") &&
    !o.confirmed_at &&
    ["SUBMITTED", "QUOTED", "PAYMENT_HELD", "ASSIGNED", "IN_PROGRESS"].includes(o.status);
  const canMarkPaid = (role === "FINANCE" || isAdmin) && o.status === "QUOTED";
  // Party AND role. Owning the order is not enough: a staff member who happens
  // to have created an order must not be offered the client's actions while
  // acting in a staff role. The server action enforces the same pair.
  const isActingAsClient = role === "CLIENT" && isOrderClient;
  const canFund = isActingAsClient && o.status === "QUOTED";
  // release_escrow / refund_escrow / resolve_dispute check the PRIMARY role.
  const canRelease = role === "FINANCE" && o.status === "CLOSED";
  const canRefund = role === "FINANCE" && (o.status === "PAYMENT_HELD" || o.status === "DISPUTED");
  // raise_dispute() requires role CLIENT too — without this the button appears
  // for a staff owner and then fails at the database.
  const canRaiseDispute =
    isActingAsClient && (o.status === "IN_PROGRESS" || o.status === "CLIENT_PREVIEW");
  const price = o.price_total ?? 0;
  // A designer's money columns are null (0036), and the money panel is never
  // shown to them; the fallback only satisfies the formatter's type.
  const currency = o.currency ?? "USD";
  const showMoney = price > 0 || canQuote || canFund || canRelease || canRefund || canMarkPaid;
  const showSla = !["DRAFT", "CANCELLED", "REFUNDED"].includes(o.status);
  // Payouts as a share of the price, at the admin FX rate (DECISIONS §4).
  const sharePct =
    payoutShare && price > 0 && o.designer_payout_paise != null && o.qc_payout_paise != null
      ? Math.round(
          (((o.designer_payout_paise + o.qc_payout_paise) / payoutShare.paisePerUsd) * 100 * 100) / price,
        )
      : null;

  // The receipt for "what just happened": the timestamp of the most recent
  // recorded event, read straight from the timeline — no separate confirmation
  // mechanism needed, since every action already produces a timestamped entry.
  const lastEvent = timelineRows[timelineRows.length - 1];
  const lastUpdatedAt = lastEvent
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(lastEvent.created_at),
      )
    : null;

  const timelineEl = (
    <>
      {/* Timeline — every state explicit, visible, timestamped. The flagship
          trust surface: the client always sees exactly where their order is. */}
      <Panel title="Timeline">
        {timelineError ? (
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-destructive">
            Couldn&apos;t load history: {timelineError}
          </p>
        ) : (
          <OrderTimeline rows={timelineRows} currency={currency} />
        )}
      </Panel>
    </>
  );

  const intakeEl = (
    <>
      {intake && (
        <IntakePanel order={o} screenshots={intake.screenshots} contact={intake.contact} orderUrl={intake.orderUrl} />
      )}
    </>
  );

  const slaEl = (
    <>
      {/* The first-look clock (DECISIONS §6). */}
      {showSla && (
        <Panel title="First look">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">{slaLine(o)}</p>
          {o.tier && (
            <p className="mt-1 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
              Category {o.category} · {o.tier === "complex" ? `complex, ${o.complex_deadline_hours ?? "—"} h deadline` : "standard, 6 hours"}
            </p>
          )}
          {canConfirm && (
            <form action={confirmOrderAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="order_id" value={o.id} />
              <Button type="submit" size="sm">
                Confirm order
              </Button>
              <span className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                Press once the brief is complete and open questions are answered.
              </span>
            </form>
          )}
        </Panel>
      )}
    </>
  );

  const assignEl = (
    <>
      {designers && <AssignPanel orderId={o.id} designers={designers} />}
    </>
  );

  const checklistEl = (
    <>
      {checklist && (
        <ChecklistPanel
          orderId={o.id}
          rows={checklist}
          canTickDesigner={isOrderDesigner && o.status === "IN_PROGRESS"}
          canTickQc={o.relation === "POD_LEAD" && o.status === "QC_REVIEW"}
        />
      )}
    </>
  );

  const slotsEl = (
    <>
      {slots && <SlotsPanel orderId={o.id} slots={slots} canUpload={isOrderDesigner && o.status === "IN_PROGRESS"} />}
    </>
  );

  const qcEl = (
    <>
      {/* Independent QC decision — the visible quality gate for this order. */}
      {isQcDecision && (
        <Panel title="Independent QC review">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            Your decision appears on the client&apos;s timeline as &quot;Independent QC review:
            passed&quot; or &quot;revision requested&quot;, by role only. It is recorded against
            your account so the review is attributable and payable — you cannot review work you
            produced.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={qcDecisionAction}>
              <input type="hidden" name="order_id" value={o.id} />
              <input type="hidden" name="outcome" value="PASS" />
              <Button type="submit">Pass — send to client preview</Button>
            </form>
            <form action={qcDecisionAction} className="flex w-full flex-wrap items-end gap-2">
              <input type="hidden" name="order_id" value={o.id} />
              <input type="hidden" name="outcome" value="REVISION" />
              <Textarea
                name="notes"
                required
                rows={2}
                maxLength={2000}
                placeholder="What needs fixing (the designer sees this)"
                aria-label="Send-back note"
                className="flex-1"
              />
              <Button type="submit" variant="outline">
                Send back
              </Button>
            </form>
          </div>
        </Panel>
      )}
    </>
  );

  const revisionsEl = (
    <>
      {revisions && (
        <RevisionsPanel orderId={o.id} status={o.status} isActingAsClient={isActingAsClient} data={revisions} />
      )}
    </>
  );

  const orderEl = (
    <>
      {/* Overview + generic actions */}
      <Panel title="Order" aside={<StatusBadge status={o.status} />}>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="tabular truncate font-mono text-[length:var(--fs-2)] leading-[var(--lh-2)]" title={o.id}>
            {o.id}
          </dd>
          <dt className="text-muted-foreground">Type</dt>
          <dd>{o.product_type}</dd>
          {lastUpdatedAt && (
            <>
              <dt className="text-muted-foreground">Recorded</dt>
              <dd className="tabular font-mono text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{lastUpdatedAt}</dd>
            </>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          {actions.length === 0 && (
            <p className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">No actions available for your role now.</p>
          )}
          {actions.map((to) => (
            <form key={to} action={transitionAction} className="flex items-end gap-1.5">
              <input type="hidden" name="order_id" value={o.id} />
              <input type="hidden" name="to_status" value={to} />
              {to === "ASSIGNED" && (
                <Input
                  name="designer_id"
                  placeholder="designer reference"
                  aria-label="Designer reference to assign"
                  className="h-[var(--ctl-sm)] w-40"
                />
              )}
              <Button type="submit" variant="outline" size="sm">
                <StatusBadge status={to} className="border-0 bg-transparent px-0" />
              </Button>
            </form>
          ))}
        </div>
      </Panel>
    </>
  );

  const moneyEl = (
    <>
      {/* Payment / escrow */}
      {showMoney && (
        <Panel title="Payment">
          {price > 0 && (
            <dl className="grid grid-cols-2 gap-y-1.5 text-[length:var(--fs-3)] leading-[var(--lh-3)] sm:grid-cols-4">
              {(
                [
                  ["Price", formatMoney(price, currency)],
                  ...(o.designer_payout_paise != null ? [["Designer pay", rupees(o.designer_payout_paise)]] : []),
                  ...(o.qc_payout_paise != null ? [["QC pay", rupees(o.qc_payout_paise)]] : []),
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{label}</dt>
                  <dd className="tabular font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {sharePct != null && (
            <p
              className={`mt-2 text-[length:var(--fs-2)] leading-[var(--lh-2)] ${
                payoutShare && sharePct > payoutShare.warnPct ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              Payouts are {sharePct}% of the price
              {payoutShare && sharePct > payoutShare.warnPct ? ` — above the ${payoutShare.warnPct}% limit.` : "."}
            </p>
          )}

          {held > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              <span className="text-muted-foreground">Held in escrow</span>
              <span className="tabular ml-auto font-mono font-medium">
                {formatMoney(held, currency)}
              </span>
            </div>
          )}
          {o.status === "PAYOUT_RELEASED" && (
            <p className={`mt-3 text-[length:var(--fs-3)] leading-[var(--lh-3)] ${TONE_TEXT.success}`}>
              Funds released to the payout legs.
            </p>
          )}
          {o.status === "REFUNDED" && (
            <p className="mt-3 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">Funds refunded to the client.</p>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {canQuote && (
              <form action={quoteAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="order_id" value={o.id} />
                <label className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Category
                  <Select name="category" defaultValue={o.category ?? "C"} className="mt-0.5 w-20">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Price $ (optional)
                  <Input name="price_usd" type="number" min="1" step="0.01" className="mt-0.5 w-28" />
                </label>
                <label className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Deadline h (G–L)
                  <Input name="deadline_hours" type="number" min="1" step="1" className="mt-0.5 w-24" />
                </label>
                <Button type="submit" size="sm">
                  Set quote
                </Button>
                <span className="w-full text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Leave the price empty for the band: A–C $55 ($49 first design), D–F $85, G–L from $120.
                  Designer and QC pay are locked from the category.
                </span>
              </form>
            )}
            {canFund && (
              <PayButton orderId={o.id} amount={price} currency={currency} />
            )}
            {canMarkPaid && (
              <form action={markPaidAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="order_id" value={o.id} />
                <label className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Paid by
                  <Select name="method" defaultValue="wise" className="mt-0.5 w-auto">
                    <option value="wise">Wise transfer</option>
                    <option value="bank">Bank transfer</option>
                    <option value="paypal">PayPal</option>
                    <option value="manual">Other</option>
                  </Select>
                </label>
                <label className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                  Reference
                  <Input name="reference" maxLength={120} className="mt-0.5 w-40" />
                </label>
                <Button type="submit" size="sm" variant="outline">
                  Mark paid
                </Button>
              </form>
            )}
            {canRelease && (
              <form action={releaseEscrowAction}>
                <input type="hidden" name="order_id" value={o.id} />
                <Button type="submit">Release payout</Button>
              </form>
            )}
            {canRefund && (
              <form action={refundEscrowAction}>
                <input type="hidden" name="order_id" value={o.id} />
                <Button type="submit" variant="outline">
                  Refund client
                </Button>
              </form>
            )}
          </div>
        </Panel>
      )}
    </>
  );

  const payoutsEl = (
    <>
      {/* Payouts — FINANCE only. Released money is an OBLIGATION; this is the
          only view of whether it actually reached the people owed it. */}
      {role === "FINANCE" && payoutState && payoutState.owed > 0 && (
        <Panel title="Payouts">
          <PayoutPanel orderId={o.id} currency={currency} state={payoutState} />
        </Panel>
      )}
    </>
  );

  const disputeEl = (
    <>
      {/* Dispute — critical state, shown as a persistent banner (never a toast) */}
      {(openDispute || canRaiseDispute) && (
        <Panel title="Dispute">
          {openDispute ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium text-destructive">Dispute open</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[length:var(--fs-3)] leading-[var(--lh-3)]">{openDispute.reason}</p>
              {(role === "OPS" || role === "FINANCE") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {role === "OPS" && (
                    <form action={resolveDisputeAction}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="resolution" value="REWORK" />
                      <Button type="submit" variant="outline" size="sm">
                        Send back for rework
                      </Button>
                    </form>
                  )}
                  {role === "FINANCE" && (
                    <>
                      <form id={`refund-${o.id}`} action={resolveDisputeAction}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <input type="hidden" name="resolution" value="REFUND" />
                      </form>
                      {/* Red only inside the confirmation (redesign): typed, never one tap. */}
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="secondary" size="sm">
                            Refund the client…
                          </Button>
                        }
                        title="Refund the client?"
                        description="The full amount goes back to the client and the order closes. This cannot be undone."
                        typed="refund"
                        destructive
                        confirmLabel="Refund the client"
                        formId={`refund-${o.id}`}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form action={raiseDisputeAction} className="space-y-2">
              <input type="hidden" name="order_id" value={o.id} />
              <Textarea
                name="reason"
                required
                rows={2}
                maxLength={5000}
                placeholder="Describe the problem with this order…"
                aria-label="Dispute reason"
              />
              <Button type="submit" variant="outline" size="sm">
                Raise a dispute
              </Button>
            </form>
          )}
        </Panel>
      )}
    </>
  );

  const filesEl = (
    <>
      {/* Files */}
      {(visibleFiles.length > 0 || isParticipant) && (
        <Panel title="Files">
          <ul className="divide-y divide-border">
            {visibleFiles.length === 0 && (
              <li className="py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">No files yet.</li>
            )}
            {visibleFiles.map(({ version: v, grant, explanation }) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="tabular font-mono text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                      v{v.version_no}
                    </span>
                    <span>{FILE_KIND_LABELS[v.kind] ?? v.kind}</span>
                  </span>
                  {explanation && (
                    <span className="mt-0.5 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{explanation}</span>
                  )}
                </span>
                {grant === "ALLOW" ? (
                  <a
                    href={`/api/files/${v.id}`}
                    className="shrink-0 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-primary hover:underline"
                  >
                    Download
                  </a>
                ) : (
                  // Named, but not a link. The row is here so the client can see
                  // the work exists and what it is; the sentence above says what
                  // unlocks it. The API returns 404 for this row either way —
                  // this is presentation, not enforcement.
                  <span className="shrink-0 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                    Held
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* Clients attach reference material here; designers use the
              upload slots above (0041). */}
          {isOrderClient && (
            <form action={uploadFileAction} className="mt-3">
              <input type="hidden" name="order_id" value={o.id} />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  name="file"
                  required
                  accept=".png,.jpg,.jpeg,.step,.stp"
                  aria-label="Upload a file"
                  className="text-[length:var(--fs-3)] leading-[var(--lh-3)]"
                />
                {/* What this file IS decides who can download it and when, so it
                    is asked for at upload time rather than guessed from the
                    extension afterwards. A client has one legitimate answer, so
                    they are not asked at all. */}
                <input type="hidden" name="kind" value="CLIENT_REFERENCE" />
                <Button type="submit" variant="outline" size="sm">
                  Upload
                </Button>
              </div>
              <p className="mt-2 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
                PNG, JPEG or STEP. Identifying metadata (EXIF, author and organisation fields) is
                removed before the file is stored — formats we cannot clean are not accepted here.
              </p>
            </form>
          )}
        </Panel>
      )}
    </>
  );

  const threadsEl = (
    <>
      {/* Conversations: client ↔ team and team ↔ designer (DECISIONS §11). */}
      <ThreadsPanel
        orderId={o.id}
        relation={o.relation}
        threads={threads}
        messages={messages}
        attachments={attachments}
      />
    </>
  );

  // The team's layout (A3, Phase 5d): the work and the conversation on the
  // left; moving the work, the price and the money on the right, as the
  // design groups them by the role that acts (Ops, Sales, Finance).
  if (layout === "team") {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {intakeEl}
          {revisionsEl}
          {threadsEl}
          {filesEl}
          {timelineEl}
        </div>
        <aside className="space-y-4">
          {teamTop}
          {disputeEl}
          {slaEl}
          {assignEl}
          {qcEl}
          {orderEl}
          {moneyEl}
          {payoutsEl}
        </aside>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {timelineEl}
      {intakeEl}
      {slaEl}
      {assignEl}
      {checklistEl}
      {slotsEl}
      {qcEl}
      {revisionsEl}
      {orderEl}
      {moneyEl}
      {payoutsEl}
      {disputeEl}
      {filesEl}
      {threadsEl}
    </div>
  );
}
