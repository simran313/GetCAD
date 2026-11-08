import { availableTransitions, fileGrantFor, grantExplanation, type FileKind, type TimelineRawRow, type TransitionRow, formatDateTime } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
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
import type { AttachmentRow, ChatBrief, DisputeRow, MessageRow, OrderRow, ThreadReads, ThreadRow, VersionRow } from "./types";
import { viewerZone } from "@/lib/time/zone";

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
  TECHNICAL_SHEET: "Technical sheet",
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

/** What the team page knows that this component does not load itself. */
export interface TeamContext {
  /** staffNext().why: the next move in a sentence. */
  why: string;
  /** "Pod One · Priya", or null before a pod is chosen. */
  pod: string | null;
  designerRef: string | null;
  clientCode: string | null;
  /** The pod picker (admin), or null when the pod can no longer move. */
  podPicker: React.ReactNode | null;
  /** The brief as rows, shown first in the main column. */
  brief: React.ReactNode;
  /** Documents, the work line and "Issue certificate", in the facts card. */
  extras: React.ReactNode;
  /** The QC review link for the pod lead while the job is in QC. */
  qcHref: string | null;
}


const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/**
 * Where the first-look clock stands (DECISIONS §6, v1.1): it starts only once
 * the order is both paid and confirmed by the team.
 */
function slaLine(o: OrderRow, tz: string): string {
  const when = (iso: string) => formatDateTime(iso, tz);
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

export async function OrderDetail({
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
  reads,
  chatBrief = null,
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
  team = null,
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
  /** How far the other side has read each thread (the ticks). */
  reads?: ThreadReads;
  /** The brief as the first message of the conversations (owner, 7 Nov 2026). */
  chatBrief?: ChatBrief | null;
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
  /** The team layout's side cards under the order facts (instructions, latest, claims). */
  teamTop?: React.ReactNode;
  /** The team layout's next step and facts (owner, 7 Nov 2026: one next action, one place). */
  team?: TeamContext | null;
}) {
  const tz = await viewerZone();
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
    ? formatDateTime(lastEvent.created_at, tz)
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
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">{slaLine(o, tz)}</p>
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

  // Assigning the designer is the pod lead's job (owner, 4 Nov 2026); an
  // admin keeps it as an exception, folded away so the page shows one next step.
  const assignEl = (
    <>
      {designers &&
        (isAdmin ? (
          <details className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] px-[var(--s-4)] py-[var(--s-3)]">
            <summary className="cursor-pointer text-[length:var(--fs-3)] font-medium">
              Exception: assign a designer yourself
              <span className="ml-2 font-normal text-muted-foreground">Normally the pod lead does this.</span>
            </summary>
            <div className="mt-3">
              <AssignPanel orderId={o.id} designers={designers} />
            </div>
          </details>
        ) : (
          <AssignPanel orderId={o.id} designers={designers} />
        ))}
    </>
  );

  const checklistEl = (
    <>
      {checklist && (
        <ChecklistPanel
          orderId={o.id}
          rows={checklist}
          canMark={isOrderDesigner && o.status === "IN_PROGRESS" ? "DESIGNER" : o.relation === "POD_LEAD" && o.status === "QC_REVIEW" ? "MANAGER" : null}
          zone={tz}
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
                  ...(o.qc_payout_paise != null ? [["Pod pay", rupees(o.qc_payout_paise)]] : []),
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
                  Leave the price empty for the band: A–C $35, D–F $85, G–L from $120.
                  Designer pay is the category minutes × the designer&apos;s rate; pod pay follows it.
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
                <FilePicker name="file" required accept=".png,.jpg,.jpeg,.step,.stp" label="Upload a file" />
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
        reads={reads}
        brief={chatBrief}
      />
    </>
  );

  // The team's layout (A3; owner, 7 Nov 2026): one next step at the top,
  // with the one action it needs in the card; everything else this role may
  // do folded under "Other actions"; the order's facts in one card; the brief
  // and the conversations in the main column. Same actions, same rules.
  if (layout === "team" && team) {
    const forward = actions.find((to) => to === "DELIVERED" || to === "CLOSED") ?? null;
    const choosePod = o.status === "PAYMENT_HELD" && !team.pod && !!team.podPicker;
    const confirmNow = canConfirm && o.status === "PAYMENT_HELD" && !!team.pod;
    // Assigning is the next step once paid and confirmed; once assigned, moving it is an other action.
    const assignNow = !!designers && !isAdmin && !confirmNow && o.status === "PAYMENT_HELD";
    const field = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

    const quoteForm = (
      <form action={quoteAction} className="space-y-3">
        <input type="hidden" name="order_id" value={o.id} />
        <div className="grid grid-cols-3 gap-2">
          <label className={field}>
            Category
            <Select name="category" defaultValue={o.category ?? "C"} className="mt-1">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className={field}>
            Price $ (optional)
            <Input name="price_usd" type="number" min="1" step="0.01" className="mt-1" />
          </label>
          <label className={field}>
            Deadline h (G–L)
            <Input name="deadline_hours" type="number" min="1" step="1" className="mt-1" />
          </label>
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Set quote
        </Button>
        <p className={field}>Price empty = the band: A–C $35, D–F $85, G–L from $120. Designer and pod pay follow the category.</p>
      </form>
    );
    const markPaidForm = (
      <form action={markPaidAction} className="space-y-3">
        <input type="hidden" name="order_id" value={o.id} />
        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            Paid by
            <Select name="method" defaultValue="wise" className="mt-1">
              <option value="wise">Wise transfer</option>
              <option value="bank">Bank transfer</option>
              <option value="paypal">PayPal</option>
              <option value="manual">Other</option>
            </Select>
          </label>
          <label className={field}>
            Reference
            <Input name="reference" maxLength={120} className="mt-1" />
          </label>
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Mark paid
        </Button>
      </form>
    );
    const confirmForm = (secondary: boolean) => (
      <form action={confirmOrderAction} className="space-y-2">
        <input type="hidden" name="order_id" value={o.id} />
        <Button type="submit" size={secondary ? "sm" : "lg"} variant={secondary ? "outline" : "default"} className={secondary ? undefined : "w-full sm:w-auto"}>
          Confirm order
        </Button>
        <p className={field}>Starts the first-look clock. Press once the brief is complete and open questions are answered.</p>
      </form>
    );
    const transitionForm = (to: string, primary: boolean) => (
      <form key={to} action={transitionAction}>
        <input type="hidden" name="order_id" value={o.id} />
        <input type="hidden" name="to_status" value={to} />
        <Button type="submit" size={primary ? "lg" : "sm"} variant={primary ? "default" : "outline"} className={primary ? "w-full sm:w-auto" : undefined}>
          <StatusBadge status={to} className={primary ? "border-0 bg-transparent px-0 text-inherit" : "border-0 bg-transparent px-0"} />
        </Button>
      </form>
    );

    // The one thing to do now, in priority order.
    const primary: React.ReactNode = canQuote ? (
      quoteForm
    ) : canMarkPaid ? (
      markPaidForm
    ) : choosePod ? (
      team.podPicker
    ) : confirmNow ? (
      confirmForm(false)
    ) : assignNow ? (
      <AssignPanel orderId={o.id} designers={designers!} />
    ) : team.qcHref && isQcDecision ? (
      <a href={team.qcHref} className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
        Open the QC review
      </a>
    ) : forward ? (
      transitionForm(forward, true)
    ) : canRelease ? (
      <form action={releaseEscrowAction}>
        <input type="hidden" name="order_id" value={o.id} />
        <Button type="submit" size="lg">
          Release payout
        </Button>
      </form>
    ) : null;

    const others: React.ReactNode[] = [
      ...actions.filter((to) => to !== forward).map((to) => transitionForm(to, false)),
      ...(canConfirm && !confirmNow ? [<div key="confirm">{confirmForm(true)}</div>] : []),
      ...(team.podPicker && !choosePod
        ? [
            <div key="pod" className="space-y-1">
              <p className={field}>{team.pod ? "Move to another pod" : "Choose a pod"}</p>
              {team.podPicker}
            </div>,
          ]
        : []),
      // Not before the order is confirmed: confirming comes first.
      ...(designers && !assignNow && !confirmNow
        ? [
            <div key="assign" className="space-y-1">
              <p className={field}>{isAdmin ? "Exception: assign a designer yourself · normally the pod lead does this" : "Give it to another designer"}</p>
              <AssignPanel orderId={o.id} designers={designers} />
            </div>,
          ]
        : []),
      ...(canRefund
        ? [
            <form key="refund" action={refundEscrowAction}>
              <input type="hidden" name="order_id" value={o.id} />
              <Button type="submit" size="sm" variant="outline">
                Refund client
              </Button>
            </form>,
          ]
        : []),
    ];

    const why = team.why.charAt(0).toUpperCase() + team.why.slice(1);
    const nextEl = openDispute ? (
      disputeEl
    ) : (
      <Card as="section" variant={primary ? "action" : "focus"} aria-labelledby="next-step">
        <CardHeader>
          <CardTitle id="next-step">Next step</CardTitle>
          <StatusBadge status={o.status} />
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <p className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">{why}</p>
            {showSla && <p className={`mt-1 ${field}`}>{slaLine(o, tz)}</p>}
          </div>
          {primary}
          {others.length > 0 && (
            <details className="group border-t border-border pt-3">
              <summary className="cursor-pointer list-none text-[length:var(--fs-3)] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                Other actions <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 flex flex-wrap items-start gap-3">{others}</div>
            </details>
          )}
        </CardBody>
      </Card>
    );

    const fact = (label: string, value: React.ReactNode) => (
      <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="min-w-0 text-right">{value}</dd>
      </div>
    );
    const factsEl = (
      <Panel title="Order" aside={<StatusBadge status={o.status} />}>
        <dl className="divide-y divide-border text-[length:var(--fs-3)] leading-[var(--lh-3)]">
          {fact("Pod", team.pod ?? "Not chosen")}
          {fact("Designer", team.designerRef ?? "Not assigned")}
          {team.clientCode && fact("Client", <span className="tabular font-mono">{team.clientCode}</span>)}
          {o.category && fact("Category", `${o.category} · ${o.tier === "complex" ? `complex, ${o.complex_deadline_hours ?? "—"} h` : "standard, 6 h"}`)}
          {price > 0 && fact("Price", <span className="tabular font-mono">{formatMoney(price, currency)}</span>)}
          {o.designer_payout_paise != null && fact("Designer pay", <span className="tabular font-mono">{rupees(o.designer_payout_paise)}</span>)}
          {o.qc_payout_paise != null && fact("Pod pay", <span className="tabular font-mono">{rupees(o.qc_payout_paise)}</span>)}
          {held > 0 && fact("Held in escrow", <span className="tabular font-mono font-medium">{formatMoney(held, currency)}</span>)}
        </dl>
        {sharePct != null && (
          <p className={`mt-2 text-[length:var(--fs-2)] leading-[var(--lh-2)] ${payoutShare && sharePct > payoutShare.warnPct ? "text-destructive" : "text-muted-foreground"}`}>
            Payouts are {sharePct}% of the price
            {payoutShare && sharePct > payoutShare.warnPct ? ` — above the ${payoutShare.warnPct}% limit.` : "."}
          </p>
        )}
        {o.status === "PAYOUT_RELEASED" && <p className={`mt-2 text-[length:var(--fs-3)] ${TONE_TEXT.success}`}>Funds released to the payout legs.</p>}
        {o.status === "REFUNDED" && <p className="mt-2 text-[length:var(--fs-3)] text-muted-foreground">Funds refunded to the client.</p>}
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-[length:var(--fs-2)]">
          {team.extras}
          <p className="tabular truncate font-mono text-muted-foreground" title={o.id}>
            {o.id}
          </p>
        </div>
      </Panel>
    );

    return (
      <div className="space-y-6">
        {nextEl}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="order-2 min-w-0 space-y-4 lg:order-1">
            {team.brief}
            {intakeEl}
            {revisionsEl}
            {threadsEl}
            {filesEl}
            {timelineEl}
          </div>
          <aside className="order-1 min-w-0 space-y-4 lg:order-2">
            {factsEl}
            {teamTop}
            {payoutsEl}
          </aside>
        </div>
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
