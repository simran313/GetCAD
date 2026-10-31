import Link from "next/link";

import { WhatsAppButton } from "@/components/support/whatsapp";
import { c } from "@/content/claims";

import { HeaderAccount } from "./header-account";
import { MobileMenu } from "./mobile-menu";

// The website's pages (redesign step 4a). Signed in or not is read in the
// browser (HeaderAccount) so the pages stay static (Phase 12); the website
// does not load Clerk's browser script (see components/auth/auth-provider),
// so the account menu lives in the app only. Guarantee, Contact and Become a
// designer stay one tap away in the footer and the phone menu.
const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/quality", label: "Quality" },
  { href: "/faq", label: "FAQ" },
];

export function MarketingHeader() {
  const phone = c("LIVE_CALL_PHONE");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="The CAD Pillar, home" className="shrink-0 whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em]">
          The CAD Pillar
        </Link>
        <nav aria-label="Website" className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-[15px] text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <WhatsAppButton variant="icon" text="Hi, I'd like a quote for a jewelry CAD design." />
          <HeaderAccount phone={phone} />
          <MobileMenu nav={NAV} phone={phone} />
        </div>
      </div>
    </header>
  );
}
