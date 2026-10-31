"use client";

import { useEffect, useState } from "react";

import { supportHoursLabel, supportOnline, supportStatusLabel } from "@/core/support/hours";
import { cn } from "@/lib/utils";

/**
 * Live support, now (owner, 31 Oct 2026): a green dot while a person is
 * answering, grey otherwise, with the hours in ET (which follow US daylight
 * saving) and, on hover, in the reader's own time. Worked out in the browser
 * every minute, so a page built in summer still reads right in winter. The
 * portal itself is open around the clock; this is only about live help.
 */
export function SupportStatus({ className, tone = "default", showHours = true }: { className?: string; tone?: "default" | "inverse"; showHours?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Before the browser has a clock (the server render), the daylight-time hours.
  const online = now ? supportOnline(now) : null;
  const hours = now ? supportHoursLabel(now) : "5:30 AM – 2:30 PM ET";
  const local = now ? supportHoursLabel(now, Intl.DateTimeFormat().resolvedOptions().timeZone) : null;
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[length:var(--fs-2)]", tone === "inverse" ? "text-background/75" : "text-muted-foreground", className)}
      title={local ? `Your time: ${local}` : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          online === null ? "bg-current opacity-30" : online ? "bg-[color:var(--tone-success-fg)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--tone-success-fg)_20%,transparent)]" : "bg-current opacity-40",
        )}
      />
      <span>
        {now ? supportStatusLabel(now) : "Live support"}
        {showHours && <span className="whitespace-nowrap"> · {hours}</span>}
      </span>
    </span>
  );
}
