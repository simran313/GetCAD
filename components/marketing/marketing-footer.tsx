import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/guarantee", label: "Guarantee" },
      { href: "/quality", label: "Quality" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/apply-designer", label: "Become a designer" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-subtle">
      <div className="container grid max-w-6xl gap-8 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
            Jewelry CAD for the trade. Studio in Mumbai, working US business hours.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[length:var(--fs-2)] text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-4">
        <p className="container max-w-6xl text-[length:var(--fs-1)] text-muted-foreground">
          © {new Date().getFullYear()} The CAD Pillar. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
