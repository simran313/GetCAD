import { Skeleton } from "@/components/ui/skeleton";

/** One order while it loads (Phase 11a): shaped like the order page, so nothing jumps when it lands. */
export default function OrderLoading() {
  return (
    <main role="status" aria-label="Loading" className="w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-56 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full rounded-[var(--r-lg)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-[var(--r-lg)]" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-[var(--r-lg)]" />
      <Skeleton className="h-14 w-full rounded-[var(--r-lg)]" />
    </main>
  );
}
