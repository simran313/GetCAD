"use client";

import { useEffect, useState } from "react";

import { remaining } from "@/core";
import { StatusTag } from "@/components/ui/status-tag";
import { cn } from "@/lib/utils";

/**
 * Time left to a deadline, ticking (docs/design timers). Outlined while
 * there is time, solid black in the last hour and once overdue. The words
 * come from core/time/remaining, shared with every other clock.
 */
export function Timer({ dueAt, label, size = "sm" }: { dueAt: string; label?: string; size?: "sm" | "lg" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const r = remaining(dueAt, now);
  if (!r) return null;
  // R4: the clock a designer watches, large, at the top of the job.
  if (size === "lg") {
    return (
      <div>
        {label && <p className="text-[length:var(--fs-2)] text-muted-foreground">{label}</p>}
        <time
          dateTime={dueAt}
          suppressHydrationWarning
          className={cn(
            "tabular block text-[length:var(--fs-display)] font-semibold leading-[var(--lh-display)] tracking-[-0.02em]",
            r.overdue ? "text-[color:var(--tone-danger-fg)]" : r.soon ? "text-[color:var(--tone-warning-fg)]" : "text-foreground",
          )}
        >
          {r.text}
        </time>
      </div>
    );
  }
  return (
    <StatusTag kind={r.overdue || r.soon ? "needs" : "active"}>
      {/* Server and browser read the clock moments apart; across a minute the words differ. */}
      <time dateTime={dueAt} suppressHydrationWarning>
        {label ? `${label} · ` : ""}
        {r.text}
      </time>
    </StatusTag>
  );
}
