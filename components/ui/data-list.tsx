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
  linkKey,
  onRowClick,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  /** The column whose content names the row link (default: the first). */
  linkKey?: string;
  /** Open the row in place (a detail drawer) instead of following a link. */
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const linkCol = linkKey ?? columns[0]?.key;
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
                <tr key={rowKey(row)} className={cn("border-b border-border last:border-0", (href || onRowClick) && "relative transition-colors hover:bg-subtle")}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "h-14 px-[var(--s-4)] text-[length:var(--fs-3)] leading-[var(--lh-3)]",
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {c.key === linkCol && href ? (
                        <Link href={href} className="after:absolute after:inset-0 focus-visible:shadow-none focus-visible:after:rounded-[var(--r-xs)] focus-visible:after:shadow-[inset_0_0_0_2px_hsl(var(--foreground))]">
                          {c.cell(row)}
                        </Link>
                      ) : c.key === linkCol && onRowClick ? (
                        <button type="button" onClick={() => onRowClick(row)} className="w-full text-left after:absolute after:inset-0 focus-visible:shadow-none focus-visible:after:rounded-[var(--r-xs)] focus-visible:after:shadow-[inset_0_0_0_2px_hsl(var(--foreground))]">
                          {c.cell(row)}
                        </button>
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
                  {title.map((c, i) =>
                    i === 0 && onRowClick && !href ? (
                      <button key={c.key} type="button" onClick={() => onRowClick(row)} className="block w-full text-left after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:shadow-none focus-visible:after:shadow-[var(--focus-ring)]">
                        {c.cell(row)}
                      </button>
                    ) : (
                      <div key={c.key}>{c.cell(row)}</div>
                    ),
                  )}
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
                      <dd className="line-clamp-2 break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={rowKey(row)} className="relative rounded-[var(--r-lg)] border border-border bg-card p-[var(--s-4)] shadow-[var(--e-1)]">
              {href ? (
                <Link href={href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
              {by("action").map((c) => {
                const content = c.cell(row);
                return content == null || content === false ? null : (
                  <div key={c.key} className="relative z-10 mt-3 [&>*]:w-full">
                    {content}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </>
  );
}
