import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { POST_AUTH_PATH } from "@/config/auth-redirects";
import { c } from "@/content/claims";
import { cn } from "@/lib/utils";

import { MobileMenu } from "./mobile-menu";

// The website's pages (redesign step 4a). Guarantee, Contact and Become a
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
          <SignedOut>
            <Link href="/sign-in" className="hidden px-3 text-[15px] text-muted-foreground hover:text-foreground lg:inline">
              Sign in
            </Link>
            <a
              href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact"}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden lg:inline-flex")}
            >
              Talk to us live
            </a>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }), "whitespace-nowrap")}>
              <span className="sm:hidden">Start a design</span>
              <span className="hidden sm:inline">Start your first design</span>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href={POST_AUTH_PATH} className={buttonVariants({ size: "sm" })}>
              Open the app
            </Link>
            <div className="ml-1 flex items-center">
              <UserButton />
            </div>
          </SignedIn>
          <MobileMenu nav={NAV} phone={phone} hours={c("LIVE_CALL_HOURS")} />
        </div>
      </div>
    </header>
  );
}
