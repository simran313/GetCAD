"use client";

import { useEffect, useState } from "react";

import { supportHoursLabel, supportOnline, supportStatusLabel } from "@/core/support/hours";
import { cn } from "@/lib/utils";

/**
 * Live support, now (owner, 31 Oct 2026): a green dot and "online" while a
 * person is answering, grey and "offline" otherwise, with the hours in ET
 * (which follow US daylight saving) and, on hover, when it opens next and
 * the hours in the reader's own time. Worked out in the browser every
 * minute, so a page built in summer still reads right in winter. The portal
 * itself is open around the clock; this is only about live help.
 */
export function SupportStatus({ className, tone = "default", showHours = true }: { className?: string; tone?: "default" | "inverse"; showHours?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Before the browser has a clock (the server render), the daylight-time
  // hours and no status word yet. Nothing may change size when the clock
  // arrives (it moved the page at night, failing the layout-shift budget):
  // the hours use tabular digits, so "5:30 AM – 2:30 PM" and "4:30 AM – 1:30
  // PM" are the same width, and the status word sits in a slot as wide as
  // its longest form.
  const online = now ? supportOnline(now) : null;
  const hours = now ? supportHoursLabel(now) : "5:30 AM – 2:30 PM ET";
  const local = now ? supportHoursLabel(now, Intl.DateTimeFormat().resolvedOptions().timeZone) : null;
  const title = now ? [online ? null : supportStatusLabel(now), local ? `Your time: ${local}` : null].filter(Boolean).join(" · ") : "";
  const shown = (word: "online" | "offline") => online !== null && (word === "online") === online;
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[length:var(--fs-2)]", tone === "inverse" ? "text-background/75" : "text-muted-foreground", className)}
      title={title || undefined}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          online === null ? "bg-current opacity-30" : online ? "bg-[color:var(--tone-success-fg)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--tone-success-fg)_20%,transparent)]" : "bg-current opacity-40",
        )}
      />
      <span>
        <span className="whitespace-nowrap">
          Live support{" "}
          <span className="inline-grid">
            {(["online", "offline"] as const).map((word) => (
              <span key={word} className={cn("col-start-1 row-start-1", !shown(word) && "invisible")} aria-hidden={shown(word) ? undefined : true}>
                {word}
              </span>
            ))}
          </span>
        </span>
        {/* The space sits outside the no-wrap spans, so a narrow column
            breaks the line here instead of running into its neighbour. */}
        {showHours && (
          <>
            {" "}
            <span className="tabular whitespace-nowrap">· {hours}</span>
          </>
        )}
      </span>
    </span>
  );
}
