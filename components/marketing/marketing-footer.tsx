import Link from "next/link";

import { SupportStatus } from "@/components/support/support-status";
import { WhatsAppButton } from "@/components/support/whatsapp";
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
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-[15px] leading-[1.5] text-muted-foreground">
            The AI-native jewelry CAD studio. The portal is open 24/7.
          </p>
          <WhatsAppButton label="WhatsApp us" className="mt-4" />
          <SupportStatus className="mt-3 flex" />
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="eyebrow">{col.title}</p>
            <ul className="mt-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-[15px] text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border pb-24 pt-5 md:pb-5">
        <p className="mx-auto max-w-[1200px] px-4 text-[14px] text-muted-foreground sm:px-6 lg:px-8">
          © {new Date().getFullYear()} The CAD Pillar. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
