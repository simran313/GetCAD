import { cn } from "@/lib/utils";

/**
 * The CAD Pillar wordmark (redesign): the name in Geist 600, tight tracking,
 * never wrapping. Inherits its colour.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap text-[18px] font-semibold leading-none tracking-[-0.02em]",
        className,
      )}
    >
      The CAD Pillar
    </span>
  );
}
