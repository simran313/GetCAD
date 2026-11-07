import { ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  buildTimeline,
  CLIENT_STEPS,
  clientNextStep,
  clientStepsDone,
  firstLookHours,
  formatDateTime,
  formatRelative,
  whatYouGet,
  type TimelineRawRow,
} from "@/core";
import { Stepper } from "@/components/stepper";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusPill } from "@/components/ui/status-pill";
import { serviceWord } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { viewerZone } from "@/lib/time/zone";

import { fileSize, OrderFiles, visibleFiles, type FileVersionRow } from "../files/OrderFiles";

import { IntakePanel, type ClientContact, type Screenshot } from "./IntakePanel";
import { OrderMenu } from "./OrderMenu";
import { OrderTimeline } from "./OrderTimeline";
import { RevisionsPanel, type RevisionsData } from "./RevisionsPanel";
import { ThreadsPanel } from "./ThreadsPanel";
import type { AttachmentRow, MessageRow, OrderRow, ThreadReads, ThreadRow } from "./types";

/**
 * The client's order page (order hub, Phase 10b; owner, 7 Nov 2026). Where
 * the order is (five labelled stages), the next step in a sentence with its
 * one button, the conversation with the team on the page, and one Details
 * card whose rows open in place: brief, payment, files, revisions, timeline.
 * Cancel and "raise a problem" sit in the overflow. Every action is the same
 * server action as before; only the arrangement is new. The team is only
 * ever "Your team".
 */
export interface BriefLine {
  key: string;
  label: string;
  value: string;
}

const CARD = "rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]";
const SUMMARY =
  "flex min-h-[var(--ctl-lg)] cursor-pointer list-none items-center gap-3 px-[var(--s-4)] py-[var(--s-3)] [&::-webkit-details-marker]:hidden";

function Fold({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className={SUMMARY}>
        <span className="w-20 shrink-0 font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-3)] text-muted-foreground">{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

function Rows({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 px-[var(--s-4)] py-[var(--s-2)] text-[length:var(--fs-2)]">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 text-right">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export async function ClientOrderView({
  order: o,
  title,
  clientPo,
  briefLines,
  held,
  revisions,
  messages,
  attachments,
  files,
  fileNames,
  fileShas,
  unread,
  intake,
  timelineRows,
  threads = [],
  reads = {},
  afterDelivery = null,
}: {
  order: OrderRow & { service?: string; created_at?: string };
  title: string;
  clientPo: string | null;
  briefLines: BriefLine[];
  held: number;
  revisions: RevisionsData;
  messages: MessageRow[];
  attachments: AttachmentRow[];
  files: FileVersionRow[];
  fileNames: Map<string, string>;
  fileShas: Map<string, string>;
  /** Unread message notifications on this order. */
  unread: number;
  intake: { screenshots: Screenshot[]; contact: ClientContact | null; orderUrl: string | null } | null;
  timelineRows: TimelineRawRow[];
  /** The client's thread with the team (order_threads gives a client only that one). */
  threads?: ThreadRow[];
  reads?: ThreadReads;
  /** Phase 7b: the share-a-preview card and spec claims, once approved. */
  afterDelivery?: React.ReactNode;
}) {
  const tz = await viewerZone();
  const currency = o.currency ?? "USD";
  const service = o.service ?? "cad";
  const price = o.price_total ? formatMoney(o.price_total, currency) : null;
  const running = o.sla_status === "running" && !!o.sla_due_at;
  const step = clientNextStep(o.id, o.status, {
    price,
    tier: o.tier,
    complexHours: o.complex_deadline_hours,
    service,
    roundsUsed: revisions.allowance?.used ?? revisions.rounds.length,
    firstLookBy: running ? formatDateTime(o.sla_due_at!, tz) : null,
  });
  const done = clientStepsDone(o.status);
  const quoted = o.status === "QUOTED" && !!price;
  const hours = firstLookHours(o.tier, o.complex_deadline_hours);
  const actionLabel = step.action === "Pay & start" && price ? `Pay ${price} & start` : step.action;

  // Tiles: what each one says without opening it.
  // Only the client–team thread reaches a client (order_threads); the rest is empty for them.
  const last = messages.filter((m) => m.thread_kind === "client_team").at(-1);
  const shared = attachments;
  const fileCount = visibleFiles(o, files, "CLIENT").length + shared.length;
  const steps = buildTimeline(timelineRows);
  const latest = steps.at(-1);
  const { allowance, rounds } = revisions;

  const cancel = o.status === "DRAFT" ? "Delete draft" : ["SUBMITTED", "QUOTED"].includes(o.status) ? "Cancel order" : null;
  const problem = ["IN_PROGRESS", "CLIENT_PREVIEW"].includes(o.status);
  const briefValue = briefLines
    .filter((l) => l.key === "product" || l.key === "metal")
    .map((l) => l.value)
    .join(" · ");

  const firstLook = running ? (
    <SlaCountdown dueAt={o.sla_due_at!} />
  ) : o.sla_status === "met" ? (
    <StatusPill tone="success">Done on time</StatusPill>
  ) : o.sla_status === "breached" || o.sla_status === "breached_credited" ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusPill tone="danger">Missed</StatusPill> The full amount comes back as credit.
    </span>
  ) : (
    <span className="text-muted-foreground">Starts once you pay and we confirm the brief.</span>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={[o.display_ref ?? "Draft", serviceWord(service), clientPo ? `PO ${clientPo}` : null].filter(Boolean).join(" · ")}
        title={title}
        actions={
          <>
            {/* The stages and the next step say where it is; the badge only when there is no journey (cancelled, refunded). */}
            {done === null && <StatusBadge status={o.status} />}
            <OrderMenu orderId={o.id} name={title} cancel={cancel} problem={problem} />
          </>
        }
      />

      {done !== null && <Stepper layout="fit" steps={CLIENT_STEPS.map((label) => ({ label }))} current={done} />}

      {/* The next step leads the page: what happens next, when, and the one
          thing to press when it is the client's turn (black rail). */}
      <section
        aria-labelledby="next-title"
        data-variant={step.action ? "action" : "focus"}
        className={`${CARD} relative space-y-3 border-foreground/80 p-[var(--s-5)] shadow-[var(--e-focus)] ${
          step.action
            ? "before:absolute before:-inset-y-px before:-left-px before:w-1 before:rounded-l-[var(--r-lg)] before:bg-[image:var(--brand-rail)] before:content-['']"
            : ""
        }`}
      >
        <h2 id="next-title" className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">
          {step.headline}
        </h2>
        {quoted ? (
          <div className="space-y-1">
            <p className="tabular text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)]">{price}</p>
            {hours && <p className="text-[length:var(--fs-3)] text-muted-foreground">First look within {hours} h</p>}
            <details className="group text-[length:var(--fs-2)]">
              <summary className="inline-flex min-h-[var(--ctl-sm)] cursor-pointer list-none items-center gap-1 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                What&apos;s included
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-1 text-muted-foreground">{whatYouGet(service)}</p>
            </details>
          </div>
        ) : (
          (step.detail || running) && (
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-3)] text-muted-foreground">
              {step.detail}
              {running && <SlaCountdown dueAt={o.sla_due_at!} />}
            </p>
          )
        )}
        {step.action && (
          <div className="fixed inset-x-0 bottom-[var(--chrome-bottom)] z-10 border-t border-border bg-background/95 px-[var(--s-4)] py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <Link href={step.href} className={buttonVariants({ size: "lg", className: "w-full md:w-auto" })}>
              {actionLabel}
            </Link>
            {quoted && <p className="mt-1.5 text-center text-[length:var(--fs-1)] text-muted-foreground md:text-left">Nothing is charged until you pay</p>}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {intake && <IntakePanel order={o} screenshots={intake.screenshots} contact={intake.contact} orderUrl={intake.orderUrl} />}
          {/* The conversation with the team, on the page (owner, 7 Nov 2026). */}
          {threads.length > 0 && (
            <ThreadsPanel orderId={o.id} relation="CLIENT" threads={threads} messages={messages} attachments={attachments} reads={reads} />
          )}
          {afterDelivery}
        </div>

        {/* Everything else about the order, one row each, opening in place. */}
        <aside className="min-w-0">
          <section aria-label="Order details" className={`${CARD} divide-y divide-border overflow-hidden`}>
            <h2 className="px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--fs-4)] font-semibold">Details</h2>
            <Fold label="Brief" value={briefValue || "Not started"}>
              {briefLines.length > 0 && <Rows rows={briefLines} />}
              <Link
                href={`/orders/${o.id}/brief`}
                className="flex min-h-[var(--ctl)] items-center border-t border-border px-[var(--s-4)] text-[length:var(--fs-3)] underline underline-offset-4"
              >
                {o.status === "DRAFT" || o.status === "SUBMITTED" ? "Edit the brief" : "Open the brief"}
              </Link>
            </Fold>
            <Fold label="Payment" value={price ? `${price}${held > 0 ? " · paid" : ""}` : "Price coming"}>
              <Rows
                rows={[
                  { label: "Price", value: price ?? "Price coming" },
                  ...(held > 0 ? [{ label: "Paid", value: formatMoney(held, currency) }] : []),
                  ...(o.category ? [{ label: "Category", value: <CategoryBadge letter={o.category} /> }] : []),
                  { label: "First look", value: firstLook },
                ]}
              />
              <Link
                href="/wallet/invoices"
                className="flex min-h-[var(--ctl)] items-center border-t border-border px-[var(--s-4)] text-[length:var(--fs-3)] underline underline-offset-4"
              >
                Invoices
              </Link>
            </Fold>
            <Fold label="Files" value={fileCount === 0 ? "None yet" : `${fileCount} ${fileCount === 1 ? "file" : "files"}`}>
              <div className="px-[var(--s-4)] py-[var(--s-3)]">
                <OrderFiles order={{ id: o.id, status: o.status, service }} files={files} role="CLIENT" names={fileNames} shas={fileShas} />
                {shared.length > 0 && (
                  <section className="mt-5 space-y-1">
                    <h3 className="text-[length:var(--fs-3)] font-medium">In chat</h3>
                    <ul className="divide-y divide-border">
                      {shared.map((a) => (
                        <li key={a.id}>
                          <a href={`/api/thread-files/${a.id}`} className="flex min-h-[var(--ctl)] items-center justify-between gap-3 text-[length:var(--fs-3)] hover:underline">
                            <span className="min-w-0 truncate">{a.file_name}</span>
                            <span className="shrink-0 text-[length:var(--fs-2)] text-muted-foreground">{fileSize(a.size_bytes)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <Link href="/files" className="mt-3 inline-flex min-h-[var(--ctl)] items-center text-[length:var(--fs-3)] underline underline-offset-4">
                  All your files
                </Link>
              </div>
            </Fold>
            <Fold
              label="Revisions"
              value={allowance ? `${allowance.used} of ${allowance.included} used` : rounds.length > 0 ? `${rounds.length} rounds` : "2 included"}
            >
              <div className="px-[var(--s-4)] py-[var(--s-3)]">
                <RevisionsPanel orderId={o.id} status={o.status} isActingAsClient data={revisions} bare />
              </div>
            </Fold>
            <Fold label="Timeline" value={latest ? `${latest.label} · ${formatRelative(latest.createdAt, tz)}` : "No events yet"}>
              <div className="px-[var(--s-4)] py-[var(--s-3)]">
                <OrderTimeline rows={timelineRows} currency={currency} />
              </div>
            </Fold>
          </section>
        </aside>
      </div>

      {step.action && <div className="h-24 md:hidden" aria-hidden />}
    </Page>
  );
}
