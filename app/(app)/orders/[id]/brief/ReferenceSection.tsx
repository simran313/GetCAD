import type { Pin } from "@/core";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/file-picker";

import { ReferencePinner } from "./ReferencePinner";
import {
  addReferenceImageAction,
  removeReferenceImageAction,
  setPrimaryReferenceAction,
} from "./referenceActions";

export interface ReferenceImage {
  id: string;
  signedUrl: string;
  isPrimary: boolean;
  pins: Pin[];
}

/**
 * The references step.
 *
 * A sibling of the brief form rather than a step inside it. Uploads need their
 * own round trip — a file cannot be carried in the wizard's stepped state — and
 * nesting a form inside a form is invalid HTML that browsers resolve by
 * silently dropping one of them.
 */
export function ReferenceSection({
  orderId,
  images,
  readOnly = false,
}: {
  orderId: string;
  images: ReferenceImage[];
  readOnly?: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[var(--ls-5)]">Photos</h2>

      {images.length === 0 ? (
        <div className="mt-4 rounded-[var(--r-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-[length:var(--fs-4)] font-medium">No photos yet</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {images.map((image) => (
            <div key={image.id}>
              <ReferencePinner
                orderId={orderId}
                imageId={image.id}
                src={image.signedUrl}
                initialPins={image.pins}
                isPrimary={image.isPrimary}
                readOnly={readOnly}
              />

              {!readOnly ? (
                <div className="mt-2 flex gap-2">
                  {!image.isPrimary ? (
                    <form action={setPrimaryReferenceAction} className="flex-1">
                      <input type="hidden" name="order_id" value={orderId} />
                      <input type="hidden" name="image_id" value={image.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        className="min-h-[var(--ctl)] w-full text-[length:var(--fs-3)]"
                      >
                        Make this the main sketch
                      </Button>
                    </form>
                  ) : null}
                  <form action={removeReferenceImageAction} className="flex-1">
                    <input type="hidden" name="order_id" value={orderId} />
                    <input type="hidden" name="image_id" value={image.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      className="min-h-[var(--ctl)] w-full text-[length:var(--fs-3)]"
                    >
                      Remove picture
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!readOnly ? (
        <form action={addReferenceImageAction} className="mt-4">
          <input type="hidden" name="order_id" value={orderId} />
          {/* `capture` is deliberately absent: offering the camera directly is
              right for a document scanner and wrong here, where most
              references are screenshots and saved photos rather than
              something in front of you. The picker offers the camera anyway. */}
          <FilePicker name="image" label="Add a picture" accept="image/jpeg,image/png,image/webp" buttonLabel="Choose a picture" />
          <Button type="submit" variant="secondary" className="mt-3 min-h-[var(--ctl)] w-full">
            Add picture
          </Button>
          <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">
            JPEG, PNG or WebP. Location, camera and owner details are stripped from every picture
            before it is stored — the designer sees the image, never where it was taken.
          </p>
        </form>
      ) : null}
    </section>
  );
}
