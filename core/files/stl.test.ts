import { describe, expect, it } from "vitest";

import { isStl, stripStl } from "./metadataStripper";
import { sanitizeUpload } from "./sanitizationGate";

/** STL acceptance and cleaning (Phase 3a, Spec §9 "fix the upload check"). */

function binaryStl(header: string, triangles: number, attr = 0x1234): Uint8Array {
  const out = new Uint8Array(84 + triangles * 50);
  out.set(new TextEncoder().encode(header.slice(0, 80)), 0);
  const view = new DataView(out.buffer);
  view.setUint32(80, triangles, true);
  for (let i = 0; i < triangles; i++) {
    const base = 84 + i * 50;
    for (let f = 0; f < 12; f++) view.setFloat32(base + f * 4, i + f / 10, true);
    view.setUint16(base + 48, attr, true);
  }
  return out;
}

const ASCII = `solid Nakshatra_Studio_ring_final
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid Nakshatra_Studio_ring_final
`;

describe("STL", () => {
  it("recognises binary (even when the header starts with 'solid') and ASCII STL", () => {
    expect(isStl(binaryStl("solid exported by Rhino 8", 3))).toBe(true);
    expect(isStl(new TextEncoder().encode(ASCII))).toBe(true);
    expect(isStl(new TextEncoder().encode("hello world"))).toBe(false);
    expect(isStl(binaryStl("x", 3).subarray(0, 120))).toBe(false); // wrong length
  });

  it("binary: replaces the header, zeroes attributes, keeps every triangle", () => {
    const original = binaryStl("Rhino 8 - Nakshatra Studio - C:/Users/dana", 4);
    const r = stripStl(original);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const header = new TextDecoder().decode(r.bytes.subarray(0, 80));
    expect(header).not.toContain("Nakshatra");
    expect(header.trim()).toBe("binary STL");
    for (let i = 0; i < 4; i++) {
      const base = 84 + i * 50;
      expect(Array.from(r.bytes.subarray(base, base + 48))).toEqual(Array.from(original.subarray(base, base + 48)));
      expect(r.bytes[base + 48]).toBe(0);
      expect(r.bytes[base + 49]).toBe(0);
    }
  });

  it("ASCII: renames the solid and keeps only geometry lines", () => {
    const r = stripStl(new TextEncoder().encode(ASCII));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = new TextDecoder().decode(r.bytes);
    expect(text).not.toContain("Nakshatra");
    expect(text.startsWith("solid model\n")).toBe(true);
    expect(text).toContain("vertex 1 0 0");
    expect(text.trim().endsWith("endsolid model")).toBe(true);
  });

  it("the delivery gate accepts STL, renames it and strips it", () => {
    const bytes = binaryStl("Nakshatra", 2);
    const gate = sanitizeUpload(
      { filename: "Nakshatra ring.stl", declaredMimeType: "model/stl", sizeBytes: bytes.length, bytes },
      "opaque9",
      { requireMetadataStrip: true },
    );
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.file.objectName).toBe("opaque9.stl");
      expect(gate.file.metadataStripped).toBe(true);
    }
  });

  it("the synchronous gate refuses a 3DM it cannot clean, rather than passing it through", () => {
    const bytes = new TextEncoder().encode("3D Geometry File Format        whatever");
    const gate = sanitizeUpload(
      { filename: "a.3dm", declaredMimeType: "model/x-3dm", sizeBytes: bytes.length, bytes },
      "o",
      { requireMetadataStrip: true },
    );
    expect(gate.ok).toBe(false);
  });
});
