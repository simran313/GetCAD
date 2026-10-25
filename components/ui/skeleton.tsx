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

export { Skeleton, SkeletonRows };
