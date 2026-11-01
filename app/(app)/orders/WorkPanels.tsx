import { slotAccept } from "@/core";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { Checklist, countWord, stageCount, type Stage } from "@/components/work/checklist";

import { assignDesignerAction } from "./actions";
import { SlotUpload } from "../work/SlotUpload";

/**
 * The working surfaces of Phase 3a: assigning a designer, the two-stage QC
 * checklist (0059) and the upload slots. Plain server-rendered forms; the
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

/** A line of the two-stage QC sheet (job_checklist, 0059). */
export interface ChecklistRow {
  item_id: number;
  group_name: string;
  label: string;
  standard: string | null;
  flag: string | null;
  is_signoff: boolean;
  stage: "DESIGNER" | "MANAGER" | "LEGACY";
  position: number;
  outcome: "PASS" | "FAIL" | null;
  finding: string | null;
  remark: string | null;
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
        <label className={`${small} min-w-0 max-w-full`}>
          Designer
          <Select name="designer_id" className="mt-0.5 w-auto max-w-full" required>
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
  canMark,
  zone,
}: {
  orderId: string;
  rows: ChecklistRow[];
  canMark: Stage | null;
  zone: string;
}) {
  return (
    <Panel
      title="QC checklist"
      aside={
        <span className={small}>
          Designer {countWord(stageCount(rows, "DESIGNER"))} · QC manager {countWord(stageCount(rows, "MANAGER"))}
        </span>
      }
    >
      <Checklist orderId={orderId} rows={rows} stages={["DESIGNER", "MANAGER"]} canMark={canMark} zone={zone} />
      <p className={`mt-3 ${small}`}>
        Submitting needs every designer line passed and every required file; passing QC needs every QC manager line
        passed. A failed QC manager line goes back to the designer as the revision note.
      </p>
    </Panel>
  );
}

export function SlotsPanel({ orderId, slots, canUpload }: { orderId: string; slots: SlotRow[]; canUpload: boolean }) {
  // The four required files (0056), and any older slot that still holds a file.
  const shown = slots.filter((s) => s.required || s.file_version_id);
  const missing = shown.filter((s) => s.required && !s.file_version_id).length;
  return (
    <Panel title="Upload slots" aside={<span className={small}>{missing === 0 ? "All required files in" : `${missing} required missing`}</span>}>
      <ul className="divide-y divide-border">
        {shown.map((s) => (
          <SlotUpload
            key={s.code}
            orderId={orderId}
            code={s.code}
            label={`${s.code} · ${s.label}${s.required ? "" : " (optional)"}`}
            accept={slotAccept(s.code)}
            fileName={s.file_name}
            enabled={canUpload}
          />
        ))}
      </ul>
      {canUpload && (
        <p className={`mt-2 ${small}`}>
          Choose or drop a file and it uploads. 3DM and STL files are cleaned of author and studio details (Rhino blocks are
          exploded); images of EXIF. Files are named by the system as job code, slot and version.
        </p>
      )}
    </Panel>
  );
}
