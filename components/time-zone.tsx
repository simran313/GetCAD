"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { DEFAULT_TIME_ZONE, formatTime, TIME_ZONE_CHOICES, TIME_ZONE_COOKIE, TIME_ZONE_MANUAL_COOKIE } from "@/core";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

/**
 * The viewer's time zone in the browser (the server reads the same cookie,
 * lib/time/zone). TimeZoneSync stores the device's own zone the first time
 * it is seen, or when the device moves, and re-renders once so every time
 * on the page is local, unless the person chose a zone in Settings
 * (TimeZoneSetting), which then stays until they choose "This device".
 */
const Zone = createContext<string>(DEFAULT_TIME_ZONE);
const YEAR = 60 * 60 * 24 * 365;

export function useTimeZone(): string {
  return useContext(Zone);
}

const setCookie = (name: string, value: string, maxAge = YEAR) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
};
const chosenByHand = () => document.cookie.split("; ").some((c) => c.startsWith(`${TIME_ZONE_MANUAL_COOKIE}=1`));
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    if (chosenByHand()) return;
    const device = deviceZone();
    if (!device || device === zone) return;
    setCookie(TIME_ZONE_COOKIE, device);
    router.refresh();
  }, [zone, router]);
  return null;
}

/** Settings: which zone times are shown in on this device. */
export function TimeZoneSetting() {
  const router = useRouter();
  const zone = useTimeZone();
  const [manual, setManual] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => {
    setManual(chosenByHand());
    setDevice(deviceZone());
  }, []);

  const value = manual ? zone : "device";
  const choose = (next: string) => {
    if (next === "device") {
      setCookie(TIME_ZONE_MANUAL_COOKIE, "", 0);
      setCookie(TIME_ZONE_COOKIE, deviceZone());
      setManual(false);
    } else {
      setCookie(TIME_ZONE_MANUAL_COOKIE, "1");
      setCookie(TIME_ZONE_COOKIE, next);
      setManual(true);
    }
    router.refresh();
    toast("Time zone saved");
  };
  const deviceLabel = TIME_ZONE_CHOICES.find((c) => c.zone === device)?.label ?? device;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor="tz" className="min-w-0">
        <span className="block text-[length:var(--fs-3)] font-medium">Time zone</span>
        <span className="block text-[length:var(--fs-2)] text-muted-foreground" suppressHydrationWarning>
          Now {formatTime(new Date(), zone)}
        </span>
      </label>
      <Select id="tz" value={value} onChange={(e) => choose(e.target.value)} className="w-auto min-w-[12rem]">
        <option value="device">This device{deviceLabel ? ` (${deviceLabel})` : ""}</option>
        {TIME_ZONE_CHOICES.map((c) => (
          <option key={c.zone} value={c.zone}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
