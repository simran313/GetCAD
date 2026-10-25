import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * An input with its unit beside it ("g/cm³", "hours", "$"), so a number is
 * never ambiguous. The unit is part of the control's accessible description.
 */
export const InputWithUnit = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { unit: string; prefix?: string }
>(({ className, unit, prefix, id, ...props }, ref) => {
  const unitId = id ? `${id}-unit` : undefined;
  return (
    <div
      className={cn(
        "flex h-[var(--ctl)] w-full items-center rounded-[var(--r-sm)] border border-input bg-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background",
        className,
      )}
    >
      {prefix && <span className="pl-3.5 text-[length:var(--fs-3)] text-muted-foreground">{prefix}</span>}
      <input
        ref={ref}
        id={id}
        aria-describedby={unitId}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-right text-[length:var(--fs-3)] tabular focus:outline-none"
        {...props}
      />
      <span id={unitId} className="whitespace-nowrap border-l border-border px-3 text-[length:var(--fs-2)] text-muted-foreground">
        {unit}
      </span>
    </div>
  );
});
InputWithUnit.displayName = "InputWithUnit";
