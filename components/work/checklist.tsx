import { CheckBox, ChecklistRow } from "@/components/ui/checklist-row";

import { tickCheckAction } from "@/app/(app)/orders/actions";
import type { ChecklistRow as Row } from "@/app/(app)/orders/WorkPanels";

/**
 * The two-level 19-point checklist (DECISIONS §10; docs/design D4b, P2).
 * Groups as in the build spec; a box per level. A box the viewer may tick
 * now is a button; tick_check() decides again on the server.
 */
export function Checklist({
  orderId,
  rows,
  canTickDesigner,
  canTickQc,
  signoffLabel,
}: {
  orderId: string;
  rows: Row[];
  canTickDesigner: boolean;
  canTickQc: boolean;
  signoffLabel: string;
}) {
  const groups: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = groups.at(-1);
    if (last && last.name === r.group_name) last.rows.push(r);
    else groups.push({ name: r.group_name, rows: [r] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.name}>
          <div className="grid grid-cols-[2rem_1fr_auto_auto] items-end gap-3 border-b border-border pb-[var(--s-1)]">
            <span />
            <h3 className="text-[length:var(--fs-3)] font-medium">{g.name}</h3>
            <span className="w-6 text-center font-mono text-[length:var(--fs-1)] text-muted-foreground">DES</span>
            <span className="w-6 text-center font-mono text-[length:var(--fs-1)] text-muted-foreground">QC</span>
          </div>
          <ul>
            {g.rows.map((r) => (
              <ChecklistRow
                key={r.item_id}
                index={r.item_id}
                label={r.is_signoff ? signoffLabel : r.label}
                flag={r.flag?.replace(/_/g, " ")}
                signoff={r.is_signoff}
                designer={<Tick orderId={orderId} row={r} column="designer" enabled={canTickDesigner} />}
                qc={<Tick orderId={orderId} row={r} column="qc" enabled={canTickQc} />}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Tick({ orderId, row, column, enabled }: { orderId: string; row: Row; column: "designer" | "qc"; enabled: boolean }) {
  const ticked = Boolean(column === "designer" ? row.designer_at : row.qc_at);
  const label = `${column === "designer" ? "Designer" : "QC"} · line ${row.item_id}`;
  if (!enabled) return <CheckBox checked={ticked} label={label} />;
  return (
    <form action={tickCheckAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={row.item_id} />
      <input type="hidden" name="column" value={column} />
      <input type="hidden" name="ticked" value={ticked ? "false" : "true"} />
      <button type="submit" aria-pressed={ticked} className="flex min-h-[var(--ctl-sm)] min-w-[var(--ctl-sm)] items-center justify-center">
        <CheckBox checked={ticked} label={`${ticked ? "Untick" : "Tick"} ${label}`} />
      </button>
    </form>
  );
}
