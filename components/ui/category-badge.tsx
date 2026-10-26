import { cn } from "@/lib/utils";

/** "Cat C" — the job category (DECISIONS §3). Sentence case since the redesign. */
export function CategoryBadge({ letter, className }: { letter: string | null; className?: string }) {
  if (!letter) return null;
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-[var(--r-full)] border border-[color:var(--border-strong)] px-2.5",
        "text-[length:var(--fs-2)] font-medium leading-[var(--lh-2)]",
        className,
      )}
      aria-label={`Category ${letter}`}
    >
      Cat {letter}
    </span>
  );
}
