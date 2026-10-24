import { cn } from "@/lib/utils";

/**
 * The CAD Pillar wordmark, as the mockups set it (docs/design): the name in
 * Instrument Serif, nothing else. Inherits its colour, so it sits on the
 * white client sidebar and the black team sidebar alike.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[length:var(--fs-6)] font-normal leading-none tracking-[-0.01em]",
        className,
      )}
    >
      The CAD Pillar
    </span>
  );
}
