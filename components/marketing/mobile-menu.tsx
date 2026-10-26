"use client";

import { Menu, Phone } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** The website's menu on a phone: a bottom sheet with every page. */
export function MobileMenu({ nav, phone, hours }: { nav: { href: string; label: string }[]; phone: string | null; hours: string }) {
  return (
    <Sheet>
      <SheetTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")} aria-label="Menu">
        <Menu />
      </SheetTrigger>
      <SheetContent title="The CAD Pillar" side="bottom">
        <nav aria-label="Website" className="-mx-2">
          {[...nav, { href: "/contact", label: "Contact" }, { href: "/sign-in", label: "Sign in" }].map((item) => (
            <SheetClose asChild key={item.href}>
              <Link href={item.href} className="flex min-h-12 items-center rounded-[var(--r-sm)] px-2 text-[18px] hover:bg-accent">
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-4 grid gap-2">
          <a href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact"} className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <Phone /> Talk to us live
          </a>
          <p className="text-center text-[14px] text-muted-foreground">{hours}</p>
          <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
            Start your first design
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
