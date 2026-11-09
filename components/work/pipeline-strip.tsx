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
  // Phone (R5): no sideways scrolling. Only the stages with orders in them
  // (and the one selected), as chips that wrap; the empty ones say so once.
  const live = stages.filter((s) => s.count > 0 || s.key === active);
  const empty = stages.length - live.length;
  return (
    <>
      <nav aria-label="Pipeline" className="md:hidden">
        <ul className="flex flex-wrap gap-2">
          {live.map((s) => {
            const on = s.key === active;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-[var(--ctl-sm)] items-center gap-2 rounded-[var(--r-full)] border px-3.5 text-[length:var(--fs-2)] transition-colors duration-[var(--dur-fast)]",
                    on ? "border-foreground bg-foreground text-background" : "border-[color:var(--border-strong)] bg-card hover:bg-subtle",
                  )}
                >
                  <span className="tabular font-semibold">{s.count}</span>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {empty > 0 && <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">{empty} other stages are empty.</p>}
      </nav>
      <PipelineTable stages={stages} active={active} />
    </>
  );
}

function PipelineTable({ stages, active }: { stages: Stage[]; active?: string | null }) {
  return (
    // Scrolls inside itself on a tablet (8 Nov 2026: the strip pushed the page 642px wider at 768px).
    <nav aria-label="Pipeline stages" className="hidden overflow-x-auto rounded-[var(--r-lg)] md:block">
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
