import { cn } from "@/lib/utils";

/**
 * The CAD Pillar mark (owner, 2 Nov 2026): three pillars, black on white,
 * the same drawing as the favicon and app icons (public/icons). It takes the
 * text colour, so it stays black on the white pages and turns white on a
 * black band. Decorative beside the name, which carries the label.
 */
export function PillarMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 78 78"
      className={cn("h-5 w-5 shrink-0", className)}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="0" y="0" width="12" height="78" rx="2.4" />
      <rect x="33" y="0" width="12" height="78" rx="2.4" />
      <rect x="66" y="0" width="12" height="78" rx="2.4" />
    </svg>
  );
}
