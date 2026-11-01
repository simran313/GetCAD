"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-read the page every so often while it is on screen (Phase 13c), so a
 * designer's start, pause or submission shows on the pod lead's screens
 * without a reload. Skips while the tab is hidden.
 */
export function RefreshEvery({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
