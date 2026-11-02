"use client";

import { useState } from "react";

import { pinStyle } from "@/core";
import { cn } from "@/lib/utils";
import type { RefImage } from "@/lib/work/references";

/**
 * The client's reference pictures, large enough to match against: one at a
 * time with the client's numbered pins, the others as thumbnails, and every
 * pin note listed (numbered across all pictures, as the client placed them).
 */
export function RefViewer({ images }: { images: RefImage[] }) {
  const [at, setAt] = useState(Math.max(0, images.findIndex((i) => i.isPrimary)));
  if (images.length === 0) return <p className="text-[length:var(--fs-2)] text-muted-foreground">No reference pictures.</p>;
  const start = images.map((_, i) => images.slice(0, i).reduce((s, im) => s + im.pins.length, 0));
  const img = images[at] ?? images[0]!;
  const k = images.indexOf(img);
  return (
    <div className="space-y-3">
      <a href={img.url} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-[var(--r-md)] border border-border bg-subtle" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img src={img.url} alt={`Reference ${k + 1} of ${images.length}`} className="max-h-[52vh] w-full object-contain" />
        {img.pins.map((p, i) => (
          <span
            key={i}
            style={pinStyle(p)}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary font-mono text-[length:var(--fs-1)] text-primary-foreground"
          >
            {(start[k] ?? 0) + i + 1}
          </span>
        ))}
      </a>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Reference pictures">
          {images.map((im, i) => (
            <li key={im.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setAt(i)}
                aria-label={`Reference ${i + 1}`}
                aria-pressed={i === k}
                className={cn("block overflow-hidden rounded-[var(--r-sm)] border-2", i === k ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={im.url} alt="" className="h-14 w-14 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {images.some((im) => im.pins.length > 0) && (
        <ol className="list-decimal space-y-0.5 pl-5 text-[length:var(--fs-2)]">
          {images.flatMap((im) => im.pins.map((p, i) => <li key={`${im.id}-${i}`}>{p.label}</li>))}
        </ol>
      )}
    </div>
  );
}
