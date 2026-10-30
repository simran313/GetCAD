"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, MapPin, PenLine, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import { canvasToJpeg, decodeImage, fitSize } from "@/lib/client/images";
import { cn } from "@/lib/utils";

/**
 * Mark up a picture before sending it (Phase 15): draw on it with a pen, or
 * drop numbered pins on the spots that need changing ("1: thinner shank",
 * "2: raise the halo"), then send the marked-up copy. Works with a finger or a
 * mouse. The original is never changed; the result is a new JPEG.
 */
type Mark = { kind: "pen"; points: [number, number][] } | { kind: "pin"; x: number; y: number };
type Tool = "pen" | "pin";

const INK = "#e11d48";

export function ImageMarkup({ source, onCancel, onDone }: { source: Blob | null; onCancel: () => void; onDone: (file: File) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const drawing = useRef<Mark | null>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  // Load the picture each time the editor opens.
  useEffect(() => {
    setMarks([]);
    setImage(null);
    if (!source) return;
    let live = true;
    decodeImage(source)
      .then((img) => live && setImage(img))
      .catch(() => {
        toast("This picture could not be opened for marking up.", "danger");
        cancel.current();
      });
    return () => {
      live = false;
    };
  }, [source]);

  const paint = useCallback(
    (all: Mark[]) => {
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx || !image) return;
      ctx.drawImage(image, 0, 0, el.width, el.height);
      const line = Math.max(4, el.width / 220);
      const pin = Math.max(18, el.width / 40);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      let n = 0;
      for (const m of all) {
        if (m.kind === "pen") {
          ctx.strokeStyle = INK;
          ctx.lineWidth = line;
          ctx.beginPath();
          m.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
          if (m.points.length === 1) ctx.lineTo(m.points[0]![0] + 0.1, m.points[0]![1]);
          ctx.stroke();
        } else {
          n += 1;
          ctx.fillStyle = INK;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = Math.max(2, pin / 8);
          ctx.beginPath();
          ctx.arc(m.x, m.y, pin, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = `700 ${Math.round(pin * 1.1)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(n), m.x, m.y + pin * 0.05);
        }
      }
    },
    [image],
  );

  // Size the canvas to the picture (at most 2560 px on the long side) and draw.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !image) return;
    const size = fitSize(image.width, image.height);
    el.width = size.width;
    el.height = size.height;
    paint(marks);
  }, [image, marks, paint]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) * el.width) / r.width, ((e.clientY - r.top) * el.height) / r.height];
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const [x, y] = at(e);
    if (tool === "pin") {
      setMarks((m) => [...m, { kind: "pin", x, y }]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { kind: "pen", points: [[x, y]] };
    paint([...marks, drawing.current]);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.kind !== "pen") return;
    d.points.push(at(e));
    paint([...marks, d]);
  };
  const up = () => {
    const d = drawing.current;
    drawing.current = null;
    if (d) setMarks((m) => [...m, d]);
  };

  const done = async () => {
    const el = canvas.current;
    if (!el || !image) return;
    paint(marks);
    try {
      onDone(await canvasToJpeg(el, "markup"));
    } catch {
      toast("This picture could not be saved.", "danger");
    }
  };

  const toolButton = (t: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={tool === t}
      onClick={() => setTool(t)}
      className={cn(
        "inline-flex min-h-[var(--ctl)] items-center gap-2 rounded-[var(--r-full)] px-4 text-[length:var(--fs-3)] font-medium",
        tool === t ? "bg-white text-black" : "text-white hover:bg-white/10",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Dialog.Root open={!!source} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black" />
        <Dialog.Content className="fixed inset-0 z-[70] flex flex-col text-white outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3 p-3">
            <Dialog.Close aria-label="Cancel" className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] hover:bg-white/10">
              <X className="h-5 w-5" />
            </Dialog.Close>
            <Dialog.Title className="text-[length:var(--fs-4)] font-medium">Mark up</Dialog.Title>
            <button
              type="button"
              onClick={() => void done()}
              disabled={!image}
              className="inline-flex min-h-[var(--ctl)] items-center gap-1.5 rounded-[var(--r-full)] bg-white px-4 text-[length:var(--fs-3)] font-semibold text-black disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden /> Done
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            <canvas
              ref={canvas}
              aria-label={tool === "pin" ? "Picture: tap to drop a numbered pin" : "Picture: draw with your finger or mouse"}
              className="max-h-full max-w-full touch-none select-none rounded-[var(--r-md)]"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 p-3 pb-[max(var(--s-3),env(safe-area-inset-bottom))]">
            {toolButton("pen", "Draw", <PenLine className="h-4 w-4" aria-hidden />)}
            {toolButton("pin", "Pin", <MapPin className="h-4 w-4" aria-hidden />)}
            <button
              type="button"
              onClick={() => setMarks((m) => m.slice(0, -1))}
              disabled={marks.length === 0}
              className="inline-flex min-h-[var(--ctl)] items-center gap-2 rounded-[var(--r-full)] px-4 text-[length:var(--fs-3)] hover:bg-white/10 disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" aria-hidden /> Undo
            </button>
            <button
              type="button"
              onClick={() => setMarks([])}
              disabled={marks.length === 0}
              className="inline-flex min-h-[var(--ctl)] items-center gap-2 rounded-[var(--r-full)] px-4 text-[length:var(--fs-3)] hover:bg-white/10 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Clear
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
