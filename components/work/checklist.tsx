import { markCheckAction } from "@/app/(app)/orders/actions";
import type { ChecklistRow as Row } from "@/app/(app)/orders/WorkPanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDateTime } from "@/core";
import { cn } from "@/lib/utils";

/**
 * The two-stage QC sheet (owner's QC sheet, 1 Nov 2026; DECISIONS §10): the
 * designer's check, then the QC manager's. Each line is Pass or Fail with an
 * optional finding (the measured value) and a remark; the time of each mark
 * is recorded. One press saves the line with whatever was typed in it.
 * mark_check() decides on the server who may mark which line, and when.
 */
export type Stage = "DESIGNER" | "MANAGER";

export const STAGE_TITLE: Record<Stage, string> = { DESIGNER: "Designer check", MANAGER: "QC manager check" };

const markedAt = (r: Row) => (r.stage === "MANAGER" ? r.qc_at : r.designer_at);

/** Lines of one stage: how many, passed, failed. */
export function stageCount(rows: Row[], stage: Stage) {
  const mine = rows.filter((r) => r.stage === stage);
  const marked = mine.filter((r) => markedAt(r));
  return {
    total: mine.length,
    passed: marked.filter((r) => (r.outcome ?? "PASS") === "PASS").length,
    failed: marked.filter((r) => r.outcome === "FAIL").length,
  };
}

export function countWord({ total, passed, failed }: ReturnType<typeof stageCount>) {
  return `${passed} / ${total} passed${failed ? ` · ${failed} failed` : ""}`;
}

export function Checklist({
  orderId,
  rows,
  stages,
  canMark,
  zone,
  signature,
}: {
  orderId: string;
  rows: Row[];
  /** The stages to show, in order. */
  stages: Stage[];
  /** The stage this viewer may mark now, if any. */
  canMark: Stage | null;
  zone: string;
  /** The sheet's "signature & date" line per stage: who and when, as recorded. */
  signature?: Partial<Record<Stage, string | null>>;
}) {
  return (
    <div className="space-y-6">
      {stages.map((stage) => {
        const lines = rows.filter((r) => r.stage === stage);
        if (lines.length === 0) return null;
        const count = stageCount(rows, stage);
        return (
          <section key={stage} aria-label={STAGE_TITLE[stage]}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-[var(--s-1)]">
              <h3 className="text-[length:var(--fs-3)] font-medium">{STAGE_TITLE[stage]}</h3>
              <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">{countWord(count)}</span>
            </div>
            <ol>
              {lines.map((r, i) => (
                <Line key={r.item_id} orderId={orderId} row={r} index={i + 1} editable={canMark === stage} zone={zone} />
              ))}
            </ol>
            {signature?.[stage] && <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">{signature[stage]}</p>}
          </section>
        );
      })}
    </div>
  );
}

function Outcome({ row, zone }: { row: Row; zone: string }) {
  const at = markedAt(row);
  if (!at) return <StatusPill tone="neutral">Not marked</StatusPill>;
  const failed = row.outcome === "FAIL";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusPill tone={failed ? "danger" : "success"}>{failed ? "Fail" : "Pass"}</StatusPill>
      <span className="tabular text-[length:var(--fs-1)] text-muted-foreground">{formatDateTime(at, zone)}</span>
    </span>
  );
}

function Line({ orderId, row, index, editable, zone }: { orderId: string; row: Row; index: number; editable: boolean; zone: string }) {
  const at = markedAt(row);
  const head = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 gap-3">
        <span className="tabular w-5 shrink-0 text-[length:var(--fs-2)] text-muted-foreground">{index}</span>
        <div className="min-w-0">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">
            {row.label}
            {row.flag && (
              <span className="ml-2 inline-flex rounded-[var(--r-full)] border border-[color:var(--border-strong)] px-2 align-[1px] text-[length:var(--fs-1)] font-medium leading-5">
                {row.flag.charAt(0) + row.flag.slice(1).toLowerCase().replace(/_/g, " ")}
              </span>
            )}
          </p>
          {row.standard && <p className="text-[length:var(--fs-2)] text-muted-foreground">{row.standard}</p>}
        </div>
      </div>
      <Outcome row={row} zone={zone} />
    </div>
  );

  if (!editable) {
    return (
      <li className="space-y-1 border-b border-border py-[var(--s-3)] last:border-b-0">
        {head}
        {(row.finding || row.remark) && (
          <dl className="ml-8 grid gap-x-4 text-[length:var(--fs-2)] sm:grid-cols-2">
            {row.finding && (
              <div>
                <dt className="inline text-muted-foreground">Finding: </dt>
                <dd className="inline">{row.finding}</dd>
              </div>
            )}
            {row.remark && (
              <div>
                <dt className="inline text-muted-foreground">Remark: </dt>
                <dd className="inline">{row.remark}</dd>
              </div>
            )}
          </dl>
        )}
      </li>
    );
  }

  const id = `chk-${row.item_id}`;
  return (
    <li className={cn("space-y-2 border-b border-border py-[var(--s-3)] last:border-b-0", row.outcome === "FAIL" && at && "-mx-2 rounded-[var(--r-sm)] bg-[color:var(--tone-danger-bg)] px-2")}>
      {head}
      {/* Keyed by the mark, so the inputs show what was saved after each press. */}
      <form key={`${row.outcome ?? ""}-${at ?? ""}`} action={markCheckAction} className="ml-8 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="item_id" value={row.item_id} />
        <label htmlFor={`${id}-f`} className="sr-only">
          Value or finding · {row.label}
        </label>
        <Input id={`${id}-f`} name="finding" maxLength={300} defaultValue={row.finding ?? ""} placeholder="Value / finding" className="h-[var(--ctl-sm)]" />
        <label htmlFor={`${id}-r`} className="sr-only">
          Remark · {row.label}
        </label>
        <Input id={`${id}-r`} name="remark" maxLength={500} defaultValue={row.remark ?? ""} placeholder="Remark" className="h-[var(--ctl-sm)]" />
        <div className="flex gap-2">
          <Button
            type="submit"
            name="outcome"
            value="PASS"
            size="sm"
            variant={at && row.outcome !== "FAIL" ? "default" : "secondary"}
            aria-pressed={Boolean(at && row.outcome !== "FAIL")}
            aria-label={`Pass · ${row.label}`}
          >
            Pass
          </Button>
          <Button
            type="submit"
            name="outcome"
            value="FAIL"
            size="sm"
            variant={at && row.outcome === "FAIL" ? "destructive" : "secondary"}
            aria-pressed={Boolean(at && row.outcome === "FAIL")}
            aria-label={`Fail · ${row.label}`}
          >
            Fail
          </Button>
          {at && (
            <Button type="submit" name="outcome" value="CLEAR" size="sm" variant="ghost" aria-label={`Clear · ${row.label}`}>
              Clear
            </Button>
          )}
        </div>
      </form>
    </li>
  );
}
