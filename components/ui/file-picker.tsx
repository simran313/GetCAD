"use client";

import { Paperclip } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

/**
 * A file input that looks like the rest of the app (redesign): a secondary
 * "Choose file" button and the chosen file's name, instead of the browser's
 * own grey control. The real <input type="file"> stays in the form (visually
 * hidden, still labelled and focusable), so server actions and tests work
 * exactly as before.
 */
export function FilePicker({
  name,
  label,
  accept,
  required,
  multiple,
  buttonLabel = "Choose file",
  className,
  disabled,
}: {
  name: string;
  /** The input's accessible name (e.g. "Logo file"). */
  label: string;
  accept?: string;
  required?: boolean;
  multiple?: boolean;
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string>("");
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-3", className)}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        className="peer sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          setChosen(files.length > 1 ? `${files.length} files` : (files[0]?.name ?? ""));
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "cursor-pointer peer-focus-visible:shadow-[var(--focus-ring)] peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
        )}
      >
        <Paperclip aria-hidden /> {buttonLabel}
      </label>
      <span className={cn("min-w-0 truncate text-[length:var(--fs-2)]", chosen ? "text-foreground" : "text-muted-foreground")} aria-live="polite">
        {chosen || "No file chosen"}
      </span>
    </div>
  );
}
