import { cn } from "@/lib/utils";

/** "CAT C" — the job category (DECISIONS §3), as the mockups label it. */
export function CategoryBadge({ letter, className }: { letter: string | null; className?: string }) {
  if (!letter) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--r-xs)] border border-foreground px-2 py-1",
        "font-mono text-[length:var(--fs-1)] font-medium uppercase leading-none tracking-[0.1em]",
        className,
      )}
      aria-label={`Category ${letter}`}
    >
      Cat {letter}
    </span>
  );
}
