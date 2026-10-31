import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The website's building blocks, in the portal's look (docs/design): black
 * and warm neutrals, Instrument Serif for headlines, mono labels.
 */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function Hero({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <div className="container max-w-5xl py-16 sm:py-24">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.5rem,6vw,4.25rem)] font-normal leading-[1.02] tracking-[-0.02em]">
          {title}
        </h1>
        {sub && <p className="mt-6 max-w-2xl text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">{sub}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

export function Section({
  eyebrow,
  title,
  children,
  className,
  id,
}: {
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("border-b border-border", className)}>
      <div className="container max-w-5xl py-14 sm:py-20">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {title && (
          <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.875rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.01em]">
            {title}
          </h2>
        )}
        <div className={cn(title || eyebrow ? "mt-8" : "")}>{children}</div>
      </div>
    </section>
  );
}

export function Ctas({ primary = { href: "/sign-up", label: "Start your first design" }, secondary }: {
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
        {primary.label}
      </Link>
      {secondary && (
        <Link href={secondary.href} className={buttonVariants({ size: "lg", variant: "outline" })}>
          {secondary.label}
        </Link>
      )}
    </div>
  );
}

export function NumberedList({ items }: { items: [string, string][] }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([title, body], i) => (
        <li key={title} className="bg-card p-[var(--s-5)]">
          <span className="font-mono text-[length:var(--fs-1)] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
          <p className="mt-2 text-[length:var(--fs-3)] font-medium">{title}</p>
          <p className="mt-1 text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Ticks({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
          <span aria-hidden className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function FinalCta({ line = "Send one design. If you don't see the first look within 6 hours, it's free." }: { line?: string }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="container flex max-w-5xl flex-wrap items-center justify-between gap-6 py-14">
        <p className="max-w-2xl font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1]">{line}</p>
        <Link
          href="/sign-up"
          className="inline-flex min-h-[var(--ctl)] items-center rounded-[var(--r-sm)] bg-primary-foreground px-6 text-[length:var(--fs-3)] font-medium text-primary hover:opacity-90"
        >
          Start your first design
        </Link>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      {items.map(([q, a]) => (
        <div key={q} className="grid gap-2 py-[var(--s-5)] sm:grid-cols-[1fr_2fr] sm:gap-8">
          <dt className="text-[length:var(--fs-3)] font-medium">{q}</dt>
          <dd className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{a}</dd>
        </div>
      ))}
    </dl>
  );
}
