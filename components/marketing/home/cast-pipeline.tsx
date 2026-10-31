"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * "Every file is made to be cast" (redesign step 4e): the two sign-offs as a
 * diagram, horizontal at desk and vertical on a phone. The checklist rows tick
 * as the section scrolls into view (static under reduced motion). Plain CSS
 * transitions rather than an animation library: this is on the home page,
 * where every kilobyte of script delays the first paint on a phone.
 */
const STAGE_1 = [
  "Brief, references and special requirements read",
  "Dimensions and ring size to the brief",
  "Stone seats sized to the stones",
  "No naked or open edges",
  "Wall and prong minimums met",
  "All delivery views in the 3DM",
  "Watertight STL export",
];
const STAGE_2 = [
  "The same 19 points, checked again independently",
  "Your factory's own requirements",
  "Measured wall, prong and ring size recorded",
  "Spec sheet signed",
];

/** True once the element is 80px inside the viewport; stays true. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "-80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function Stage({ n, title, who, rows, delay }: { n: string; title: string; who: string; rows: string[]; delay: number }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  return (
    <div className="rounded-[var(--r-xl)] border border-border bg-card p-6 shadow-[var(--e-1)]">
      <p className="text-[14px] font-medium text-muted-foreground tabular">Stage {n}</p>
      <h3 className="mt-1 text-[22px] tracking-[-0.02em]">{title}</h3>
      <p className="mt-1 text-[15px] text-muted-foreground">{who}</p>
      <ul ref={ref} className="mt-5 space-y-3">
        {rows.map((row, i) => {
          const wait = { transitionDelay: `${delay + i * 0.18}s` };
          return (
            <li
              key={row}
              style={wait}
              className={cn(
                "flex items-start gap-3 text-[16px] leading-[1.45] transition-opacity duration-[250ms] ease-out motion-reduce:![transition-delay:0s]",
                seen ? "opacity-100" : "opacity-60",
              )}
            >
              <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-strong)]">
                <span
                  style={wait}
                  className={cn(
                    "absolute inset-[-1px] flex items-center justify-center rounded-full bg-foreground text-background transition-transform duration-200 ease-out motion-reduce:![transition-delay:0s]",
                    seen ? "scale-100" : "scale-0",
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </span>
              {row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CastPipeline({ checkpoints, years }: { checkpoints: number; years: string | null }) {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
      <Stage n="1" title="AI models, a senior designer checks and ticks" who={years ? `${years} years of manufacturable CAD` : "Manufacturable CAD, every day"} rows={STAGE_1} delay={0} />
      <div aria-hidden className="flex items-center justify-center lg:flex-col">
        <div className={cn("h-8 w-px bg-border lg:h-px lg:w-8")} />
        <span className="mx-3 my-0 rounded-[var(--r-full)] border border-border bg-background px-3 py-1 text-[13px] font-medium text-muted-foreground lg:mx-0 lg:my-3">
          then
        </span>
        <div className={cn("h-8 w-px bg-border lg:h-px lg:w-8")} />
      </div>
      <Stage n="2" title="Master QC re-checks and signs" who="Craftsmen who have run the bench themselves" rows={STAGE_2} delay={STAGE_1.length * 0.18} />
      <p className="text-[15px] text-muted-foreground lg:col-span-3">
        Nothing reaches you without both sign-offs. The {checkpoints}-point list and the measured specs ship with every file as a signed spec sheet.
      </p>
    </div>
  );
}
