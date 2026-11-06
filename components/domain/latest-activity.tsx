import Link from "next/link";

import { formatRelative } from "@/core";
import { cn } from "@/lib/utils";

/**
 * Latest (revamp R4): the last two or three things that happened on an
 * order, right under the next step, so "what changed?" is answered without
 * opening the timeline. Each line is one tap to where it happened.
 */
export interface LatestItem {
  id: string;
  label: string;
  at: string;
  href?: string;
}

export function LatestActivity({ items, zone, className }: { items: LatestItem[]; zone: string; className?: string }) {
  const rows = items
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="latest-title" className={cn("space-y-2", className)}>
      <h2 id="latest-title" className="eyebrow">
        Latest
      </h2>
      <ol className="space-y-1">
        {rows.map((r, i) => {
          const body = (
            <>
              <span
                aria-hidden
                className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", i === 0 ? "bg-[color:var(--brand-accent)]" : "bg-[color:var(--border-strong)]")}
              />
              <span className="min-w-0 flex-1 truncate text-[length:var(--fs-3)]">{r.label}</span>
              <span className="shrink-0 text-[length:var(--fs-2)] text-muted-foreground">{formatRelative(r.at, zone)}</span>
            </>
          );
          return (
            <li key={r.id}>
              {r.href ? (
                <Link href={r.href} className="flex min-h-[var(--ctl-sm)] items-start gap-3 rounded-[var(--r-sm)] px-1 py-1.5 hover:bg-accent">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-[var(--ctl-sm)] items-start gap-3 px-1 py-1.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
