"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { WhatsAppButton } from "@/components/support/whatsapp";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Phones only (redesign step 4): once the hero has scrolled away, a bar with
 * the primary action and a call button stays at the bottom of the screen.
 */
export function StickyMobileCta({ phone }: { phone: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setShow(!e!.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-[var(--dur-base)] ease-out md:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <div className="flex gap-2">
        <Link href="/sign-up" tabIndex={show ? 0 : -1} className={cn(buttonVariants(), "flex-1")}>
          Start your first design
        </Link>
        <a
          href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact"}
          tabIndex={show ? 0 : -1}
          aria-label="Talk to us live"
          className={buttonVariants({ variant: "secondary", size: "icon" })}
        >
          <Phone />
        </a>
        <WhatsAppButton variant="icon" tabIndex={show ? 0 : -1} text="Hi, I'd like a quote for a jewelry CAD design." className="border border-border" />
      </div>
    </div>
  );
}
