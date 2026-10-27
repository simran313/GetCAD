"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar along the top of the portal while a page is on its way (Phase
 * 11a). It starts the moment a link inside the app is pressed and goes when
 * the new address is shown, so a press is always answered at once, without
 * a loading boundary (which would turn the server's redirects into
 * client-side ones and hold a submitted form's refresh).
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  // The new page is here: the address changed.
  useEffect(() => setActive(false), [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Never stuck: a navigation that goes nowhere clears after a while.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setActive(false), 15_000);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
    >
      <div className="h-full w-1/3 animate-nav-progress bg-primary motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  );
}
