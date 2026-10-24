import { cn } from "@/lib/utils";

/**
 * A row of choices drawn as pills (docs/design: product type, metal, size
 * system). Real radio inputs, so it works inside a server-action form with
 * no JavaScript and reads correctly to a screen reader; the selected pill is
 * black.
 */
export function Pills({
  name,
  options,
  defaultValue,
  legend,
  required,
  className,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  legend: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-[length:var(--fs-2)] font-medium leading-[var(--lh-2)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              required={required}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex min-h-[var(--ctl-sm)] items-center rounded-[var(--r-xs)] border border-border bg-background px-3.5",
                "text-[length:var(--fs-2)] text-muted-foreground transition-colors",
                "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
