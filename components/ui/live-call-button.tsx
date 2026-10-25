import { Phone } from "lucide-react";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

/**
 * "Talk to your team" (redesign): a real person, by phone, in the hours the
 * team is staffed. The number and hours come from content/claims.ts; until
 * they are confirmed this links to the contact page instead of a phone.
 */
export function LiveCallButton({
  phone,
  hours,
  label = "Talk to your team",
  compact = false,
  className,
}: {
  phone?: string | null;
  hours?: string | null;
  label?: string;
  /** Icon only (phone top bar). */
  compact?: boolean;
  className?: string;
}) {
  const href = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact";
  const title = hours ? `${label} · ${hours}` : label;
  return (
    <a
      href={href}
      title={title}
      aria-label={compact ? title : undefined}
      className={cn(buttonVariants({ variant: "secondary", size: compact ? "icon" : "sm" }), "gap-2", className)}
    >
      <span className="relative flex">
        <Phone />
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background bg-[color:var(--tone-success-fg)]" />
      </span>
      {!compact && <span>{label}</span>}
    </a>
  );
}
