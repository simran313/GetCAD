import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Images going into a PDF are shrunk first (summary sheet fix): a 4000 px
 * render export decoded by the PDF library took 13 s and ~1 GB and failed
 * the request in production.
 */
describe("pdfImage", () => {
  it("turns a large PNG with transparency into a 1600 px JPEG on white", async () => {
    const { pdfImage } = await import("../../lib/pdf/images");
    const big = await sharp({ create: { width: 4000, height: 2000, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer();
    const out = await pdfImage(big);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([1600, 800]);
  });

  it("leaves a small image's size alone, and returns null for bytes that are not an image", async () => {
    const { pdfImage } = await import("../../lib/pdf/images");
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ccc" } }).png().toBuffer();
    expect((await sharp((await pdfImage(small))!).metadata()).width).toBe(300);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await pdfImage(Buffer.from("not an image"))).toBeNull();
    expect(await pdfImage(null)).toBeNull();
  });
});
