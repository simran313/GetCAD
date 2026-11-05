import { describe, expect, it } from "vitest";

import { formatRingSize, parseRingSize, RING_SIZE_SYSTEMS, ringSystem } from "./ringSizes";

describe("ring sizes by country", () => {
  it("lists each system's sizes", () => {
    expect(ringSystem("US").sizes.slice(0, 3)).toEqual(["3", "3.5", "4"]);
    expect(ringSystem("US").sizes).toContain("13.5");
    expect(ringSystem("UK").sizes.slice(0, 4)).toEqual(["A", "A½", "B", "B½"]);
    expect(RING_SIZE_SYSTEMS.map((s) => s.code)).toEqual(["US", "UK", "IN", "EU", "JP"]);
  });

  it("stores the system with the size, and reads it back", () => {
    expect(formatRingSize("US", "6.5")).toBe("US 6.5");
    expect(formatRingSize("UK", "L½")).toBe("UK L½");
    expect(formatRingSize("US", "")).toBe("");
    expect(parseRingSize("US 6.5")).toEqual({ code: "US", size: "6.5", other: null });
    expect(parseRingSize("uk l½")).toEqual({ code: "UK", size: "L½", other: null });
    expect(parseRingSize("EU 52")).toEqual({ code: "EU", size: "52", other: null });
  });

  it("reads a bare US size, and keeps anything else as typed", () => {
    expect(parseRingSize("7")).toEqual({ code: "US", size: "7", other: null });
    expect(parseRingSize("size 7 and a half")).toEqual({ code: "US", size: "", other: "size 7 and a half" });
    expect(parseRingSize("")).toEqual({ code: "US", size: "", other: null });
  });
});
