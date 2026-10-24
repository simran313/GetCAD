import { pinStyle } from "@/core";
import type { RefImage } from "@/lib/work/references";

/** Reference pictures with the client's numbered pins, and the pin notes below. */
export function References({ images }: { images: RefImage[] }) {
  if (images.length === 0) return <p className="text-[length:var(--fs-2)] text-muted-foreground">No reference pictures.</p>;
  // Pins are numbered across all pictures, as the client placed them.
  const start = images.map((_, i) => images.slice(0, i).reduce((s, im) => s + im.pins.length, 0));
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((img, k) => (
        <li key={img.id} className="space-y-2">
          <a href={img.url} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-[var(--r-sm)] border border-border bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img src={img.url} alt="Reference" className="aspect-square w-full object-cover" />
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
          {img.pins.length > 0 && (
            <ol start={(start[k] ?? 0) + 1} className="list-decimal space-y-0.5 pl-5 text-[length:var(--fs-2)]">
              {img.pins.map((p, i) => (
                <li key={i}>{p.label}</li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
