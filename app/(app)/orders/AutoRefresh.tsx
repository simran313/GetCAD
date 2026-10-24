"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps the order page current (Phase 4b). Every few seconds, while the tab
 * is visible, it asks the server one cheap question — has anything on this
 * order changed? (/api/orders/[id]/stamp) — and re-reads the page only when
 * the answer is yes. A new message or status change shows up within about
 * five seconds; an idle page costs one tiny request each time. Server data
 * only: anything typed into a form survives a refresh.
 */
export function AutoRefresh({ orderId, stamp, seconds = 5 }: { orderId: string; stamp: string | null; seconds?: number }) {
  const router = useRouter();
  const known = useRef(stamp);

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
    const timer = window.setInterval(check, seconds * 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [orderId, router, seconds]);

  return null;
}
