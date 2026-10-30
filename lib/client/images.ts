/**
 * Pictures chosen in the browser (Phase 15). Phones hand over whatever their
 * camera makes: HEIC on an iPhone, WebP on some Androids, 12-megapixel JPEGs
 * everywhere. The conversation takes PNG and JPEG, so a photo is redrawn as a
 * JPEG no larger than 2560 px on its long side before it is sent: the format
 * is always accepted, the upload is a fraction of the size, and the location
 * and camera details the original carried are gone.
 */

const MAX_SIDE = 2560;

/** A decoded picture, from the browser's own decoder (HEIC works where the browser can show it). */
export async function decodeImage(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Some formats decode only through an <img> (HEIC in Safari).
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    // The decoded <img> keeps its pixels; the address is no longer needed.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** The size to draw a picture at: its own, or scaled so the long side is at most 2560 px. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** A canvas as a JPEG file, named for the conversation (the server names it again). */
export async function canvasToJpeg(canvas: HTMLCanvasElement, name = "photo"): Promise<File> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
  if (!blob) throw new Error("This picture could not be prepared.");
  return new File([blob], `${name}-${Date.now()}.jpg`, { type: "image/jpeg" });
}

/** Any picture the browser can show, as a JPEG ready to send. PNGs (screenshots, drawings) stay PNG unless very large. */
export async function preparePhoto(file: File): Promise<File> {
  const png = file.type === "image/png" || /\.png$/i.test(file.name);
  if (png && file.size <= 8 * 1024 * 1024) return file;
  const image = await decodeImage(file);
  const size = fitSize(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This picture could not be prepared.");
  // JPEG has no transparency: a white ground, not black, under see-through parts.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(image, 0, 0, size.width, size.height);
  return canvasToJpeg(canvas);
}

/** Whether a chosen file is a picture we should prepare, whatever its extension says. */
export function isPicture(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i.test(file.name);
}
