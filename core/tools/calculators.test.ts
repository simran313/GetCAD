import { describe, expect, it } from "vitest";

import { castWeights, caratFor, CHARTS, stoneTotals, techPanel, toSavedStones, weightWord } from "./calculators";
import { CENTRE_CHART, SIZE_CHART } from "./diamondCharts";

describe("castWeights (GOLD_WEIGHT_7.xlsx)", () => {
  it("matches the sheet for 5 g of 18K", () => {
    const rows = Object.fromEntries(castWeights(5).map((r) => [r.metal, r]));
    // 18K: 5 + 0.1 = 5.1; with post 6.1.
    expect(rows["18K"]!.cast).toBeCloseTo(5.1, 10);
    expect(rows["18K"]!.withPost).toBeCloseTo(6.1, 10);
    // Others: 5.1 / 14 × density.
    expect(rows["22K"]!.cast).toBeCloseTo((5.1 / 14) * 16, 10);
    expect(rows["14K"]!.cast).toBeCloseTo((5.1 / 14) * 12, 10);
    expect(rows["10K"]!.cast).toBeCloseTo((5.1 / 14) * 11.3, 10);
    expect(rows["9K"]!.cast).toBeCloseTo((5.1 / 14) * 11, 10);
    expect(rows["Silver"]!.cast).toBeCloseTo((5.1 / 14) * 10, 10);
    expect(rows["Platinum"]!.withPost).toBeCloseTo((6.1 / 14) * 21, 10);
    expect(Object.keys(rows)).toEqual(["22K", "18K", "14K", "10K", "9K", "Silver", "Platinum"]);
  });

  it("gives nothing for an empty, zero or negative weight", () => {
    expect(castWeights(Number.NaN)).toEqual([]);
    expect(castWeights(0)).toEqual([]);
    expect(castWeights(-2)).toEqual([]);
  });
});

describe("diamond charts", () => {
  it("carry every row of the two sheets", () => {
    expect(SIZE_CHART.map((s) => s.shape)).toEqual([
      "Round Brilliant",
      "Princess",
      "Oval",
      "Emerald",
      "Cushion",
      "Pear",
      "Marquise",
      "Radiant",
      "Asscher",
      "Heart",
    ]);
    expect(SIZE_CHART.reduce((n, s) => n + s.sizes.length, 0)).toBe(242);
    expect(CENTRE_CHART.reduce((n, s) => n + s.sizes.length, 0)).toBe(117);
    expect(caratFor("size", "Round Brilliant", "1.0")).toBe(0.005);
    expect(caratFor("size", "Round Brilliant", "12.0")).toBe(6.21);
    expect(caratFor("size", "Oval", "3 × 2")).toBe(0.06);
    expect(caratFor("centre", "Round", "6.5")).toBe(1);
    expect(caratFor("centre", "Trillion", "12.0 × 12.0")).toBe(5);
    expect(caratFor("size", "Round Brilliant", "99")).toBeNull();
    for (const chart of Object.values(CHARTS)) for (const s of chart.shapes) for (const [, ct] of s.sizes) expect(ct).toBeGreaterThan(0);
  });

  it("totals lines by shape and in grams (ct × 0.2)", () => {
    const t = stoneTotals([
      { chart: "size", shape: "Round Brilliant", size: "1.5", pcs: 20 }, // 0.3
      { chart: "size", shape: "Round Brilliant", size: "2.0", pcs: 10 }, // 0.3
      { chart: "centre", shape: "Oval", size: "8.0 × 6.0", pcs: 1 },
      { chart: "size", shape: "Pear", size: "nope", pcs: 4 }, // no such size: ignored
      { chart: "size", shape: "Princess", size: "2.0", pcs: 0 }, // no pieces
    ]);
    const oval = caratFor("centre", "Oval", "8.0 × 6.0")!;
    expect(oval).toBeGreaterThan(0);
    expect(t.pcs).toBe(31);
    expect(t.ct).toBeCloseTo(0.6 + oval, 10);
    expect(t.grams).toBeCloseTo((0.6 + oval) * 0.2, 10);
    expect(t.byShape.map((s) => [s.shape, s.pcs])).toEqual([
      ["Round Brilliant", 30],
      ["Oval", 1],
    ]);
    expect(t.lines[3]!.carat).toBeNull();
  });

  it("words weights", () => {
    expect(weightWord(5.1)).toBe("5.10");
    expect(weightWord(0.005)).toBe("0.005");
    expect(weightWord(0)).toBe("0.00");
    expect(weightWord(0.06, 3)).toBe("0.060"); // the total of 20 × 1.5 mm rounds, in grams
    expect(weightWord(0.06)).toBe("0.060");
  });
});

describe("the technical image's panel (0060)", () => {
  it("uses the saved carat per stone and the saved allowances", () => {
    const p = techPanel({
      gold18k: 5,
      castingAllowance: 0.1,
      postAllowance: 1,
      stones: [
        { chart: "size", shape: "Round Brilliant", size: "1.5", carat: 0.015, pcs: 20 },
        { chart: "centre", shape: "Oval", size: "8.0 × 6.0", carat: 1.5, pcs: 1 },
      ],
    });
    expect(p.gold.find((g) => g.metal === "18K")).toMatchObject({ cast: 5.1, withPost: 6.1 });
    expect(p.stones.map((s) => s.totalCt)).toEqual([0.3, 1.5]);
    expect(p.totals.pcs).toBe(21);
    expect(p.totals.ct).toBeCloseTo(1.8, 10);
    expect(p.totals.grams).toBeCloseTo(0.36, 10);
  });

  it("turns calculator rows into saved stones, dropping incomplete lines", () => {
    expect(
      toSavedStones([
        { chart: "size", shape: "Round Brilliant", size: "1.5", pcs: 20 },
        { chart: "size", shape: "Round Brilliant", size: "nope", pcs: 2 },
        { chart: "size", shape: "Princess", size: "2.0", pcs: 0 },
      ]),
    ).toEqual([{ chart: "size", shape: "Round Brilliant", size: "1.5", carat: 0.015, pcs: 20 }]);
  });
});
