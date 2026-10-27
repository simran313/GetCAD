import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { changeOrderAction, requestRevisionAction } from "./actions";
import { viewerZone } from "@/lib/time/zone";
import { formatDateTime } from "@/core";

/**
 * Client revisions and changes (Phase 3b, DECISIONS §8, owner answer Q5).
 *
 * 2 rounds within 14 days of first look; after that, or after approval, a
 * change is a new linked order quoted at its own category. Plain forms; the
 * designed screens replace them in Phase 5. The rules live in
 * request_revision() and create_change_order(), not here.
 */

export interface RevisionAllowance {
  included: number;
  used: number;
  window_ends_at: string | null;
  open: boolean;
}

export interface RevisionRow {
  round: number;
  note: string;
  requested_at: string;
  work_version: number;
}

export interface LineageRow {
  direction: "parent" | "child";
  order_id: string;
  order_ref: string | null;
  status: string;
}

export interface RevisionsData {
  allowance: RevisionAllowance | null;
  rounds: RevisionRow[];
  lineage: LineageRow[];
}

const small = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

const CHANGE_FROM = new Set(["CLIENT_PREVIEW", "APPROVED", "DELIVERED", "CLOSED"]);

export async function RevisionsPanel({
  orderId,
  status,
  isActingAsClient,
  data,
  bare = false,
}: {
  orderId: string;
  status: string;
  isActingAsClient: boolean;
  data: RevisionsData;
  /** Inside a sheet that already says "Revisions": no card, no heading. */
  bare?: boolean;
}) {
  const tz = await viewerZone();
  const when = (iso: string) => formatDateTime(iso, tz);
  const { allowance, rounds, lineage } = data;
  const parent = lineage.find((l) => l.direction === "parent");
  const children = lineage.filter((l) => l.direction === "child");
  const canAsk = isActingAsClient && status === "CLIENT_PREVIEW" && !!allowance?.open;
  const canChange = isActingAsClient && CHANGE_FROM.has(status) && !allowance?.open;
  const showRounds = allowance && (allowance.used > 0 || status === "CLIENT_PREVIEW");

  if (!showRounds && rounds.length === 0 && lineage.length === 0 && !canChange) {
    return bare ? <p className={small}>Two rounds of changes are included within 14 days of your first look.</p> : null;
  }

  const body = (
    <>
        {parent && (
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">
            A change to{" "}
            <Link href={`/orders/${parent.order_id}`} className="font-mono text-primary hover:underline">
              {parent.order_ref ?? parent.order_id}
            </Link>
            .
          </p>
        )}
        {children.length > 0 && (
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">
            Changes ordered:{" "}
            {children.map((c, i) => (
              <span key={c.order_id}>
                {i > 0 && ", "}
                <Link href={`/orders/${c.order_id}`} className="font-mono text-primary hover:underline">
                  {c.order_ref ?? c.order_id}
                </Link>
              </span>
            ))}
          </p>
        )}

        {rounds.length > 0 && (
          <ol className="mt-2 space-y-2">
            {rounds.map((r) => (
              <li key={r.round} className="rounded-md border border-border p-3">
                <p className={small}>
                  Round {r.round} · {when(r.requested_at)} · version {r.work_version}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[length:var(--fs-3)] leading-[var(--lh-3)]">{r.note}</p>
              </li>
            ))}
          </ol>
        )}

        {allowance?.window_ends_at && status === "CLIENT_PREVIEW" && (
          <p className={`mt-2 ${small}`}>
            {allowance.open
              ? `Included rounds stay open until ${when(allowance.window_ends_at)}.`
              : "The included rounds are used or the 14-day window has closed."}
          </p>
        )}

        {canAsk && (
          <form action={requestRevisionAction} className="mt-3 space-y-2">
            <input type="hidden" name="order_id" value={orderId} />
            <Textarea
              name="note"
              required
              rows={3}
              maxLength={4000}
              placeholder="What should change? Be specific: sizes in mm, which view, which part."
              aria-label="Revision note"
            />
            <Button type="submit" size="sm">
              Ask for changes (round {(allowance?.used ?? 0) + 1} of {allowance?.included ?? 2})
            </Button>
          </form>
        )}

        {canChange && (
          <form action={changeOrderAction} className="mt-3 space-y-2">
            <input type="hidden" name="order_id" value={orderId} />
            <Textarea
              name="note"
              required
              rows={3}
              maxLength={4000}
              placeholder="Describe the change. It becomes a new order with this brief, quoted separately."
              aria-label="Change description"
            />
            <Button type="submit" size="sm" variant="outline">
              Order a change (new order)
            </Button>
            {status === "CLIENT_PREVIEW" && (
              <p className={small}>This also approves the current design: the change is built on it.</p>
            )}
          </form>
        )}
    </>
  );

  if (bare) {
    return (
      <div className="space-y-2">
        {allowance && (
          <p className={small}>
            {allowance.used} of {allowance.included} rounds used
          </p>
        )}
        {body}
      </div>
    );
  }
  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>Revisions</CardTitle>
        {allowance && (
          <span className={small}>
            {allowance.used} of {allowance.included} rounds used
          </span>
        )}
      </CardHeader>
      <CardBody>{body}</CardBody>
    </Card>
  );
}
