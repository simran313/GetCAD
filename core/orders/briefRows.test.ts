import { describe, expect, it } from "vitest";

import { briefName, briefRows } from "./briefRows";

const ring = {
  reference_name: "Halo",
  product: "RING",
  metal: "YELLOW",
  karatage: "18K",
  purpose: "CASTING",
  format: "BOTH",
  finish: "HIGH_POLISH",
  has_centre_stone: true,
  centre_quantity: 1,
  centre_shape: "ROUND",
  centre_length_um: 6500,
  centre_width_um: 6500,
  centre_setting: "PRONG_6",
  centre_certified: true,
  ring_size: "US 7",
  notes: null,
};

const value = (rows: ReturnType<typeof briefRows>, key: string) => rows.find((r) => r.key === key)?.value;

describe("briefName", () => {
  it("names a job from its brief until the client names it", () => {
    expect(briefName({ product: "RING", karatage: "18K", metal: "YELLOW" })).toBe("Ring · 18K yellow");
    expect(briefName({ product: "PENDANT", metal: "TWO_TONE" })).toBe("Pendant · two tone");
    expect(briefName(null)).toBe("Untitled brief");
  });
});

describe("briefRows", () => {
  it("reads a ring brief as the client chose it", () => {
    const rows = briefRows(ring, { service: "cad", photos: 2 });
    expect(value(rows, "metal")).toBe("Yellow · 18K");
    expect(value(rows, "size")).toBe("US 7");
    expect(value(rows, "photos")).toBe("2");
    expect(value(rows, "centre")).toBe("Round · 6.5 × 6.5 mm · Prong 6 · certified");
    expect(value(rows, "notes")).toBeNull();
  });

  it("leaves what is not answered as null, for an Add or a dash", () => {
    const rows = briefRows({ ...ring, ring_size: null }, { service: "cad", photos: 0 });
    expect(value(rows, "size")).toBeNull();
    expect(value(rows, "photos")).toBeNull();
  });

  it("points each row at the wizard step that edits it", () => {
    const rows = briefRows(ring, { service: "cad", photos: 1 });
    expect(rows.find((r) => r.key === "photos")).toMatchObject({ step: 0, field: "photos" });
    expect(rows.find((r) => r.key === "size")).toMatchObject({ step: 2, field: "ring_size" });
    expect(rows.find((r) => r.key === "metal")).toMatchObject({ step: 3, field: "metal" });
  });

  it("asks a render brief for views, not stones or size, and its metal is step 3 of 3", () => {
    const rows = briefRows({ ...ring, render_views: 5 }, { service: "render", photos: 1 });
    expect(rows.map((r) => r.key)).not.toContain("size");
    expect(rows.map((r) => r.key)).not.toContain("centre");
    expect(value(rows, "views")).toBe("5");
    expect(rows.find((r) => r.key === "metal")?.step).toBe(2);
  });

  it("summarises accent stones, or lists each size for the team", () => {
    const accents = [
      { quantity: 18, shape: "ROUND", width_um: 1300, setting: "PAVE" },
      { quantity: 2, shape: "PEAR", width_um: 3000, setting: "PRONG_4" },
    ];
    expect(value(briefRows(ring, { service: "cad", photos: 1, accents }), "accents")).toBe("20 in 2 sizes");
    const team = briefRows(ring, { service: "cad", photos: 1, accents, detail: true });
    expect(value(team, "accents-0")).toBe("18 × Round 1.3 mm, Pave");
    expect(value(team, "accents-1")).toBe("2 × Pear 3 mm, Prong 4");
  });
});
