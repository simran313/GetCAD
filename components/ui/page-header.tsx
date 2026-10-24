import { cn } from "@/lib/utils";

/**
 * The top of a screen as the mockups set it: an optional mono eyebrow (a
 * reference, a section), the title in Instrument Serif, a line of context,
 * and actions on the right.
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
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="tabular font-mono text-[length:var(--fs-1)] uppercase leading-[var(--lh-1)] tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-display text-[length:var(--fs-display)] font-normal leading-[var(--lh-display)] tracking-[-0.01em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
