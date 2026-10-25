"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A raw ID kept out of the way (redesign): shortened in mono, the whole value
 * copied in one tap. For staff screens only; never put a counterparty's ID in
 * a client, designer or pod-lead view.
 */
export function CopyableID({ value, label = "ID", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={value}
      aria-label={copied ? `${label} copied` : `Copy ${label} ${value}`}
      className={cn(
        "group inline-flex min-h-8 items-center gap-1.5 rounded-[var(--r-xs)] px-1.5 font-mono text-[length:var(--fs-2)] text-muted-foreground",
        "transition-colors duration-[var(--dur-fast)] hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <span className="tabular">{short}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--tone-success-fg)]" /> : <Copy className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />}
      <span role="status" className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}
