import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { joinTechSheet, panelHeight, SHEET_WIDTH } from "../../lib/files/techSheet";

/**
 * Phase 13f: the technical image with the weights joined under it, drawn by
 * next/og and stacked by sharp — at one width, same format out as in.
 */
const weights = {
  gold18k: 5,
  castingAllowance: 0.1,
  postAllowance: 1,
  stones: [
    { chart: "size" as const, shape: "Round Brilliant", size: "1.5", carat: 0.015, pcs: 20 },
    { chart: "centre" as const, shape: "Oval", size: "8.0 × 6.0", carat: 1.5, pcs: 1 },
  ],
};

async function image(format: "png" | "jpeg", width: number, height: number) {
  const s = sharp({ create: { width, height, channels: 3, background: "#3366AA" } });
  return new Uint8Array(await (format === "png" ? s.png() : s.jpeg()).toBuffer());
}

describe("joinTechSheet", () => {
  it("scales the image to the sheet width and adds the panel below (PNG stays PNG)", async () => {
    const out = await joinTechSheet(await image("png", 800, 600), weights);
    expect(out.contentType).toBe("image/png");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(SHEET_WIDTH);
    expect(meta.height).toBe(1200 + panelHeight(weights));
    // The image is on top (blue), the panel underneath is white with dark text.
    const { data, info } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
    expect(px(10, 10)).toEqual([0x33, 0x66, 0xaa]);
    expect(px(SHEET_WIDTH - 5, meta.height! - 5)).toEqual([255, 255, 255]);
    let dark = 0;
    for (let y = 1200; y < meta.height!; y += 2) for (let x = 0; x < SHEET_WIDTH; x += 2) if (px(x, y)[0]! < 80) dark++;
    expect(dark).toBeGreaterThan(500); // the tables' text and rules
  }, 30_000);

  it("keeps a JPEG a JPEG, and grows the panel with the stone lines", async () => {
    const out = await joinTechSheet(await image("jpeg", 3200, 1600), { ...weights, stones: [] });
    expect(out.contentType).toBe("image/jpeg");
    expect((await sharp(out.bytes).metadata()).width).toBe(SHEET_WIDTH);
    const many = { ...weights, stones: Array.from({ length: 30 }, () => weights.stones[0]!) };
    expect(panelHeight(many)).toBeGreaterThan(panelHeight(weights));
  }, 30_000);
});
