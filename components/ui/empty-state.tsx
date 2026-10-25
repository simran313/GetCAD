import { cn } from "@/lib/utils";

/**
 * What a list says when it has nothing in it (redesign): an icon, what is
 * missing in plain words, why that is fine or what to do, and at most one
 * action. Never a bare "No results".
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border border-border bg-background text-muted-foreground shadow-[var(--e-1)] [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
