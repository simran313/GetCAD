"use client";

import { Camera, Loader2, Lock, MapPin, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { MAX_UPLOAD_BYTES } from "@/core";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { ReferencePinner } from "./ReferencePinner";
import { addReferenceImageAction, removeReferenceImageAction, setPrimaryReferenceAction } from "./referenceActions";
import type { ReferenceImage } from "./ReferenceSection";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const fd = (o: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/**
 * Reference photos, inside the brief's first step (above Next), so they are
 * never missed and then demanded at review. One "Add photos" control opens
 * the camera or gallery with multi-select; each picture uploads on choice
 * through the same action and cleaning as before (metadata stripped).
 * Marking what you mean is optional, from a thumbnail. Every action is the
 * existing server action, called directly, so nothing here is a nested form.
 */
export function Photos({ orderId, images, readOnly = false }: { orderId: string; images: ReferenceImage[]; readOnly?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [marking, setMarking] = useState<ReferenceImage | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const [busy, start] = useTransition();

  const add = async (files: File[]) => {
    const ok = files.filter((f) => {
      if (!ACCEPT.includes(f.type)) {
        toast(`${f.name}: use a JPEG, PNG or WebP picture`, "danger");
        return false;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        toast(`${f.name}: larger than 25 MB`, "danger");
        return false;
      }
      return true;
    });
    if (ok.length === 0) return;
    const previews = ok.map((f) => URL.createObjectURL(f));
    setUploading((u) => [...u, ...previews]);
    for (const [i, file] of ok.entries()) {
      try {
        await addReferenceImageAction(fd({ order_id: orderId, image: file }));
      } catch {
        toast(`${file.name} was not added`, "danger");
      } finally {
        setUploading((u) => u.filter((p) => p !== previews[i]));
        URL.revokeObjectURL(previews[i]!);
      }
    }
    router.refresh();
  };

  const remove = (image: ReferenceImage) =>
    start(async () => {
      try {
        await removeReferenceImageAction(fd({ order_id: orderId, image_id: image.id }));
        router.refresh();
      } catch {
        toast("Not removed", "danger");
      }
    });

  const makeMain = (image: ReferenceImage) =>
    start(async () => {
      await setPrimaryReferenceAction(fd({ order_id: orderId, image_id: image.id }));
      router.refresh();
    });

  return (
    <section id="photos" aria-labelledby="photos-title" className="mt-6 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h3 id="photos-title" className="text-[length:var(--fs-4)] font-medium">
          Photos
        </h3>
        <button
          type="button"
          onClick={() => setPrivacy((v) => !v)}
          aria-expanded={privacy}
          className="inline-flex min-h-[var(--ctl-sm)] items-center gap-1 rounded-[var(--r-full)] px-2 text-[length:var(--fs-2)] text-muted-foreground hover:text-foreground"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden /> Private
        </button>
      </div>
      {privacy && (
        <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">
          Location, camera and owner details are removed before a photo is stored.
        </p>
      )}

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image) => (
          <li key={image.id} className="relative aspect-square overflow-hidden rounded-[var(--r-md)] border border-border bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
            <img src={image.signedUrl} alt={image.isPrimary ? "Main reference photo" : "Reference photo"} className="h-full w-full object-cover" />
            {image.isPrimary && images.length > 1 && (
              <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-[var(--r-full)] bg-background/90 px-1.5 text-[length:var(--fs-1)] font-medium">
                <Star className="h-3 w-3" aria-hidden /> Main
              </span>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => remove(image)}
                  disabled={busy}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-[var(--e-1)] before:absolute before:-inset-2 before:content-['']"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setMarking(image)}
                  className="absolute inset-x-1 bottom-1 inline-flex min-h-7 items-center justify-center gap-1 rounded-[var(--r-sm)] bg-background/90 text-[length:var(--fs-1)] font-medium"
                >
                  <MapPin className="h-3 w-3" aria-hidden />
                  {image.pins.length > 0 ? `${image.pins.length} marked` : "Mark"}
                </button>
              </>
            )}
          </li>
        ))}
        {uploading.map((src) => (
          <li key={src} className="relative aspect-square overflow-hidden rounded-[var(--r-md)] border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview while uploading */}
            <img src={src} alt="" className="h-full w-full object-cover opacity-50" />
            <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin motion-reduce:animate-none" aria-label="Uploading" />
          </li>
        ))}
        {!readOnly && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[color:var(--border-strong)] text-[length:var(--fs-2)] font-medium hover:bg-accent",
                images.length === 0 && uploading.length === 0 && "border-foreground",
              )}
            >
              <Camera className="h-5 w-5" aria-hidden />
              Add photos
            </button>
            {/* No name: it never posts with the brief. Each file goes up on choice. */}
            <input
              ref={input}
              type="file"
              accept={ACCEPT.join(",")}
              multiple
              aria-label="Add photos"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void add(files);
              }}
            />
          </li>
        )}
      </ul>

      <Sheet open={!!marking} onOpenChange={(open) => !open && setMarking(null)}>
        {marking && (
          <SheetContent title="Mark what you mean" side="auto">
            <ReferencePinner
              orderId={orderId}
              imageId={marking.id}
              src={marking.signedUrl}
              initialPins={marking.pins}
              isPrimary={marking.isPrimary}
              readOnly={readOnly}
              onSaved={() => {
                setMarking(null);
                toast("Marks saved");
                router.refresh();
              }}
            />
            {!readOnly && !marking.isPrimary && images.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  makeMain(marking);
                  setMarking(null);
                }}
                className="mt-3 inline-flex min-h-[var(--ctl)] items-center gap-1 text-[length:var(--fs-3)] underline underline-offset-4"
              >
                <Star className="h-4 w-4" aria-hidden /> Make this the main photo
              </button>
            )}
          </SheetContent>
        )}
      </Sheet>
    </section>
  );
}
