import { describe, expect, it } from "vitest";

import { briefStepGaps, firstIncompleteStep, type BriefStepInput } from "./briefSteps";

const complete: BriefStepInput = {
  service: "cad",
  name: "Ring · 18K yellow",
  product: "RING",
  piece: "",
  photos: 1,
  centreAnswered: true,
  hasCentre: true,
  centreShape: "OVAL",
  centreLengthMm: "8",
  centreWidthMm: "6",
  centreSetting: "AS_PER_REFERENCE",
  accents: [],
  sizeKind: "ring",
  country: "Australia",
  ringSize: "M",
  innerCircumferenceMm: "",
  innerDiameterMm: "",
  lengthMm: "",
  metal: "YELLOW",
  karat: "18K",
};

const fields = (b: Partial<BriefStepInput>) => briefStepGaps({ ...complete, ...b }).map((g) => `${g.step}:${g.field}`);

// Owner, 7 Nov 2026: no step moves forward until its required answers are in.
describe("briefStepGaps", () => {
  it("lets a complete brief through every step; notes are never required", () => {
    expect(briefStepGaps(complete)).toEqual([]);
    expect(firstIncompleteStep([])).toBe(-1);
  });

  it("step 1 needs a name, the piece (and what an Other is) and a photo", () => {
    expect(fields({ name: " ", photos: 0 })).toEqual(["0:reference_name", "0:photos"]);
    expect(fields({ product: "OTHER", piece: "" })).toEqual(["0:other_piece"]);
    expect(fields({ product: "OTHER", piece: "Cufflinks" })).toEqual([]);
  });

  it("step 2 needs the centre answer, then its shape, length and width, and setting", () => {
    expect(fields({ centreAnswered: false })).toEqual(["1:centre_choice"]);
    expect(fields({ hasCentre: false, centreShape: "", centreLengthMm: "", centreSetting: "" })).toEqual([]);
    expect(fields({ centreLengthMm: "" })).toEqual(["1:centre_length_mm"]);
    expect(fields({ centreWidthMm: "0" })).toEqual(["1:centre_length_mm"]);
    expect(fields({ centreSetting: "" })).toEqual(["1:centre_setting"]);
  });

  it("a side-stone row needs a width unless it scales to the centre stone", () => {
    const row = { shape: "AS_PER_REFERENCE", setting: "PAVE", widthMm: "", scale: false };
    expect(fields({ accents: [row] })).toEqual(["1:aw0"]);
    expect(fields({ accents: [{ ...row, scale: true }] })).toEqual([]);
    expect(fields({ accents: [{ ...row, widthMm: "1.3" }] })).toEqual([]);
    // Nothing to scale to without a centre stone.
    expect(fields({ hasCentre: false, centreShape: "", accents: [{ ...row, scale: true }] })).toEqual(["1:aw0"]);
    expect(briefStepGaps({ ...complete, accents: [row, row] }).map((g) => g.what)).toEqual([
      "Side stones 1: width, or tick Scale to centre stone",
      "Side stones 2: width, or tick Scale to centre stone",
    ]);
  });

  it("step 3 needs the country and ring size (or the inside measurement), metal and karat", () => {
    expect(fields({ country: "", ringSize: "" })).toEqual(["2:ring_system", "2:ring_size"]);
    expect(fields({ country: "", ringSize: "", innerCircumferenceMm: "53.1" })).toEqual([]);
    expect(fields({ metal: "", karat: "" })).toEqual(["2:metal", "2:karatage"]);
    expect(fields({ product: "BANGLE", sizeKind: "wrist" })).toEqual(["2:inner_diameter_mm"]);
    expect(fields({ product: "PENDANT", sizeKind: "none", ringSize: "" })).toEqual([]);
  });

  it("a render brief has no stones and no size", () => {
    expect(fields({ service: "render", centreAnswered: false, sizeKind: "ring", ringSize: "", country: "" })).toEqual([]);
  });

  it("names the first step still to finish", () => {
    expect(firstIncompleteStep(briefStepGaps({ ...complete, metal: "", photos: 0 }))).toBe(0);
    expect(firstIncompleteStep(briefStepGaps({ ...complete, metal: "" }))).toBe(2);
  });
});
