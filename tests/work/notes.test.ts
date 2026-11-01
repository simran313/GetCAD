import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { noteLines } from "../../lib/work/notes";

describe("noteLines", () => {
  it("splits a numbered note into its items", () => {
    expect(noteLines("1. Halo claws to 0.8 mm  2. Blend the band seam")).toEqual(["Halo claws to 0.8 mm", "Blend the band seam"]);
  });

  it("reads a QC send-back (0059) as one item per failed line, then the note", () => {
    const body = [
      "Failed checks:",
      "- All measurements — Shank 1.0 mm at the base — Thicken to 1.2 mm",
      "- Client's special remarks — Engraving missing",
      "Please also soften the gallery.",
    ].join("\n");
    expect(noteLines(body)).toEqual([
      "All measurements — Shank 1.0 mm at the base — Thicken to 1.2 mm",
      "Client's special remarks — Engraving missing",
      "Please also soften the gallery.",
    ]);
  });
});
