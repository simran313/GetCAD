import { describe, expect, it } from "vitest";

import { attachmentContentType, slotAccept, slotContentType } from "./slotTypes";

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

describe("attachmentContentType (Phase 4b)", () => {
  it("decides CAD types by extension, whatever the browser says", () => {
    expect(attachmentContentType("ring.3DM", "")).toBe("model/x-3dm");
    expect(attachmentContentType("ring.stl", "application/octet-stream")).toBe("model/stl");
    expect(attachmentContentType("part.stp", "")).toBe("model/step");
    expect(attachmentContentType("brief.pdf", "application/pdf")).toBe("application/pdf");
  });

  it("falls back to the browser's type for anything else", () => {
    expect(attachmentContentType("notes.txt", "text/plain")).toBe("text/plain");
    expect(attachmentContentType("noextension", "image/png")).toBe("image/png");
  });
});
