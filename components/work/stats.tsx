/** The row of big numbers at the top of a home or earnings screen (docs/design). */
export function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border ${
        items.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
      }`}
    >
      {items.map(([value, label]) => (
        <div key={label} className="flex flex-col bg-card p-[var(--s-4)]">
          <dt className="order-2 text-[length:var(--fs-2)] text-muted-foreground">{label}</dt>
          <dd className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A mono section label, as the mockups set them. */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="eyebrow">
      {children}
    </h2>
  );
}
