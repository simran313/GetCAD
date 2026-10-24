import { cn } from "@/lib/utils";

/**
 * A form field as the mockups lay it out: label above, the control, then a
 * hint or an error below. The error replaces the hint and is announced.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = htmlFor ? `${htmlFor}-note` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-[length:var(--fs-2)] font-medium leading-[var(--lh-2)]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">optional</span>}
      </label>
      {children}
      {error ? (
        <p id={describedBy} role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
