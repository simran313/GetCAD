import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// A real 404 (answered with status 404 by Next), never indexed.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * Old or mistyped links land here (SEO, 12 Nov 2026): a visitor from search
 * gets a way back to the website, and a signed-in user to their dashboard.
 */
export default function NotFound() {
  return (
    <main className="container flex max-w-lg flex-col items-start py-16">
      <h1 className="text-sm font-medium text-primary">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist, or the link is out of date.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/" className={buttonVariants()}>
          Go to The CAD Pillar
        </Link>
        <Link href="/home" className={buttonVariants({ variant: "outline" })}>
          Go to dashboard
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Looking for{" "}
        <Link href="/jewelry-cad" className="underline underline-offset-4">
          jewelry CAD services
        </Link>
        ,{" "}
        <Link href="/pricing" className="underline underline-offset-4">
          pricing
        </Link>{" "}
        or{" "}
        <Link href="/faq" className="underline underline-offset-4">
          answers to common questions
        </Link>
        ?
      </p>
    </main>
  );
}
