import { cn } from "@/lib/utils";

/** A loading placeholder; the pulse stops under prefers-reduced-motion. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--r-sm)] bg-muted motion-reduce:animate-none", className)} {...props} />;
}

/** A list's loading state: rows shaped like the rows that will arrive. */
function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("divide-y divide-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-[var(--s-4)] py-[var(--s-4)]">
          <Skeleton className="h-6 w-24 rounded-[var(--r-full)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-9 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}



/**
 * A whole list screen while it loads (redesign): the header, an optional
 * summary strip, and rows shaped like the list that will arrive, on the
 * same page frame as the real screen so nothing jumps when it lands.
 */
function PageSkeleton({ strip = false, rows = 5, aside = false }: { strip?: boolean; rows?: number; aside?: boolean }) {
  return (
    <main role="status" aria-label="Loading" className="w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="hidden h-[var(--ctl)] w-32 sm:block" />
      </div>
      {strip && <Skeleton className="h-[72px] w-full rounded-[var(--r-lg)]" />}
      <div className={cn("grid gap-6", aside && "lg:grid-cols-[1fr_320px]")}>
        <div className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
          <SkeletonRows rows={rows} />
        </div>
        {aside && <Skeleton className="hidden h-48 rounded-[var(--r-lg)] lg:block" />}
      </div>
    </main>
  );
}
export { PageSkeleton, Skeleton, SkeletonRows };
