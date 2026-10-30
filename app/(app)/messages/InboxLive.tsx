"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

/**
 * Keeps a conversation list current while it is on screen (Phase 15): every
 * few seconds, and at once when the page comes back into view, it asks
 * whether anything changed (/api/inbox/stamp) and reads the page again only
 * when it did. Nothing runs while the tab is hidden.
 */
export function InboxLive({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/inbox/stamp", { cache: "no-store" });
        if (!res.ok) return;
        const { stamp } = (await res.json()) as { stamp: string };
        if (last !== null && stamp !== last) startTransition(() => router.refresh());
        last = stamp;
      } catch {
        // Offline for a moment: the next check catches up.
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = window.setInterval(check, seconds * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router, seconds]);
  return null;
}
