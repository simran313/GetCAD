import { cn } from "@/lib/utils";

/**
 * A status, in sentence case with a dot (redesign). Six tones, each meaning
 * one thing (app/globals.css): neutral, info (in flight), attention (you are
 * holding it up), success, warning (SLA risk), danger. The label always
 * carries the meaning; the colour only reinforces it.
 */
export type PillTone = "neutral" | "info" | "attention" | "success" | "warning" | "danger";

const TONE: Record<PillTone, string> = {
  neutral: "bg-[color:var(--tone-neutral-bg)] text-[color:var(--tone-neutral-fg)]",
  info: "bg-[color:var(--tone-info-bg)] text-[color:var(--tone-info-fg)]",
  attention: "bg-foreground text-background",
  success: "bg-[color:var(--tone-success-bg)] text-[color:var(--tone-success-fg)]",
  warning: "bg-[color:var(--tone-warning-bg)] text-[color:var(--tone-warning-fg)]",
  danger: "bg-[color:var(--tone-danger-bg)] text-[color:var(--tone-danger-fg)]",
};

export function StatusPill({
  tone,
  children,
  className,
  dot = true,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] px-2.5 py-0.5",
        "text-[length:var(--fs-2)] font-medium leading-[var(--lh-2)]",
        TONE[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
