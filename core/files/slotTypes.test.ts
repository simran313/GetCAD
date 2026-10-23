import { describe, expect, it } from "vitest";

import { slotAccept, slotContentType } from "./slotTypes";

describe("slot content types", () => {
  it("decides CAD types by slot, whatever the browser says", () => {
    expect(slotContentType("3DM", "")).toEqual({ ok: true, contentType: "model/x-3dm" });
    expect(slotContentType("3DM", "application/octet-stream")).toEqual({ ok: true, contentType: "model/x-3dm" });
    expect(slotContentType("STL", "application/vnd.ms-pki.stl")).toEqual({ ok: true, contentType: "model/stl" });
  });

  it("image slots take PNG or JPEG only — never PDF", () => {
    expect(slotContentType("TV", "image/png")).toEqual({ ok: true, contentType: "image/png" });
    expect(slotContentType("GW", "image/jpeg")).toEqual({ ok: true, contentType: "image/jpeg" });
    expect(slotContentType("DD", "application/pdf").ok).toBe(false);
  });

  it("offers the right picker filter", () => {
    expect(slotAccept("3DM")).toBe(".3dm");
    expect(slotAccept("STL")).toBe(".stl");
    expect(slotAccept("PV")).toBe(".png,.jpg,.jpeg");
  });
});
