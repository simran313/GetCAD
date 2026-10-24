import { describe, expect, it } from "vitest";

import { grams, gramsWord, mmWord, weightTable } from "./weights";

describe("weight sheet maths", () => {
  it("turns a volume into grams per metal", () => {
    // 250 mm³ = 0.25 cm³; × 15.6 g/cm³ = 3.90 g of 18K.
    expect(gramsWord(grams(250, 15600))).toBe("3.90 g");
    const t = weightTable(250, { "10K": 11600, "14K": 13100, "18K": 15600, Pt950: 21400, Ag925: 10400 });
    expect(t.map((r) => [r.metal, gramsWord(r.grams)])).toEqual([
      ["10K", "2.90 g"],
      ["14K", "3.27 g"],
      ["18K", "3.90 g"],
      ["Pt950", "5.35 g"],
      ["Ag925", "2.60 g"],
    ]);
  });

  it("follows the admin's densities and skips a metal with none", () => {
    expect(gramsWord(weightTable(1000, { "18K": 16000 })[0]!.grams)).toBe("16.00 g");
    expect(weightTable(1000, { "18K": null })).toEqual([]);
    expect(grams(0, 15600)).toBe(0);
  });

  it("prints micrometres as millimetres", () => {
    expect(mmWord(800)).toBe("0.80 mm");
    expect(mmWord(null)).toBe("—");
  });
});
