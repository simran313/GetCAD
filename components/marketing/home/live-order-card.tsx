"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

/**
 * The hero's visual: a real-looking order card from the client portal, with
 * the first-look clock running and the designer's checklist ticking. Sample
 * data only. Static under prefers-reduced-motion. CSS transitions, not an
 * animation library: it is the hero, and script delays the first paint.
 */
const ROWS = ["Brief and dimensions", "Stone seats to spec", "Wall and prong minimums", "Watertight STL export"];
const START = 5 * 3600 + 42 * 60;

export function LiveOrderCard() {
  const [left, setLeft] = useState(START);
  const [ticked, setTicked] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTicked(3);
      return;
    }
    const clock = setInterval(() => setLeft((s) => (s > START - 3600 ? s - 1 : START)), 1000);
    const ticks = setInterval(() => setTicked((t) => (t >= ROWS.length ? 0 : t + 1)), 1400);
    return () => {
      clearInterval(clock);
      clearInterval(ticks);
    };
  }, []);

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;

  return (
    <div className="relative" aria-label="Example order in the client portal" role="img">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(60%_60%_at_70%_30%,hsl(0_0%_0%/0.06),transparent)]" />
      <div className="rounded-[var(--r-xl)] border border-border bg-card p-5 shadow-[var(--e-2)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[13px] text-muted-foreground">MJ1-RN-C-10</p>
            <p className="mt-0.5 text-[18px] font-semibold tracking-[-0.01em]">Halo engagement ring</p>
          </div>
          <StatusPill tone="info">In design</StatusPill>
        </div>
        <div className="mt-5 rounded-[var(--r-md)] bg-subtle px-4 py-3.5">
          <p className="text-[14px] text-muted-foreground">First look in</p>
          <p className="text-[40px] font-semibold leading-tight tracking-[-0.03em] tabular">
            {h}h {String(m).padStart(2, "0")}m <span className="text-[20px] text-muted-foreground">{String(s).padStart(2, "0")}s</span>
          </p>
        </div>
        <p className="mt-5 text-[13px] font-medium text-muted-foreground">Designer checklist</p>
        <ul className="mt-2 space-y-2.5">
          {ROWS.map((row, i) => {
            const done = i < ticked;
            return (
              <li key={row} className="flex items-center gap-2.5 text-[15px]">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color] duration-200 ease-out",
                    done ? "scale-100 border-foreground bg-foreground" : "scale-90 border-border bg-background",
                  )}
                >
                  {done && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
                </span>
                <span className={done ? "text-foreground" : "text-muted-foreground"}>{row}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[14px]">
          <span className="text-muted-foreground">Then a master craftsman re-checks all 19 points</span>
        </div>
      </div>
    </div>
  );
}
