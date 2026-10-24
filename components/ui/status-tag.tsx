import type { StatusKind } from "@/core";
import { cn } from "@/lib/utils";

/**
 * The status tag of the mockups (docs/design): mono, uppercase, square.
 *   needs   solid black — someone must act
 *   active  black outline — in flight
 *   done    black text with a tick
 *   muted   grey fill — nothing happening, or ended
 * Any label fits; StatusBadge maps order statuses onto it.
 */
const KIND: Record<StatusKind, string> = {
  needs: "border border-primary bg-primary text-primary-foreground",
  active: "border border-foreground text-foreground",
  done: "border border-transparent px-0 text-foreground",
  muted: "border border-transparent bg-muted text-muted-foreground",
};

export function StatusTag({
  kind,
  children,
  className,
}: {
  kind: StatusKind;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-xs)] px-2 py-1",
        "font-mono text-[length:var(--fs-1)] font-medium uppercase leading-none tracking-[0.1em]",
        KIND[kind],
        className,
      )}
    >
      {kind === "done" && (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="square"
          aria-hidden="true"
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      )}
      {children}
    </span>
  );
}
