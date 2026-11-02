import { PillarMark } from "@/components/brand/pillar-mark";
import { cn } from "@/lib/utils";

/**
 * The CAD Pillar wordmark (redesign): the pillar mark and the name in Geist
 * 600, tight tracking, never wrapping. Inherits its colour.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-[18px] font-semibold leading-none tracking-[-0.02em]",
        className,
      )}
    >
      <PillarMark className="h-[1em] w-[1em]" />
      The CAD Pillar
    </span>
  );
}
