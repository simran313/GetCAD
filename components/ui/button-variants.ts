import { cva, type VariantProps } from "class-variance-authority";

/**
 * Buttons (redesign). Four intents, and ONE primary per view:
 *   default (primary)  black — the one thing this screen is for
 *   secondary          white with an edge — every other action
 *   ghost              text only — tertiary, toolbars, menus
 *   destructive        red — only inside a confirmation, never on a list row
 * `outline` is the old name for secondary and renders the same.
 *
 * Heights come from the density tokens, so one component serves the client
 * screens (48px) and staff screens (36px at desk, 44px on a phone).
 */
const buttonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--dur-fast)] ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:h-[1.1em] [&_svg]:w-[1.1em] [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--e-1)] hover:bg-primary/88",
        secondary: "border border-[color:var(--border-strong)] bg-background text-foreground hover:bg-accent",
        outline: "border border-[color:var(--border-strong)] bg-background text-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground shadow-[var(--e-1)] hover:bg-destructive/90",
        link: "h-auto px-0 text-foreground underline underline-offset-4 decoration-[color:var(--hairline-strong)] hover:decoration-foreground",
      },
      size: {
        default: "h-[var(--ctl)] px-5 text-[length:var(--fs-3)]",
        sm: "h-[var(--ctl-sm)] px-3.5 text-[length:var(--fs-2)]",
        lg: "h-[var(--ctl-lg)] px-7 text-[length:var(--fs-3)]",
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


export { buttonVariants };
