import { describe, expect, it } from "vitest";

import { briefMinimumMissing, draftProgress, gradeBrief, qualitySummary, type BriefContext } from "./briefQuality";
import { mmToMicrons, type OrderSpecInput } from "./spec";

/** A brief with every required answer given and nothing left to guess. */
const PERFECT: OrderSpecInput = {
  referenceName: "Anniversary band",
  product: "RING",
  metal: "YELLOW",
  karatage: "18K",
  purpose: "CASTING",
  format: "BOTH",
  finish: "HIGH_POLISH",
  hasCentreStone: true,
  centreShape: "ROUND",
  centreSetting: "PRONG_6",
  centreQuantity: 1,
  centreLengthUm: mmToMicrons(6.5),
  centreWidthUm: mmToMicrons(6.5),
  centreDepthUm: mmToMicrons(4.0),
};

const CTX: BriefContext = { accentRowCount: 0, referenceImageCount: 2, pinnedImageCount: 1, service: "cad", size: { ringSize: "US 6.5" } };

const whats = (spec: OrderSpecInput, ctx: BriefContext = CTX) =>
  gradeBrief(spec, ctx).gaps.map((g) => g.what);

describe("gradeBrief", () => {
  it("finds nothing to complain about in a complete brief", () => {
    const q = gradeBrief(PERFECT, CTX);
    expect(q.gaps).toEqual([]);
    expect(q.score).toBe(100);
    expect(q.grade).toBe("Excellent");
    expect(qualitySummary(q)).toMatch(/without asking you a question/);
  });

  // The case this whole module exists for: valid, submittable, unbuildable.
  it("catches a carat weight standing in for a footprint", () => {
    const q = gradeBrief(
      { ...PERFECT, centreLengthUm: null, centreWidthUm: null, centreCaratMct: 1000 },
      CTX,
    );
    expect(q.blockingCount).toBe(0); // it passes validation
    expect(q.gaps.map((g) => g.what)).toContain("The stone's exact footprint");
    expect(q.grade).not.toBe("Excellent"); // and still is not ready
  });

  it("explains the consequence rather than restating the question", () => {
    const q = gradeBrief(
      { ...PERFECT, centreLengthUm: null, centreWidthUm: null, centreCaratMct: 1000 },
      CTX,
    );
    expect(q.gaps[0]!.why).toMatch(/cut to the outline, not to the weight/i);
  });

  it("treats no size at all as blocking, not merely ambiguous", () => {
    const q = gradeBrief(
      { ...PERFECT, centreLengthUm: null, centreWidthUm: null, centreCaratMct: null },
      CTX,
    );
    expect(q.blockingCount).toBeGreaterThan(0);
    expect(q.grade).toBe("Incomplete");
  });

  it("wants depth once the stone is certified", () => {
    expect(whats({ ...PERFECT, centreCertified: true, centreDepthUm: null })).toContain(
      "The certified stone's depth",
    );
    // Not certified: depth stays optional and silent.
    expect(whats({ ...PERFECT, centreDepthUm: null })).toEqual([]);
  });

  it("asks how multiple centre stones are arranged", () => {
    expect(whats({ ...PERFECT, centreQuantity: 3 })).toContain(
      "How the multiple centre stones are arranged",
    );
  });

  it("asks which parts are which metal on two-tone", () => {
    expect(whats({ ...PERFECT, metal: "TWO_TONE" })).toContain("Which parts are which metal");
    expect(whats({ ...PERFECT, metal: "TRI_COLOUR" })).toContain("Which parts are which metal");
  });

  it("asks where a mixed finish falls", () => {
    expect(whats({ ...PERFECT, finish: "MIXED" })).toContain("Which surfaces get which finish");
  });

  it("queries an alloy it does not recognise, and accepts the ones it does", () => {
    expect(whats({ ...PERFECT, karatage: "shiny gold" })).toContain(
      "What alloy this actually is",
    );
    for (const ok of ["18K", "14k", "750", "PT950", "925"]) {
      expect(whats({ ...PERFECT, karatage: ok })).toEqual([]);
    }
  });

  it("asks what an OTHER product actually is", () => {
    expect(whats({ ...PERFECT, product: "OTHER" })).toContain("What the piece actually is");
  });

  it("says nothing about the head when there is no centre stone", () => {
    expect(
      whats({
        ...PERFECT,
        hasCentreStone: false,
        centreShape: null,
        centreSetting: null,
        centreQuantity: 0,
        centreLengthUm: null,
        centreWidthUm: null,
        centreDepthUm: null,
      }),
    ).toEqual([]);
  });
});

describe("references", () => {
  // The bug this rule fixes: the meter said "Excellent" with no photo while
  // review refused to send. A photo is required (DECISIONS §11), not optional.
  it("requires a photo, and never calls a brief without one good", () => {
    const q = gradeBrief(PERFECT, { ...CTX, referenceImageCount: 0, pinnedImageCount: 0 });
    expect(q.gaps.map((g) => g.what)).toContain("A reference photo");
    expect(q.blockingCount).toBe(1);
    expect(q.grade).toBe("Incomplete");
  });

  // The design's own observation, and the reason pinning gets its own step.
  it("asks for a pin when there are pictures but nothing marked", () => {
    const q = gradeBrief(PERFECT, { ...CTX, referenceImageCount: 3, pinnedImageCount: 0 });
    expect(q.gaps.map((g) => g.what)).toContain("Which part of the picture you mean");
    expect(q.gaps[0]!.why).toMatch(/copies the wrong element/i);
  });

  it("is satisfied by one pinned picture", () => {
    expect(
      whats(PERFECT, { ...CTX, referenceImageCount: 1, pinnedImageCount: 1 }),
    ).toEqual([]);
  });
});

describe("grading", () => {
  // Calling a brief "Good" because only one required answer is missing tells
  // someone it is nearly ready when it cannot be sent at all.
  it("is Incomplete while anything blocking remains, whatever the score", () => {
    const q = gradeBrief({ ...PERFECT, centreShape: null }, CTX);
    expect(q.grade).toBe("Incomplete");
    expect(qualitySummary(q)).toMatch(/required answer/);
  });

  it("degrades as ambiguities accumulate", () => {
    const one = gradeBrief({ ...PERFECT, metal: "TWO_TONE" }, CTX);
    const three = gradeBrief(
      { ...PERFECT, metal: "TWO_TONE", finish: "MIXED", centreQuantity: 3 },
      CTX,
    );
    expect(one.score).toBeGreaterThan(three.score);
    expect(one.grade).toBe("Good");
    expect(three.grade).toBe("Workable");
  });

  it("never goes below zero however bad the brief", () => {
    const q = gradeBrief(
      {
        referenceName: "",
        product: "OTHER",
        metal: "TWO_TONE",
        karatage: "??",
        purpose: "",
        format: "",
        finish: "MIXED",
        hasCentreStone: true,
        centreQuantity: 4,
        basedOnOrderId: "ord_1",
      },
      { ...CTX, referenceImageCount: 0, pinnedImageCount: 0 },
    );
    expect(q.score).toBe(0);
    expect(q.grade).toBe("Incomplete");
  });

  it("counts the gaps in its summary", () => {
    const q = gradeBrief({ ...PERFECT, metal: "TWO_TONE" }, CTX);
    expect(qualitySummary(q)).toMatch(/1 thing a designer would have to guess/);
  });
});

describe("the minimum to send matches review (brief_missing)", () => {
  const size = (v: BriefContext["size"]) => ({ ...CTX, size: v });

  it("needs a size for rings and bands: a ring size or an inside measurement", () => {
    expect(briefMinimumMissing("RING", size({}))).toEqual(["size"]);
    expect(briefMinimumMissing("BAND", size({ ringSize: "  " }))).toEqual(["size"]);
    expect(briefMinimumMissing("RING", size({ innerCircumferenceUm: 53_100 }))).toEqual([]);
    expect(briefMinimumMissing("RING", size({ innerDiameterUm: 16_900 }))).toEqual([]);
  });

  it("needs a size for bangles and bracelets: diameter, circumference or length", () => {
    expect(briefMinimumMissing("BANGLE", size({ ringSize: "US 7" }))).toEqual(["size"]);
    expect(briefMinimumMissing("BRACELET", size({ lengthUm: 180_000 }))).toEqual([]);
  });

  it("asks no size for other pieces, or for renders", () => {
    expect(briefMinimumMissing("PENDANT", size({}))).toEqual([]);
    expect(briefMinimumMissing("NECKLACE", size({}))).toEqual([]);
    expect(briefMinimumMissing("RING", { ...size({}), service: "render" })).toEqual([]);
  });

  it("makes a missing size block the brief in the meter too", () => {
    const q = gradeBrief(PERFECT, size({}));
    expect(q.gaps.map((g) => g.field)).toContain("size");
    expect(q.grade).toBe("Incomplete");
  });
});

describe("draftProgress (draft rows)", () => {
  const size = { ringSize: null };
  it("counts the step a draft is stuck on", () => {
    expect(draftProgress(null, { referenceImageCount: 0, service: "cad", size })).toBe("Step 1 of 4");
    expect(draftProgress("RING", { referenceImageCount: 0, service: "cad", size })).toBe("Step 1 of 4");
    expect(draftProgress("RING", { referenceImageCount: 1, service: "cad", size })).toBe("Step 3 of 4");
    expect(draftProgress("RING", { referenceImageCount: 1, service: "cad", size: { ringSize: "US 7" } })).toBe("Ready to send");
  });
  it("gives renders three steps and no size", () => {
    expect(draftProgress(null, { referenceImageCount: 0, service: "render", size })).toBe("Step 1 of 3");
    expect(draftProgress("RING", { referenceImageCount: 1, service: "render", size })).toBe("Ready to send");
  });
});
