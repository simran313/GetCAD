"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { actionErrorText, refusalReason } from "@/lib/refusal";

/**
 * A page or an action that failed. In production Next replaces the server's
 * message with a generic one (it may hold details not meant for the viewer),
 * so that text is never shown: the person gets plain words and the reference
 * the team can find in the server log. A refusal (Phase 11c, lib/refusal)
 * shows its reason instead; messages from the browser itself, and every
 * message in development, are shown as they are.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  const message = actionErrorText(error);
  // A refusal is not a fault: no reference to quote.
  const refused = refusalReason(error) !== null;
  return (
    <main className="container flex max-w-lg flex-col items-start py-16">
      <h1 className="text-[length:var(--fs-5)] font-semibold">That didn&apos;t go through</h1>
      <p className="mt-2 text-[length:var(--fs-3)] text-muted-foreground">
        {message ?? "Try again. If it happens again, message the team and quote the reference below."}
      </p>
      {error.digest && !refused && (
        <p className="tabular mt-2 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/home" className={buttonVariants({ variant: "outline" })}>
          Go to your dashboard
        </Link>
      </div>
    </main>
  );
}
