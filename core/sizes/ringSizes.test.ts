import { describe, expect, it } from "vitest";

import { countryForSystem, formatRingSize, MAIN_RING_COUNTRIES, parseRingSize, RING_COUNTRIES, RING_SIZE_SYSTEMS, ringCountry, ringSystem } from "./ringSizes";

describe("ring sizes by country", () => {
  it("lists each system's sizes", () => {
    expect(ringSystem("US").sizes.slice(0, 3)).toEqual(["3", "3.5", "4"]);
    expect(ringSystem("US").sizes).toContain("13.5");
    expect(ringSystem("UK").sizes.slice(0, 4)).toEqual(["A", "A½", "B", "B½"]);
    expect(RING_SIZE_SYSTEMS.map((s) => s.code)).toEqual(["US", "UK", "IN", "EU", "IT", "JP"]);
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

// Owner, 7 Nov 2026: most countries, each on its jewellers' own system.
describe("ring countries", () => {
  it("lists the main jewellery markets first, then the rest A–Z, each once", () => {
    const names = RING_COUNTRIES.map((c) => c.name);
    expect(names.slice(0, 4)).toEqual(["United States", "Canada", "United Kingdom", "Australia"]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(40);
    const rest = names.slice(MAIN_RING_COUNTRIES.length);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it("puts each country on a size system that exists", () => {
    expect(ringCountry("Australia")?.system).toBe("UK");
    expect(ringCountry("Germany")?.system).toBe("EU");
    expect(ringCountry("Italy")?.system).toBe("IT");
    for (const c of RING_COUNTRIES) expect(ringSystem(c.system).code).toBe(c.system);
  });

  it("reads an Italian size back, and names a country for a system", () => {
    expect(parseRingSize("IT 12")).toEqual({ code: "IT", size: "12", other: null });
    expect(countryForSystem("EU")).toBe("Germany");
    expect(countryForSystem("UK")).toBe("United Kingdom");
  });
});
