import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        // White with the mockups' #CFCFC9 edge; the label carries the contrast.
        outline:
          "border border-[color:var(--border-strong)] bg-background text-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      /*
       * Heights come from tokens, not from Tailwind's scale, so one component
       * serves both densities. On a client screen `sm` is 44px — the platform
       * minimum — while on a staff screen it is the 32px it always was. No
       * component anywhere branches on density.
       */
      size: {
        default: "h-[var(--ctl)] px-5 text-[length:var(--fs-3)]",
        sm: "h-[var(--ctl-sm)] px-4 text-[length:var(--fs-2)]",
        lg: "h-[var(--ctl-lg)] px-7 text-[length:var(--fs-4)]",
        icon: "h-[var(--ctl-icon)] w-[var(--ctl-icon)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
