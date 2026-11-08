import { ChevronDown, ClipboardList, CreditCard, FileText, History, RotateCcw } from "lucide-react";
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
import { ThreadsPanel } from "./ThreadsPanel";
import type { AttachmentRow, ChatBrief, MessageRow, OrderRow, ThreadReads, ThreadRow } from "./types";

/**
 * The client's order page (order hub, Phase 10b; owner, 7 Nov 2026). Where
 * the order is (five labelled stages), the next step in a sentence with its
 * one button, then the order at a glance as cards (files, payment,
 * revisions, brief, timeline: the one that matters now first and
 * highlighted, each opening its sheet), the conversation with the team, and
 * after delivery the spec guarantee and then the 3D preview link.
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
  chatBrief = null,
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
  /** The brief as the first message of the conversation (owner, 7 Nov 2026). */
  chatBrief?: ChatBrief | null;
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

  // Which card matters now: files once there is something to download,
  // payment while a price waits, revisions while a version waits for review,
  // the brief while it is a draft.
  const delivered = ["APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED"].includes(o.status);
  const briefWords = briefLines.filter((l) => l.key === "metal").map((l) => l.value).join(" · ");
  const product = briefLines.find((l) => l.key === "product")?.value ?? null;
  const cardList: { key: string; emphasis?: string; el: React.ReactNode }[] = [
    {
      key: "files",
      emphasis: delivered && fileCount > 0 ? "Ready" : undefined,
      el: (
        <HubTile
          icon={<FileText />}
          label="Files"
          value={fileCount}
          line={fileCount === 0 ? "None yet" : delivered ? "Ready to download" : `${fileCount === 1 ? "file" : "files"} so far`}
          emphasis={delivered && fileCount > 0 ? "Ready" : undefined}
        >
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
      ),
    },
    {
      key: "payment",
      emphasis: quoted ? "To pay" : undefined,
      el: (
        <HubTile
          icon={<CreditCard />}
          label="Payment"
          value={price ?? "—"}
          line={held > 0 ? "Paid" : quoted ? "Waiting for you" : price ? "Price set" : "We're pricing it"}
          emphasis={quoted ? "To pay" : undefined}
        >
          <Rows
            rows={[
              { label: "Price", value: price ?? "Price coming" },
              ...(held > 0 ? [{ label: "Paid", value: formatMoney(held, currency) }] : []),
              ...(o.category ? [{ label: "Category", value: <CategoryBadge letter={o.category} /> }] : []),
              { label: "First look", value: firstLook },
            ]}
          />
          <Link href="/wallet/invoices" className="mt-3 inline-flex min-h-[var(--ctl)] items-center text-[length:var(--fs-3)] underline underline-offset-4">
            Invoices
          </Link>
        </HubTile>
      ),
    },
    {
      key: "revisions",
      emphasis: o.status === "CLIENT_PREVIEW" ? "Review" : undefined,
      el: (
        <HubTile
          icon={<RotateCcw />}
          label="Revisions"
          value={allowance ? `${allowance.used} of ${allowance.included}` : rounds.length > 0 ? String(rounds.length) : "0 of 2"}
          line={allowance || rounds.length === 0 ? "rounds used" : "rounds"}
          emphasis={o.status === "CLIENT_PREVIEW" ? "Review" : undefined}
        >
          <RevisionsPanel orderId={o.id} status={o.status} isActingAsClient data={revisions} bare />
        </HubTile>
      ),
    },
    {
      key: "brief",
      emphasis: o.status === "DRAFT" ? "Finish" : undefined,
      el: (
        <HubTile
          icon={<ClipboardList />}
          label="Brief"
          value={product ?? "Not started"}
          line={briefWords || (o.status === "DRAFT" ? "Draft" : "—")}
          emphasis={o.status === "DRAFT" ? "Finish" : undefined}
        >
          {briefLines.length > 0 && <Rows rows={briefLines} />}
          <Link href={`/orders/${o.id}/brief`} className="mt-3 inline-flex min-h-[var(--ctl)] items-center text-[length:var(--fs-3)] underline underline-offset-4">
            {o.status === "DRAFT" || o.status === "SUBMITTED" ? "Edit the brief" : "Open the brief"}
          </Link>
        </HubTile>
      ),
    },
    {
      key: "timeline",
      el: (
        <HubTile
          icon={<History />}
          label="Timeline"
          // The large slot fits a short fact: when it last moved; what moved is the line
          // under it (owner, 8 Nov 2026: "Payment rec…" was cut off).
          value={latest ? formatRelative(latest.createdAt, tz) : "—"}
          line={latest ? latest.label : "No events yet"}
        >
          <div className="mb-5 space-y-1 text-[length:var(--fs-2)]">
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-3)] font-medium">
              First look <CategoryBadge letter={o.category} />
            </p>
            <p>{firstLook}</p>
            <p className="text-muted-foreground">
              {o.tier === "complex" ? `Complex piece · ${o.complex_deadline_hours ?? "—"} h deadline` : "Within 6 h of confirmation"}
            </p>
          </div>
          <OrderTimeline rows={timelineRows} currency={currency} />
        </HubTile>
      ),
    },
  ];
  // The one that matters leads; the rest keep their order.
  const cards = [...cardList.filter((c) => c.emphasis), ...cardList.filter((c) => !c.emphasis)];

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

      {/* The order at a glance (owner, 7 Nov 2026: cards, not a list). The
          card that matters at this stage leads, full width on a phone, with
          a black edge; each opens its details in a sheet. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c, i) => {
          // On a phone: the leading card takes the row, and so does a last card left on its own.
          const lead = i === 0 && !!c.emphasis;
          const alone = i === cards.length - 1 && (cards.length - (cards[0]?.emphasis ? 1 : 0)) % 2 === 1;
          return (
            <div key={c.key} className={lead || alone ? "col-span-2 lg:col-span-1" : undefined}>
              {c.el}
            </div>
          );
        })}
      </div>

      {intake && <IntakePanel order={o} screenshots={intake.screenshots} contact={intake.contact} orderUrl={intake.orderUrl} />}

      {/* The conversation with the team, on the page; beside it at desk width
          what comes after delivery (the guarantee, then sharing). */}
      <div className={afterDelivery ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" : undefined}>
        {threads.length > 0 && (
          <div className="min-w-0">
            <ThreadsPanel orderId={o.id} relation="CLIENT" threads={threads} messages={messages} attachments={attachments} reads={reads} brief={chatBrief} />
          </div>
        )}
        {afterDelivery && <div className="min-w-0 space-y-4">{afterDelivery}</div>}
      </div>

      {step.action && <div className="h-24 md:hidden" aria-hidden />}
    </Page>
  );
}
