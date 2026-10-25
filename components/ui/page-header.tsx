import { cn } from "@/lib/utils";

/**
 * The top of every screen (redesign): an optional small eyebrow, the title
 * (Geist 600), ONE line of description, and at most one primary action (plus
 * secondary ones beside it). Left-aligned; stacks on a phone.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[length:var(--fs-6)] font-semibold leading-[var(--lh-6)] tracking-[var(--ls-6)]">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}
