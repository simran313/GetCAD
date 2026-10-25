import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * One list, two shapes (redesign): a table at desk width, stacked cards on a
 * phone. Columns say where they go on a card (title, meta, badge, action, or
 * hidden), so each screen declares its list once.
 */
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  /** Card placement below 768px. */
  card?: "title" | "meta" | "badge" | "action" | "hidden";
}

export function ResponsiveDataList<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const by = (place: Column<T>["card"]) => columns.filter((c) => (c.card ?? "meta") === place);
  return (
    <>
      <div className="hidden overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] md:block">
        <table className="w-full border-collapse text-left">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border bg-subtle">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-[var(--s-4)] py-2.5 text-[length:var(--fs-2)] font-medium text-muted-foreground",
                    c.align === "right" && "text-right",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className={cn("border-b border-border last:border-0", href && "relative transition-colors hover:bg-subtle")}>
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        "h-14 px-[var(--s-4)] text-[length:var(--fs-3)] leading-[var(--lh-3)]",
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {i === 0 && href ? (
                        <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        <span className={cn(c.card === "action" && "relative z-10")}>{c.cell(row)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const href = rowHref?.(row);
          const title = by("title");
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-[length:var(--fs-3)] font-medium leading-[var(--lh-3)]">
                  {title.map((c) => (
                    <div key={c.key}>{c.cell(row)}</div>
                  ))}
                </div>
                {by("badge").map((c) => (
                  <div key={c.key} className="shrink-0">
                    {c.cell(row)}
                  </div>
                ))}
              </div>
              {by("meta").length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--fs-2)] leading-[var(--lh-2)]">
                  {by("meta").map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-muted-foreground">{c.header}</dt>
                      <dd className="truncate">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={rowKey(row)} className="rounded-[var(--r-lg)] border border-border bg-card p-[var(--s-4)] shadow-[var(--e-1)]">
              {href ? (
                <Link href={href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
              {by("action").map((c) => (
                <div key={c.key} className="mt-3 [&>*]:w-full">
                  {c.cell(row)}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}
