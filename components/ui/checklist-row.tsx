import { cn } from "@/lib/utils";

/**
 * One line of the 19-point checklist (DECISIONS §10; docs/design D4b, P2):
 * the check, then a box per level — designer, then QC. A ticked box is
 * black with a white tick; the sign-off line is set apart.
 */
export function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${checked ? "ticked" : "not ticked"}`}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-xs)] border",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-[color:var(--border-strong)] bg-background",
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      )}
    </span>
  );
}

export function ChecklistRow({
  index,
  label,
  flag,
  signoff,
  designer,
  qc,
}: {
  index: number;
  label: string;
  flag?: string | null;
  signoff?: boolean;
  /** The designer box, or a control that toggles it. */
  designer: React.ReactNode;
  /** The QC box, or a control that toggles it. */
  qc: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 border-b border-border py-[var(--s-2)] last:border-b-0",
        signoff && "border-t border-t-foreground pt-[var(--s-3)]",
      )}
    >
      <span className="tabular text-[length:var(--fs-2)] text-muted-foreground">{index}</span>
      <span className="text-[length:var(--fs-2)] leading-[var(--lh-2)]">
        {label}
        {flag && (
          <span className="ml-2 inline-flex rounded-[var(--r-full)] border border-[color:var(--border-strong)] px-2 align-[1px] text-[length:var(--fs-1)] font-medium leading-5">
            {flag.charAt(0).toUpperCase() + flag.slice(1).toLowerCase()}
          </span>
        )}
      </span>
      {designer}
      {qc}
    </li>
  );
}
