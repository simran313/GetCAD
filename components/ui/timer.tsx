"use client";

import { useEffect, useState } from "react";

import { remaining } from "@/core";
import { StatusTag } from "@/components/ui/status-tag";

/**
 * Time left to a deadline, ticking (docs/design timers). Outlined while
 * there is time, solid black in the last hour and once overdue. The words
 * come from core/time/remaining, shared with every other clock.
 */
export function Timer({ dueAt, label }: { dueAt: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const r = remaining(dueAt, now);
  if (!r) return null;
  return (
    <StatusTag kind={r.overdue || r.soon ? "needs" : "active"}>
      <time dateTime={dueAt}>
        {label ? `${label} · ` : ""}
        {r.text}
      </time>
    </StatusTag>
  );
}
