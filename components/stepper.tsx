import { cn } from "@/lib/utils";

export interface Step {
  label: string;
}

/**
 * Horizontal step indicator for a linear flow (onboarding, wizards, an
 * order's journey). "fit" spreads the steps evenly with the label under each
 * mark, so five labelled stages fit a phone.
 */
export function Stepper({
  steps,
  current,
  className,
  layout = "row",
}: {
  steps: Step[];
  current: number;
  className?: string;
  layout?: "row" | "fit";
}) {
  if (layout === "fit") {
    return (
      <ol
        className={cn("grid text-center text-[length:var(--fs-1)] leading-[var(--lh-1)]", className)}
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        aria-label="Progress"
      >
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.label} className="relative flex min-w-0 flex-col items-center gap-1.5">
              {i < steps.length - 1 && (
                <span
                  className={cn("absolute left-1/2 top-2.5 h-px w-full", done ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              )}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex h-5 w-5 items-center justify-center rounded-full bg-background text-[length:var(--fs-1)] font-medium",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={cn("w-full truncate", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                {step.label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol
      className={cn(
        "flex items-center gap-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]",
        className,
      )}
      aria-label="Progress"
    >
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[length:var(--fs-2)] leading-[var(--lh-2)] font-medium",
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "border-2 border-primary text-primary"
                    : "border border-border text-muted-foreground",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
