import { cn } from "@/lib/utils";

/**
 * A summary strip at the top of a home or earnings screen (redesign): one
 * quiet row, not a wall of tiles. Numbers at 24px, zeros muted, so the eye
 * goes to what is actually there.
 */
export function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border shadow-[var(--e-1)]",
        items.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {items.map(([value, label]) => {
        const zero = /^[^1-9]*$/.test(value);
        return (
          <div key={label} className="flex flex-col gap-0.5 bg-card px-4 py-3">
            <dt className="order-2 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{label}</dt>
            <dd className={cn("tabular text-[24px] leading-8 tracking-[-0.02em]", zero ? "font-normal text-muted-foreground" : "font-semibold")}>
              {value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A section heading on a work screen: sentence case, one size up from body. */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">
      {children}
    </h2>
  );
}
