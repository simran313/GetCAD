import { cn } from "@/lib/utils";

/**
 * One required upload (DECISIONS §9; docs/design D4): the slot code, what it
 * is, and either the file the system named or the picker. Filled slots are
 * drawn solid so the ten slots read as a progress bar at a glance.
 */
export function UploadSlot({
  code,
  label,
  fileName,
  children,
}: {
  code: string;
  label: string;
  fileName?: string | null;
  /** The upload control (a form), shown while the slot can take a file. */
  children?: React.ReactNode;
}) {
  const filled = !!fileName;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[var(--r-sm)] border p-[var(--s-3)]",
        filled ? "border-foreground bg-background" : "border-dashed border-[color:var(--border-strong)] bg-subtle",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[length:var(--fs-2)] font-medium">{code}</span>
        <span className="text-[length:var(--fs-2)] text-muted-foreground">{label}</span>
      </div>
      {filled ? (
        <p className="truncate font-mono text-[length:var(--fs-2)]">{fileName}</p>
      ) : (
        <p className="text-[length:var(--fs-2)] text-muted-foreground">Empty</p>
      )}
      {children}
    </div>
  );
}
