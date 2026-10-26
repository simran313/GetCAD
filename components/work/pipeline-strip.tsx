import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The queue's pipeline (redesign): every stage in one horizontal strip with
 * its count. Zeros are muted; a stage is a filter link; the selected stage is
 * marked. Scrolls sideways on a phone instead of wrapping into tiles.
 */
export interface Stage {
  key: string;
  label: string;
  count: number;
  href: string;
}

export function PipelineStrip({ stages, active }: { stages: Stage[]; active?: string | null }) {
  return (
    <nav aria-label="Pipeline" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ol className="flex min-w-max lg:min-w-0 divide-x divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {stages.map((s) => {
          const on = s.key === active;
          const zero = s.count === 0;
          return (
            <li key={s.key} className="flex-1">
              <Link
                href={s.href}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex min-w-[92px] flex-col gap-0.5 px-3 py-3 transition-colors duration-[var(--dur-fast)] hover:bg-subtle",
                  on && "bg-subtle shadow-[inset_0_-2px_0_0_hsl(var(--foreground))]",
                )}
              >
                <span className={cn("text-[24px] leading-8 tabular tracking-[-0.02em]", zero ? "font-normal text-muted-foreground" : "font-semibold")}>{s.count}</span>
                <span className="whitespace-nowrap text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground lg:whitespace-normal">{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
