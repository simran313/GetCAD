import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { POST_AUTH_PATH } from "@/config/auth-redirects";

// The website's pages (LANDING-COPY, Phase 6). Contact and Become a designer
// live in the footer.
const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guarantee", label: "Guarantee" },
  { href: "/quality", label: "Quality" },
  { href: "/faq", label: "FAQ" },
];

const link = "text-[length:var(--fs-3)] text-muted-foreground transition-colors hover:text-foreground";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container flex h-16 max-w-6xl items-center justify-between gap-4">
        <Link href="/" aria-label="The CAD Pillar — home">
          <Wordmark />
        </Link>
        <nav aria-label="Website" className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={link}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Signed in, this header used to keep offering "Sign in" and gave
              no way into the product at all — the sign-in appeared to do
              nothing. */}
          <SignedOut>
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
              Start for $49
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
          {/* Phones: the same pages, folded. No script needed. */}
          <details className="relative md:hidden">
            <summary className="flex min-h-[var(--ctl-sm)] cursor-pointer list-none items-center px-2 text-[length:var(--fs-3)]" aria-label="Menu">
              Menu
            </summary>
            <nav aria-label="Website" className="absolute right-0 top-full mt-2 w-56 rounded-[var(--r-md)] border border-border bg-card p-[var(--s-2)] shadow-[var(--e-2)]">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-[var(--r-sm)] px-3 py-2 text-[length:var(--fs-3)] hover:bg-subtle">
                  {item.label}
                </Link>
              ))}
              <Link href="/contact" className="block rounded-[var(--r-sm)] px-3 py-2 text-[length:var(--fs-3)] hover:bg-subtle">
                Contact
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
