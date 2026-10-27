"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";

import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from "@/core";

/**
 * The viewer's time zone in the browser (the server reads the same cookie,
 * lib/time/zone). TimeZoneSync stores the device's own zone the first time
 * it is seen, or when the device moves, and re-renders once so every time
 * on the page is local.
 */
const Zone = createContext<string>(DEFAULT_TIME_ZONE);

export function useTimeZone(): string {
  return useContext(Zone);
}

export function TimeZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  return (
    <Zone.Provider value={zone}>
      {children}
      <TimeZoneSync zone={zone} />
    </Zone.Provider>
  );
}

function TimeZoneSync({ zone }: { zone: string }) {
  const router = useRouter();
  useEffect(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === zone) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(device)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [zone, router]);
  return null;
}
