import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * One row of a list or table (docs/design: orders, jobs, queues). A mono
 * reference, a title, quiet meta, and whatever belongs on the right — a
 * status, an amount, a timer. The whole row is the link when there is one.
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
      <div className="min-w-0 flex-1">
        {reference && (
          <p className="tabular font-mono text-[length:var(--fs-1)] uppercase leading-[var(--lh-1)] tracking-[0.08em] text-muted-foreground">
            {reference}
          </p>
        )}
        <p className="truncate text-[length:var(--fs-l)] font-medium leading-[var(--lh-l)]">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{meta}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
    </>
  );
  const cls = cn(
    "flex items-center gap-4 border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0",
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
