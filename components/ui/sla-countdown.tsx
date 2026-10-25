"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The first-look clock (redesign): neutral while there is time, amber under
 * an hour, red once overdue, and a muted "Clock not started" when the order
 * is not yet both paid and confirmed (DECISIONS §6). Ticks every 30 s.
 */
export function slaState(dueAt: string | null, now: number) {
  if (!dueAt) return { tone: "idle" as const, text: "Clock not started" };
  const ms = Date.parse(dueAt) - now;
  const mins = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  if (ms < 0) return { tone: "overdue" as const, text: `${span} overdue` };
  if (ms < 60 * 60_000) return { tone: "risk" as const, text: `${span} left` };
  return { tone: "ok" as const, text: `${span} left` };
}

const TONE = {
  idle: "text-muted-foreground",
  ok: "text-foreground",
  risk: "bg-[color:var(--tone-warning-bg)] text-[color:var(--tone-warning-fg)] px-2",
  overdue: "bg-[color:var(--tone-danger-bg)] text-[color:var(--tone-danger-fg)] px-2",
};

export function SlaCountdown({ dueAt, className, label = "First look" }: { dueAt: string | null; className?: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dueAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [dueAt]);
  const s = slaState(dueAt, now);
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] text-[length:var(--fs-2)] font-medium tabular",
        TONE[s.tone],
        className,
      )}
      title={dueAt ? `${label} due ${new Date(dueAt).toLocaleString()}` : undefined}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      <span>
        <span className="sr-only">{label}: </span>
        {s.text}
      </span>
    </span>
  );
}
