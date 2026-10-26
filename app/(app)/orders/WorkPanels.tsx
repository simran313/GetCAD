import { slotAccept } from "@/core";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { assignDesignerAction, tickCheckAction } from "./actions";
import { uploadSlotAction } from "./fileActions";

/**
 * The working surfaces of Phase 3a: assigning a designer, the two-level
 * 19-point checklist and the upload slots. Plain server-rendered forms; the
 * designed screens (D4, D4b, P2, P5) replace them in Phase 5. Every rule —
 * who may act, when, and in which column — is enforced by the database
 * functions behind the actions, not here.
 */

export interface PodDesigner {
  designer_id: string;
  designer_ref: string | null;
  name: string | null;
  open_minutes: number;
  shift_minutes: number;
  assignable: boolean;
}

export interface ChecklistRow {
  item_id: number;
  group_name: string;
  label: string;
  flag: string | null;
  is_signoff: boolean;
  designer_at: string | null;
  qc_at: string | null;
}

export interface SlotRow {
  code: string;
  label: string;
  required: boolean;
  file_version_id: string | null;
  file_name: string | null;
}

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
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

const small = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

export function AssignPanel({ orderId, designers }: { orderId: string; designers: PodDesigner[] }) {
  if (designers.length === 0) {
    return (
      <Panel title="Assign a designer">
        <p className={small}>No designers in this order&apos;s pod yet. Add one to the pod first.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Assign a designer">
      <form action={assignDesignerAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="order_id" value={orderId} />
        <label className={small}>
          Designer
          <Select name="designer_id" className="mt-0.5 w-auto" required>
            {designers.map((d) => (
              <option key={d.designer_id} value={d.designer_id} disabled={!d.assignable}>
                {[d.designer_ref, d.name].filter(Boolean).join(" · ") || d.designer_id} — {d.open_minutes}/
                {d.shift_minutes} min{d.assignable ? "" : " (not signed up)"}
              </option>
            ))}
          </Select>
        </label>
        <label className={small}>
          Over-capacity reason (admin)
          <Input name="override_reason" maxLength={500} className="mt-0.5 w-56" />
        </label>
        <Button type="submit" size="sm">
          Assign
        </Button>
      </form>
      <p className={`mt-2 ${small}`}>
        Load is category minutes of open jobs out of the shift. Going over warns; it is blocked only
        when capacity blocking is switched on, and then only an admin with a reason can override.
      </p>
    </Panel>
  );
}

export function ChecklistPanel({
  orderId,
  rows,
  canTickDesigner,
  canTickQc,
}: {
  orderId: string;
  rows: ChecklistRow[];
  canTickDesigner: boolean;
  canTickQc: boolean;
}) {
  const done = (col: "designer_at" | "qc_at") => rows.filter((r) => r[col]).length;
  let group = "";
  return (
    <Panel
      title="Checklist"
      aside={
        <span className={small}>
          Designer {done("designer_at")}/19 · QC {done("qc_at")}/19
        </span>
      }
    >
      <ul className="space-y-1">
        {rows.map((r) => {
          const header = r.group_name !== group ? r.group_name : null;
          group = r.group_name;
          return (
            <li key={r.item_id}>
              {header && <p className={`mt-3 font-medium ${small}`}>{header}</p>}
              <div className="flex items-center gap-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
                <TickButton orderId={orderId} row={r} column="designer" enabled={canTickDesigner} />
                <TickButton orderId={orderId} row={r} column="qc" enabled={canTickQc} />
                <span className={r.is_signoff ? "font-medium" : ""}>
                  {r.item_id}. {r.is_signoff ? "Sign-off" : r.label}
                  {r.flag && <span className={`ml-2 ${small}`}>{r.flag.replace(/_/g, " ")}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-3 ${small}`}>
        Left box: designer. Right box: QC. Submitting needs all 19 designer ticks and every required
        file; QC starts after the designer&apos;s sign-off and needs all 19 to pass.
      </p>
    </Panel>
  );
}

function TickButton({
  orderId,
  row,
  column,
  enabled,
}: {
  orderId: string;
  row: ChecklistRow;
  column: "designer" | "qc";
  enabled: boolean;
}) {
  const ticked = Boolean(column === "designer" ? row.designer_at : row.qc_at);
  const label = `${column === "designer" ? "Designer" : "QC"} tick for item ${row.item_id}`;
  if (!enabled) {
    return (
      <span aria-label={label} className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-[length:var(--fs-2)]">
        {ticked ? "✓" : ""}
      </span>
    );
  }
  return (
    <form action={tickCheckAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={row.item_id} />
      <input type="hidden" name="column" value={column} />
      <input type="hidden" name="ticked" value={ticked ? "false" : "true"} />
      <button
        type="submit"
        aria-label={label}
        aria-pressed={ticked}
        className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-[length:var(--fs-2)] hover:bg-accent"
      >
        {ticked ? "✓" : ""}
      </button>
    </form>
  );
}

export function SlotsPanel({ orderId, slots, canUpload }: { orderId: string; slots: SlotRow[]; canUpload: boolean }) {
  const missing = slots.filter((s) => s.required && !s.file_version_id).length;
  return (
    <Panel title="Upload slots" aside={<span className={small}>{missing === 0 ? "All required files in" : `${missing} required missing`}</span>}>
      <ul className="divide-y divide-border">
        {slots.map((s) => (
          <li key={s.code} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
            <span className="min-w-0">
              <span className="font-mono">{s.code}</span> <span className={small}>{s.label}{s.required ? "" : " (optional)"}</span>
              {s.file_name && <span className={`block font-mono ${small}`}>{s.file_name}</span>}
            </span>
            {canUpload && (
              <form action={uploadSlotAction} className="flex items-center gap-2">
                <input type="hidden" name="order_id" value={orderId} />
                <input type="hidden" name="slot" value={s.code} />
                <FilePicker name="file" required accept={slotAccept(s.code)} label={`Upload ${s.code}`} buttonLabel="Choose" />
                <Button type="submit" size="sm" variant="outline">
                  {s.file_version_id ? "Replace" : "Upload"}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {canUpload && (
        <p className={`mt-2 ${small}`}>
          3DM and STL files are cleaned of author and studio details; images of EXIF. Files are named
          by the system as job code, slot and version.
        </p>
      )}
    </Panel>
  );
}
