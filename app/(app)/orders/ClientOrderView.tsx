import { ChevronDown, FileText, History, MessageSquare, RotateCcw } from "lucide-react";
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
import { HubTile } from "./HubTile";
import { IntakePanel, type ClientContact, type Screenshot } from "./IntakePanel";
import { OrderMenu } from "./OrderMenu";
import { OrderTimeline } from "./OrderTimeline";
import { RevisionsPanel, type RevisionsData } from "./RevisionsPanel";
import type { AttachmentRow, MessageRow, OrderRow } from "./types";

/**
 * The client's order page (order hub, Phase 10b). Where the order is (five
 * labelled stages), the one next step with its one button, then four tiles:
 * Chat (the conversation's own screen), Files, Revisions and Timeline (each
 * in a sheet). Brief and payment fold into rows; cancel and "raise a
 * problem" sit in the overflow. Every action is the same server action as
 * before; only the arrangement is new. The team is only ever "Your team".
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
    <details className={`${CARD} group`}>
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

  return (
    <Page>
      <PageHeader
        eyebrow={[o.display_ref ?? "Draft", serviceWord(service), clientPo ? `PO ${clientPo}` : null].filter(Boolean).join(" · ")}
        title={title}
        actions={
          <>
            <StatusBadge status={o.status} />
            <OrderMenu orderId={o.id} name={title} cancel={cancel} problem={problem} />
          </>
        }
      />

      {done !== null && <Stepper layout="fit" steps={CLIENT_STEPS.map((label) => ({ label }))} current={done} />}

      <section aria-labelledby="next-title" className={`${CARD} space-y-3 p-[var(--s-5)]`}>
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
          <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 border-t border-border bg-background/95 px-[var(--s-4)] py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <Link href={step.href} className={buttonVariants({ size: "lg", className: "w-full md:w-auto" })}>
              {actionLabel}
            </Link>
            {quoted && <p className="mt-1.5 text-center text-[length:var(--fs-1)] text-muted-foreground md:text-left">Nothing is charged until you pay</p>}
          </div>
        )}
      </section>

      {intake && <IntakePanel order={o} screenshots={intake.screenshots} contact={intake.contact} orderUrl={intake.orderUrl} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubTile
          icon={<MessageSquare />}
          label="Chat"
          href={`/messages/${o.id}`}
          badge={unread}
          line={last ? `${last.is_mine ? "You" : "Your team"}: ${last.body}` : "Ask your team"}
        />
        <HubTile icon={<FileText />} label="Files" line={fileCount === 0 ? "None yet" : `${fileCount} ${fileCount === 1 ? "file" : "files"}`}>
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
          <Link href="/files" className="mt-5 inline-flex min-h-[var(--ctl)] items-center text-[length:var(--fs-3)] underline underline-offset-4">
            All your files
          </Link>
        </HubTile>
        <HubTile
          icon={<RotateCcw />}
          label="Revisions"
          line={allowance ? `${allowance.used} of ${allowance.included} used` : rounds.length > 0 ? `${rounds.length} rounds` : "2 included"}
        >
          <RevisionsPanel orderId={o.id} status={o.status} isActingAsClient data={revisions} bare />
        </HubTile>
        <HubTile icon={<History />} label="Timeline" line={latest ? `${latest.label} · ${formatRelative(latest.createdAt, tz)}` : "No events yet"}>
          <div className="mb-5 space-y-1 text-[length:var(--fs-2)]">
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-3)] font-medium">
              First look <CategoryBadge letter={o.category} />
            </p>
            {running ? (
              <SlaCountdown dueAt={o.sla_due_at!} />
            ) : o.sla_status === "met" ? (
              <StatusPill tone="success">Done on time</StatusPill>
            ) : o.sla_status === "breached" || o.sla_status === "breached_credited" ? (
              <p className="flex flex-wrap items-center gap-2">
                <StatusPill tone="danger">Missed</StatusPill> The full amount comes back as credit.
              </p>
            ) : (
              <p className="text-muted-foreground">Starts once you pay and we confirm the brief.</p>
            )}
            <p className="text-muted-foreground">
              {o.tier === "complex" ? `Complex piece · ${o.complex_deadline_hours ?? "—"} h deadline` : "Within 6 h of confirmation"}
            </p>
          </div>
          <OrderTimeline rows={timelineRows} currency={currency} />
        </HubTile>
      </div>

      <div className="space-y-2">
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
            ]}
          />
          <Link
            href="/wallet/invoices"
            className="flex min-h-[var(--ctl)] items-center border-t border-border px-[var(--s-4)] text-[length:var(--fs-3)] underline underline-offset-4"
          >
            Invoices
          </Link>
        </Fold>
      </div>

      {afterDelivery}

      {step.action && <div className="h-20 md:hidden" aria-hidden />}
    </Page>
  );
}
