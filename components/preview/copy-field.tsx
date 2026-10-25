"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/** A read-only link with a Copy button. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        aria-label="Preview link"
        onFocus={(e) => e.currentTarget.select()}
        className="h-[var(--ctl-sm)] min-w-0 flex-1 rounded-[var(--r-sm)] border border-input bg-background px-2 font-mono text-[length:var(--fs-1)]"
      />
      <Button
        type="button"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
