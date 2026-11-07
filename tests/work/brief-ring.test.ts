import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { briefLines } from "@/lib/work/brief";

// Owner, 7 Nov 2026: the designer and the pod lead see the inside of the ring
// clearly, from the size chart or as the client measured it.
describe("the designer's brief: ring size and inside", () => {
  const find = (lines: { label: string; value: string }[], label: string) => lines.find((l) => l.label === label)?.value;

  it("adds the chart's inside diameter and circumference to the size", () => {
    const lines = briefLines({ product: "RING", ring_size: "UK N" });
    expect(find(lines, "Ring size")).toBe("UK N");
    expect(find(lines, "Inside")).toBe("Ø 17.3 mm inside · 54.2 mm around (size chart)");
    expect(find(lines, "Inner diameter")).toBeUndefined();
  });

  it("uses the client's measurement and shows the chart beside it when they differ", () => {
    const lines = briefLines({ product: "RING", ring_size: "UK N", inner_diameter_um: 17500 });
    expect(find(lines, "Inside")).toBe("Ø 17.5 mm inside · 55.0 mm around (client's measurement; the chart gives Ø 17.3 mm for UK N)");
  });

  it("leaves a bangle's inner diameter as it was", () => {
    expect(find(briefLines({ product: "BANGLE", inner_diameter_um: 62000 }), "Inner diameter")).toBe("62 mm");
  });
});
