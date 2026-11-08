"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeftRight, ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { canvasToJpeg, decodeImage, isPicture } from "@/lib/client/images";
import { cn } from "@/lib/utils";

/**
 * The render deliverable from four views (owner, 8 Nov 2026): four equal
 * boxes; the designer pastes a snip into a box (Ctrl+V), drops a picture on
 * it, or taps it to choose one. Drag a picture onto another box to swap them
 * (or tap ⇄ on one, then the other); × clears a box. "Make the render" lays
 * each view into an equal square on white, fitted whole (never cropped), and
 * hands back one JPEG for the Render slot.
 */
const VIEWS = ["Front", "Side", "Top", "Perspective"] as const;
const CELL = 1200; // px per view in the finished image
const GAP = 24;

type Cell = { file: File; url: string } | null;

export function RenderComposer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (file: File) => void }) {
  const [cells, setCells] = useState<Cell[]>([null, null, null, null]);
  const [active, setActive] = useState(0);
  const [moving, setMoving] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [making, setMaking] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const target = useRef(0);
  const advance = useRef<number | null>(null);

  // Free the previews when the dialog closes.
  const reset = useCallback(() => {
    setCells((cs) => {
      cs.forEach((c) => c && URL.revokeObjectURL(c.url));
      return [null, null, null, null];
    });
    setActive(0);
    setMoving(null);
  }, []);

  const put = useCallback((i: number, file: File) => {
    if (!isPicture(file)) {
      toast("That is not a picture. Paste or drop a PNG or JPEG.", "danger");
      return;
    }
    setCells((cs) => {
      const next = [...cs];
      if (next[i]) URL.revokeObjectURL(next[i]!.url);
      next[i] = { file, url: URL.createObjectURL(file) };
      return next;
    });
    advance.current = i;
  }, []);

  // After a picture lands, the next paste goes to the next empty box.
  useEffect(() => {
    if (advance.current == null) return;
    const empty = cells.findIndex((c) => !c);
    setActive(empty === -1 ? advance.current : empty);
    advance.current = null;
  }, [cells]);

  // Ctrl+V / Cmd+V while open: into the selected box.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((it) => it.kind === "file" && it.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      put(active, new File([file], `view-${active + 1}.png`, { type: file.type || "image/png" }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, active, put]);

  const swap = (a: number, b: number) => {
    if (a === b) return;
    setCells((cs) => {
      const next = [...cs];
      [next[a], next[b]] = [next[b]!, next[a]!];
      return next;
    });
  };

  const clear = (i: number) => {
    setCells((cs) => {
      const next = [...cs];
      if (next[i]) URL.revokeObjectURL(next[i]!.url);
      next[i] = null;
      return next;
    });
    setActive(i);
  };

  const make = async () => {
    setMaking(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CELL * 2 + GAP * 3;
      canvas.height = CELL * 2 + GAP * 3;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 4; i++) {
        const c = cells[i];
        if (!c) continue;
        const img = await decodeImage(c.file);
        const scale = Math.min(CELL / img.width, CELL / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = GAP + (i % 2) * (CELL + GAP) + (CELL - w) / 2;
        const y = GAP + Math.floor(i / 2) * (CELL + GAP) + (CELL - h) / 2;
        ctx.drawImage(img, x, y, w, h);
      }
      onDone(await canvasToJpeg(canvas, "render"));
      reset();
    } catch {
      toast("The render could not be made. Try the pictures again.", "danger");
    } finally {
      setMaking(false);
    }
  };

  const filled = cells.filter(Boolean).length;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[95vh] w-full max-w-3xl flex-col rounded-t-[var(--r-xl)] bg-background shadow-[var(--e-3)] outline-none sm:inset-y-0 sm:my-auto sm:h-fit sm:rounded-[var(--r-xl)]">
          <div className="flex items-start justify-between gap-3 border-b border-border p-[var(--s-4)]">
            <div>
              <Dialog.Title className="text-[length:var(--fs-4)] font-semibold">Render from four views</Dialog.Title>
              <Dialog.Description className="text-[length:var(--fs-2)] text-muted-foreground">
                Snip a view and press Ctrl+V (it goes in the box with the dark outline), drop a picture on a box, or tap a box to choose one. Drag a
                view onto another box to swap them.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] hover:bg-accent">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-2 overflow-y-auto p-[var(--s-4)] sm:gap-3">
            {cells.map((c, i) => (
              <div
                key={i}
                role="group"
                aria-label={`${VIEWS[i]} view${c ? ", filled" : ", empty"}`}
                draggable={!!c}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-render-cell", String(i));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(i);
                }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const from = e.dataTransfer.getData("application/x-render-cell");
                  if (from !== "") return swap(Number(from), i);
                  const file = e.dataTransfer.files[0];
                  if (file) put(i, file);
                }}
                onClick={() => {
                  if (moving != null) {
                    swap(moving, i);
                    setMoving(null);
                    return;
                  }
                  setActive(i);
                  if (!c) {
                    target.current = i;
                    pick.current?.click();
                  }
                }}
                className={cn(
                  "relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-[var(--r-lg)] border-2 bg-white",
                  active === i ? "border-foreground" : "border-dashed border-border",
                  over === i && "border-solid border-foreground bg-subtle",
                  moving === i && "ring-4 ring-[color:var(--tone-info-fg)]/40",
                )}
              >
                {c ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview of the view
                  <img src={c.url} alt={`${VIEWS[i]} view`} className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <span className="flex flex-col items-center gap-1 px-2 text-center text-[length:var(--fs-2)] text-muted-foreground">
                    <ImagePlus className="h-6 w-6" aria-hidden />
                    <span className="font-medium text-foreground">{VIEWS[i]}</span>
                    <span>Paste, drop or tap</span>
                  </span>
                )}
                <span className="absolute left-2 top-2 rounded-[var(--r-full)] bg-black/60 px-2 text-[length:var(--fs-1)] font-medium text-white">
                  {i + 1} · {VIEWS[i]}
                </span>
                {c && (
                  <span className="absolute right-1.5 top-1.5 flex gap-1">
                    <button
                      type="button"
                      aria-label={`Move the ${VIEWS[i]} view: then tap the box to swap with`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoving((m) => (m === i ? null : i));
                      }}
                      className="inline-flex h-[var(--ctl-sm)] w-[var(--ctl-sm)] items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <ArrowLeftRight className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove the ${VIEWS[i]} view`}
                      onClick={(e) => {
                        e.stopPropagation();
                        clear(i);
                      }}
                      className="inline-flex h-[var(--ctl-sm)] w-[var(--ctl-sm)] items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>

          <input
            ref={pick}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Choose a view"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) put(target.current, file);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-[var(--s-4)] pb-[max(var(--s-4),var(--safe-bottom))]">
            <p className="text-[length:var(--fs-2)] text-muted-foreground" aria-live="polite">
              {moving != null ? `Tap the box to swap the ${VIEWS[moving]} view with.` : `${filled} of 4 views`}
            </p>
            <Button type="button" disabled={filled < 4 || making} onClick={() => void make()}>
              {making ? "Making…" : "Make the render and upload"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
