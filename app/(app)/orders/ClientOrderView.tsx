import Link from "next/link";

import { CLIENT_STEPS, clientNextStep, clientStepsDone, type TimelineRawRow } from "@/core";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Textarea } from "@/components/ui/textarea";
import { Timer } from "@/components/ui/timer";
import { serviceWord, shortDate } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { raiseDisputeAction, transitionAction } from "./actions";
import { IntakePanel, type ClientContact, type Screenshot } from "./IntakePanel";
import { OrderTimeline } from "./OrderTimeline";
import { RevisionsPanel, type RevisionsData } from "./RevisionsPanel";
import { ThreadsPanel } from "./ThreadsPanel";
import type { AttachmentRow, MessageRow, OrderRow, ThreadRow } from "./types";

/**
 * C4 — one order, for its client (docs/design). The next step first, the
 * first-look clock, the seven-step journey, then the brief, payment,
 * revisions, conversation and history. Every action calls the same database
 * functions as before; only the layout is new.
 */
export interface BriefLine {
  label: string;
  value: string;
}

export function ClientOrderView({
  order: o,
  title,
  clientPo,
  briefLines,
  held,
  revisions,
  threads,
  messages,
  attachments,
  intake,
  timelineRows,
}: {
  order: OrderRow & { service?: string; created_at?: string };
  title: string;
  clientPo: string | null;
  briefLines: BriefLine[];
  held: number;
  revisions: RevisionsData;
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  intake: { screenshots: Screenshot[]; contact: ClientContact | null; orderUrl: string | null } | null;
  timelineRows: TimelineRawRow[];
}) {
  const step = clientNextStep(o.id, o.status);
  const done = clientStepsDone(o.status);
  const currency = o.currency ?? "USD";
  const canCancel = ["DRAFT", "SUBMITTED", "QUOTED"].includes(o.status);
  const canDispute = ["IN_PROGRESS", "CLIENT_PREVIEW"].includes(o.status);

  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <PageHeader
        eyebrow={[`Order · ${o.display_ref ?? "draft"}`, o.created_at ? `Ordered ${shortDate(o.created_at)}` : null]
          .filter(Boolean)
          .join(" · ")}
        title={title}
        description={[serviceWord(o.service ?? "cad"), clientPo ? `Your PO ${clientPo}` : null].filter(Boolean).join(" · ")}
        actions={<StatusBadge status={o.status} />}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[length:var(--fs-4)] font-medium">{step.headline}</p>
          <div className="flex flex-wrap gap-2">
            {step.href !== `/orders/${o.id}` && (
              <Link href={step.href} className={buttonVariants({ size: "sm" })}>
                {o.status === "QUOTED" && o.price_total ? `Pay ${formatMoney(o.price_total, currency)}` : step.action}
              </Link>
            )}
            <Link href={`/messages/${o.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Message
            </Link>
            <Link href="/files" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Files
            </Link>
          </div>
        </CardBody>
      </Card>

      <ol aria-label="Progress" className="grid grid-cols-7 gap-1">
        {CLIENT_STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span className={cn("h-1 rounded-[var(--r-full)]", i < done ? "bg-primary" : "bg-muted")} aria-hidden />
            <span
              className={cn(
                "hidden font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] sm:block",
                i < done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </span>
          </li>
        ))}
      </ol>

      {intake && <IntakePanel order={o} screenshots={intake.screenshots} contact={intake.contact} orderUrl={intake.orderUrl} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div id="revisions">
            <RevisionsPanel orderId={o.id} status={o.status} isActingAsClient data={revisions} />
          </div>
          <ThreadsPanel orderId={o.id} relation={o.relation} threads={threads} messages={messages} attachments={attachments} />
          <details className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            <summary className="cursor-pointer px-[var(--s-5)] py-[var(--s-4)] text-[length:var(--fs-3)] font-medium">
              History · {timelineRows.length}
            </summary>
            <div className="px-[var(--s-5)] pb-[var(--s-5)]">
              <OrderTimeline rows={timelineRows} currency={currency} />
            </div>
          </details>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>First look</CardTitle>
              <CategoryBadge letter={o.category} />
            </CardHeader>
            <CardBody className="space-y-2 text-[length:var(--fs-2)]">
              {o.sla_status === "running" && o.sla_due_at ? (
                <Timer dueAt={o.sla_due_at} label="Due in" />
              ) : o.sla_status === "met" ? (
                <StatusTag kind="done">Met</StatusTag>
              ) : o.sla_status === "breached" || o.sla_status === "breached_credited" ? (
                <StatusTag kind="needs">Late — credit due</StatusTag>
              ) : (
                <p className="text-muted-foreground">
                  The clock starts once you have paid and we have confirmed the brief.
                </p>
              )}
              <p className="text-muted-foreground">
                {o.tier === "complex"
                  ? `Complex piece · ${o.complex_deadline_hours ?? "—"} h deadline`
                  : "Standard · first look within 6 hours of confirmation"}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brief</CardTitle>
              <Link href={`/orders/${o.id}/brief`} className="text-[length:var(--fs-2)] underline underline-offset-4">
                {o.status === "DRAFT" || o.status === "SUBMITTED" ? "Edit" : "View"}
              </Link>
            </CardHeader>
            <dl className="divide-y divide-border">
              {briefLines.length === 0 ? (
                <p className="px-[var(--s-5)] py-[var(--s-4)] text-[length:var(--fs-2)] text-muted-foreground">No brief yet.</p>
              ) : (
                briefLines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-3 px-[var(--s-5)] py-[var(--s-2)]">
                    <dt className="text-[length:var(--fs-2)] text-muted-foreground">{l.label}</dt>
                    <dd className="text-right text-[length:var(--fs-2)]">{l.value}</dd>
                  </div>
                ))
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1 text-[length:var(--fs-2)]">
              <p className="tabular font-mono text-[length:var(--fs-4)]">
                {o.price_total ? formatMoney(o.price_total, currency) : "Price coming"}
              </p>
              {held > 0 && <p className="text-muted-foreground">{formatMoney(held, currency)} held until you approve</p>}
              {o.status === "QUOTED" && (
                <Link href={`/orders/${o.id}/pay`} className={`${buttonVariants({ size: "sm" })} mt-2`}>
                  Pay
                </Link>
              )}
            </CardBody>
          </Card>

          {canCancel && (
            <form action={transitionAction}>
              <input type="hidden" name="order_id" value={o.id} />
              <input type="hidden" name="to_status" value="CANCELLED" />
              <Button type="submit" variant="ghost" size="sm" className="w-full">
                Cancel this order
              </Button>
            </form>
          )}
          {canDispute && (
            <details className="rounded-[var(--r-lg)] border border-border bg-card p-[var(--s-4)] shadow-[var(--e-1)]">
              <summary className="cursor-pointer text-[length:var(--fs-2)]">Raise a problem</summary>
              <form action={raiseDisputeAction} className="mt-3 space-y-2">
                <input type="hidden" name="order_id" value={o.id} />
                <Textarea name="reason" required rows={3} maxLength={2000} placeholder="What went wrong?" aria-label="The problem" />
                <Button type="submit" variant="outline" size="sm">
                  Send to the team
                </Button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </main>
  );
}
