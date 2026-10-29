"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useThreadSignals } from "@/lib/supabase/live";

/**
 * Keeps the order page current (Phase 4b). Every few seconds, while the tab
 * is visible, it asks the server one cheap question — has anything on this
 * order changed? (/api/orders/[id]/stamp) — and re-reads the page only when
 * the answer is yes. A new message or status change shows up within about
 * five seconds (two on an open conversation, Phase 12); an idle page costs
 * one tiny request each time. Server data only: anything typed into a form
 * survives a refresh.
 *
 * Given the page's threads, it also listens for the database's live signals
 * (Phase 13, lib/supabase/live): a message re-reads the page at once, and
 * while every thread is joined the check above slows to a safety net.
 */
export function AutoRefresh({ orderId, stamp, seconds = 5, threads }: { orderId: string; stamp: string | null; seconds?: number; threads?: string[] }) {
  const router = useRouter();
  const known = useRef(stamp);
  const live = useThreadSignals(threads, () => router.refresh());
  const every = live ? Math.max(seconds, 15) : seconds;

  // A refresh brings a newer stamp with it; adopt it.
  useEffect(() => {
    known.current = stamp;
  }, [stamp]);

  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/stamp`, { cache: "no-store" });
        if (res.ok) {
          const { stamp: latest } = (await res.json()) as { stamp: string };
          if (latest !== known.current) {
            known.current = latest;
            router.refresh();
          }
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(check, every * 1000);
    // Back to the tab or the window: ask at once rather than at the next tick.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [orderId, router, every]);

  return null;
}
