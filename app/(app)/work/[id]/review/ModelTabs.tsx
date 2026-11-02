"use client";

import { useState } from "react";

import { StlViewer } from "@/components/preview/stl-viewer";
import { cn } from "@/lib/utils";

/**
 * The right-hand window of the final review: the STL in 3D (drag to turn),
 * the render views and the technical sheet as uploaded (with the weights
 * joined under it). One at a time, so the 3D view gets the room.
 */
export interface ModelView {
  key: "stl" | "render" | "tech";
  label: string;
  /** The STL's signed address, or the image's download path. */
  url: string;
  /** For the STL: the same file streamed from this origin, if the direct read is refused. */
  fallbackUrl?: string;
  /** For the STL: where to download it. */
  downloadUrl?: string;
}

export function ModelTabs({ views }: { views: ModelView[] }) {
  const [active, setActive] = useState(views[0]?.key);
  if (views.length === 0) return <p className="text-[length:var(--fs-2)] text-muted-foreground">Upload the STL, render and technical sheet to see them here.</p>;
  const view = views.find((v) => v.key === active) ?? views[0]!;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div role="tablist" aria-label="Your files" className="flex flex-wrap gap-1">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={v.key === view.key}
            onClick={() => setActive(v.key)}
            className={cn(
              "min-h-[var(--ctl-sm)] rounded-[var(--r-sm)] border px-3 text-[length:var(--fs-2)]",
              v.key === view.key ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={view.label} className="min-h-0 flex-1">
        {view.key === "stl" ? (
          <StlViewer
            key={view.url}
            url={view.url}
            fallbackUrl={view.fallbackUrl}
            downloadUrl={view.downloadUrl}
            fill
            label="Your STL"
            failedText="The 3D view could not load. Check the render and technical tabs, or open the STL on your computer."
          />
        ) : (
          <a href={view.url} target="_blank" rel="noreferrer" className="flex h-full min-h-[320px] items-center justify-center rounded-[var(--r-lg)] border border-border bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element -- served through the download gate */}
            <img src={view.url} alt={view.label} className="max-h-full w-full object-contain" />
          </a>
        )}
      </div>
    </div>
  );
}
