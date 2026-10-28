"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

import { buttonVariants, type ButtonProps } from "./button-variants";

/**
 * The button itself. Inside a form whose action is running (a server
 * action), a submit button shows a spinner and is disabled until the answer
 * comes back (Phase 11a): the press is acknowledged at once and cannot be
 * sent twice. Outside a form, or for type="button", nothing changes.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type, disabled, children, ...props }, ref) => {
  const { pending } = useFormStatus();
  const busy = pending && type !== "button" && type !== "reset";
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
      {busy && size === "icon" ? null : children}
    </button>
  );
});
Button.displayName = "Button";

export { Button };

/**
 * A submit button that keeps its own look (a tile, a list row) but has the
 * same guard as Button: while its form's action runs it is disabled and
 * marked busy, so a second tap cannot send it again (Phase 12).
 */
function SubmitPlain({ className, disabled, children, ...props }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={cn(className, "aria-busy:cursor-progress aria-busy:opacity-60")} disabled={disabled || pending} aria-busy={pending || undefined} {...props}>
      {children}
    </button>
  );
}

export { SubmitPlain };
