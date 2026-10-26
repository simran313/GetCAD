import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * One row of a list or table (docs/design: orders, jobs, queues). A mono
 * reference, a title, quiet meta, and whatever belongs on the right — a
 * status, an amount, a timer. The whole row is the link when there is one.
 *
 * Redesign: on a phone the trailing pills drop under the title and wrap, so
 * a row never pushes the page wider than the screen (audit G1); references
 * are plain mono, not uppercase.
 */
export function ListRow({
  href,
  reference,
  title,
  meta,
  trailing,
  className,
}: {
  href?: string;
  reference?: string | null;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        {reference && (
          <p className="tabular truncate font-mono text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
            {reference}
          </p>
        )}
        <p className="truncate text-[length:var(--fs-l)] font-medium leading-[var(--lh-l)]">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{meta}</p>}
      </div>
      {trailing && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end sm:gap-3">{trailing}</div>}
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col items-start gap-2 border-b border-border sm:flex-row sm:items-center sm:gap-4 px-[var(--s-4)] py-[var(--s-3)] last:border-b-0",
    href && "transition-colors hover:bg-subtle",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
