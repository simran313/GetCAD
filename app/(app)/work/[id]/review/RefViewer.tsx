"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { pinStyle } from "@/core";
import { cn } from "@/lib/utils";
import type { RefImage } from "@/lib/work/references";

/**
 * The client's reference pictures, to match the model against (owner,
 * 2 Nov 2026): one at a time, with zoom (buttons, wheel, double-click) and
 * drag to move, so a detail can be compared without zooming the whole
 * screen. The client's numbered pins stay on their spots at any zoom.
 * Thumbnails switch pictures; every pin note is listed below.
 *
 * The addresses are kept from the first render: a checklist tick refreshes
 * the page, which signs new addresses, and the pictures must not reload.
 */
const MIN = 1;
const MAX = 8;

export function RefViewer({ images }: { images: RefImage[] }) {
  const [urls] = useState(() => new Map(images.map((i) => [i.id, i.url])));
  const [at, setAt] = useState(Math.max(0, images.findIndex((i) => i.isPrimary)));
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  /** Zoom by `factor` about a point in the frame (default: its centre), keeping that point still. */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = frame.current;
    if (!el) return;
    const cx = px ?? el.clientWidth / 2;
    const cy = py ?? el.clientHeight / 2;
    setView((v) => {
      const z = Math.min(MAX, Math.max(MIN, v.z * factor));
      if (z === 1) return { z: 1, x: 0, y: 0 };
      const k = z / v.z;
      return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  if (images.length === 0) return <p className="text-[length:var(--fs-2)] text-muted-foreground">No reference pictures.</p>;
  const start = images.map((_, i) => images.slice(0, i).reduce((s, im) => s + im.pins.length, 0));
  const img = images[at] ?? images[0]!;
  const k = images.indexOf(img);
  const src = urls.get(img.id) ?? img.url;
  const show = (i: number) => {
    setAt(i);
    setView({ z: 1, x: 0, y: 0 });
  };
  const btn = "flex h-[var(--ctl-sm)] w-[var(--ctl-sm)] items-center justify-center rounded-[var(--r-sm)] border border-border bg-background/90 hover:bg-accent disabled:opacity-40";

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={frame}
          className={cn(
            "relative flex h-[52vh] touch-none select-none items-center justify-center overflow-hidden rounded-[var(--r-md)] border border-border bg-subtle",
            view.z > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
          )}
          onDoubleClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            zoomAt(view.z >= MAX ? 1 / MAX : 2, e.clientX - r.left, e.clientY - r.top);
          }}
          onPointerDown={(e) => {
            if (view.z === 1) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* Transformed from the frame's top-left; the picture is centred inside. */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={src} alt={`Reference ${k + 1} of ${images.length}`} draggable={false} className="block max-h-[52vh] max-w-full" />
              {img.pins.map((p, i) => (
                <span
                  key={i}
                  style={{ ...pinStyle(p), transform: `translate(-50%, -50%) scale(${1 / view.z})` }}
                  className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-primary font-mono text-[length:var(--fs-1)] text-primary-foreground"
                >
                  {(start[k] ?? 0) + i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute right-2 top-2 flex gap-1">
          <button type="button" className={btn} onClick={() => zoomAt(1.5)} disabled={view.z >= MAX} aria-label="Zoom in">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={btn} onClick={() => zoomAt(1 / 1.5)} disabled={view.z <= MIN} aria-label="Zoom out">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={btn} onClick={() => setView({ z: 1, x: 0, y: 0 })} disabled={view.z === 1} aria-label="Fit the picture">
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 flex justify-between text-[length:var(--fs-1)] text-muted-foreground">
          <span className="tabular">{Math.round(view.z * 100)}% · scroll or double-click to zoom, drag to move</span>
          <a href={src} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            Full size
          </a>
        </p>
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Reference pictures">
          {images.map((im, i) => (
            <li key={im.id} className="shrink-0">
              <button
                type="button"
                onClick={() => show(i)}
                aria-label={`Reference ${i + 1}`}
                aria-pressed={i === k}
                className={cn("block overflow-hidden rounded-[var(--r-sm)] border-2", i === k ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={urls.get(im.id) ?? im.url} alt="" className="h-14 w-14 object-cover" />
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
