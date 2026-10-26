"use client";

import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Instant quote (redesign step 4i): piece + complexity → price band and
 * turnaround, from DECISIONS §4 and §6. Bands, not a final price: the exact
 * price comes within the hour, before anything is paid.
 */
const PIECES = ["Ring", "Band", "Pendant", "Earrings", "Bracelet or bangle", "Signet"];
type Level = "simple" | "detailed" | "sculpted";
const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: "simple", label: "Simple", hint: "Solitaire, plain band, simple pendant" },
  { key: "detailed", label: "Detailed", hint: "Halo, pavé, multi-part" },
  { key: "sculpted", label: "Sculpted", hint: "Figures, organic forms, large pieces" },
];

export function QuoteWidget({
  bands,
  firstLookHours,
}: {
  bands: { standard: string; complex: string; sculpted: string; firstDesign: string };
  firstLookHours: number;
}) {
  const [piece, setPiece] = useState(PIECES[0]!);
  const [level, setLevel] = useState<Level>("simple");
  const price = level === "simple" ? bands.standard : level === "detailed" ? bands.complex : bands.sculpted;
  const timing = level === "sculpted" ? "Firm deadline set with your quote" : `First look within ${firstLookHours} hours of confirmation`;

  return (
    <div className="grid overflow-hidden rounded-[var(--r-xl)] border border-border bg-card shadow-[var(--e-2)] lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-7 p-6 sm:p-8">
        <fieldset>
          <legend className="text-[16px] font-medium">What are we making?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {PIECES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={piece === p}
                onClick={() => setPiece(p)}
                className={cn(
                  "min-h-11 rounded-[var(--r-full)] border px-4 text-[16px] transition-colors duration-[var(--dur-fast)]",
                  piece === p ? "border-foreground bg-foreground text-background" : "border-border hover:border-[color:var(--border-strong)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[16px] font-medium">How detailed?</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={level === l.key}
                onClick={() => setLevel(l.key)}
                className={cn(
                  "rounded-[var(--r-md)] border p-3.5 text-left transition-colors duration-[var(--dur-fast)]",
                  level === l.key ? "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]" : "border-border hover:border-[color:var(--border-strong)]",
                )}
              >
                <span className="block text-[16px] font-medium">{l.label}</span>
                <span className="mt-0.5 block text-[14px] leading-[1.4] text-muted-foreground">{l.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col justify-between gap-6 border-t border-border bg-subtle p-6 sm:p-8 lg:border-l lg:border-t-0" aria-live="polite">
        <div>
          <p className="text-[15px] text-muted-foreground">{piece} · {LEVELS.find((l) => l.key === level)!.label.toLowerCase()}</p>
          <p className="mt-1 text-[56px] font-semibold leading-none tracking-[-0.04em] tabular">{price}</p>
          {level === "simple" && <p className="mt-2 text-[16px]">Your first design: <b className="font-semibold">{bands.firstDesign}</b></p>}
          <p className="mt-4 flex items-center gap-2 text-[16px]">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {timing}
          </p>
          <p className="mt-2 text-[15px] text-muted-foreground">Includes 3DM, STL, renders, spec sheet and weight sheet. Exact price within the hour, before you pay.</p>
        </div>
        <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Start this design <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
