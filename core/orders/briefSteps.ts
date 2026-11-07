/**
 * What each step of the brief still needs before the client may move on
 * (owner, 7 Nov 2026: "don't move forward without filling required fields").
 *
 *   1. The piece: a name, what it is (and, for "Other", what), a photo.
 *   2. Stones: whether there is a centre stone; if so its shape, length and
 *      width, and setting. Each side-stone row: a shape, a setting, and a
 *      width unless "Scale to centre stone" is ticked. Side stones themselves
 *      are optional, and nobody is asked how many.
 *   3. Size & metal: the country and ring size (or the inside measurement),
 *      the metal and the karat. Notes are optional.
 *
 * A render brief has no stones step and no size.
 *
 * Framework-free, so the wizard, its step tabs and its desk-width Review
 * button all apply the same rule, and it is tested on its own.
 */

export interface BriefStepAccent {
  shape: string;
  setting: string;
  widthMm: string;
  /** "Scale to centre stone": the width may be left to the designer. */
  scale: boolean;
}

export interface BriefStepInput {
  service: string;
  name: string;
  product: string;
  /** What an "Other" piece is. */
  piece: string;
  photos: number;
  centreAnswered: boolean;
  hasCentre: boolean;
  centreShape: string;
  centreLengthMm: string;
  centreWidthMm: string;
  centreSetting: string;
  accents: BriefStepAccent[];
  /** ring, wrist, length or none (sizeKind). */
  sizeKind: string;
  country: string;
  ringSize: string;
  innerCircumferenceMm: string;
  innerDiameterMm: string;
  lengthMm: string;
  metal: string;
  karat: string;
}

export interface StepGap {
  /** 0, 1 or 2: the step that fixes it. */
  step: number;
  /** The field's element id, to scroll to. */
  field: string;
  /** In the client's words. */
  what: string;
}

const filled = (v: string) => v.trim().length > 0;
const positive = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n > 0;
};

export function briefStepGaps(b: BriefStepInput): StepGap[] {
  const gaps: StepGap[] = [];
  const gap = (step: number, field: string, what: string) => gaps.push({ step, field, what });

  // 1. The piece.
  if (!filled(b.name)) gap(0, "reference_name", "A name for this job");
  if (!filled(b.product)) gap(0, "product", "What we are modelling");
  if (b.product === "OTHER" && !filled(b.piece)) gap(0, "other_piece", "What the piece is");
  if (b.photos === 0) gap(0, "photos", "A photo");

  // 2. Stones (not on a render brief).
  if (b.service !== "render") {
    if (!b.centreAnswered) {
      gap(1, "centre_choice", "Whether there is a centre stone");
    } else if (b.hasCentre) {
      if (!filled(b.centreShape)) gap(1, "centre_choice", "The centre stone's shape");
      if (!positive(b.centreLengthMm) || !positive(b.centreWidthMm)) gap(1, "centre_length_mm", "The centre stone's length and width");
      if (!filled(b.centreSetting)) gap(1, "centre_setting", "The centre stone's setting");
    }
    b.accents.forEach((a, i) => {
      const row = b.accents.length > 1 ? `Side stones ${i + 1}: ` : "Side stones: ";
      if (!filled(a.shape)) gap(1, `as${i}`, `${row}shape`);
      if (!filled(a.setting)) gap(1, `ast${i}`, `${row}setting`);
      // Scaling needs a centre stone to scale to.
      if (!positive(a.widthMm) && !(a.scale && b.hasCentre)) {
        gap(1, `aw${i}`, b.hasCentre ? `${row}width, or tick Scale to centre stone` : `${row}width`);
      }
    });
  }

  // 3. Size & metal.
  const last = 2;
  if (b.service !== "render") {
    if (b.sizeKind === "ring") {
      if (!positive(b.innerCircumferenceMm)) {
        if (!filled(b.country)) gap(last, "ring_system", "Your country");
        if (!filled(b.ringSize)) gap(last, "ring_size", "The ring size");
      }
    } else if (b.sizeKind === "wrist") {
      if (!positive(b.innerDiameterMm) && !positive(b.lengthMm)) gap(last, "inner_diameter_mm", "The inside diameter or the length");
    } else if (b.sizeKind === "length") {
      if (!positive(b.lengthMm)) gap(last, "length_mm", "The length");
    }
  }
  if (!filled(b.metal)) gap(last, "metal", "The metal");
  if (!filled(b.karat)) gap(last, "karatage", "The karat");

  return gaps;
}

/** The first step that still needs something, or -1 when every step is complete. */
export function firstIncompleteStep(gaps: StepGap[]): number {
  return gaps.length ? Math.min(...gaps.map((g) => g.step)) : -1;
}
