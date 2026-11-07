import { describe, expect, it } from "vitest";

import { accentLine, stoneWord } from "./accents";

describe("accentLine", () => {
  it("reads a row with a count and a width as before", () => {
    expect(accentLine({ quantity: 18, shape: "ROUND", width_um: 1300, setting: "PAVE" })).toBe("18 × Round 1.3 mm · Pave");
  });

  it("reads a row scaled to the centre stone, with no count (0064)", () => {
    expect(accentLine({ quantity: null, shape: "OVAL", width_um: null, setting: "AS_PER_REFERENCE" })).toBe(
      "Oval, scaled to the centre stone · As per reference image",
    );
    expect(accentLine({ shape: "AS_PER_REFERENCE", width_um: 1100, setting: "CHANNEL" })).toBe("As per reference image 1.1 mm · Channel");
  });

  it("names the reference option in full", () => {
    expect(stoneWord("AS_PER_REFERENCE")).toBe("As per reference image");
    expect(stoneWord("PRONG_4")).toBe("Prong 4");
    expect(stoneWord(null)).toBe("");
  });
});
