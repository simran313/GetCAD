"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { POST_AUTH_PATH } from "@/config/auth-redirects";
import { cn } from "@/lib/utils";

/**
 * The header's account buttons (Phase 12). The website is built once and
 * served from the CDN, so it cannot ask the server who is looking; the
 * browser can. Clerk keeps a `__client_uat` cookie (a time when signed in,
 * 0 when signed out) on this domain for exactly this kind of check. It only
 * picks which buttons to show: the app itself checks the real session on
 * every request. Everyone sees the signed-out buttons first.
 */
const signedInHere = () =>
  document.cookie.split("; ").some((c) => {
    const [name, value] = c.split("=");
    return name !== undefined && name.startsWith("__client_uat") && value !== undefined && value !== "" && value !== "0";
  });

export function HeaderAccount({ phone }: { phone: string | null }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(signedInHere()), []);

  if (signedIn) {
    return (
      <Link href={POST_AUTH_PATH} className={buttonVariants({ size: "sm" })}>
        Open the app
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in" className="hidden px-3 text-[15px] text-muted-foreground hover:text-foreground lg:inline">
        Sign in
      </Link>
      <a href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact"} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden lg:inline-flex")}>
        Talk to us live
      </a>
      <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }), "whitespace-nowrap")}>
        <span className="sm:hidden">Start a design</span>
        <span className="hidden sm:inline">Start your first design</span>
      </Link>
    </>
  );
}
