import { describe, expect, it } from "vitest";

import { sanitizeUploadAsync } from "../../core/files/sanitizationGate";
import { strip3dm } from "../../lib/files/strip3dm";

/**
 * 3DM cleaning (Phase 3a): a Rhino file must reach the client with its
 * geometry, layers and units, and with nothing that names who made it.
 */

const SECRET = ["Nakshatra", "Dana Designer", "studio-pc", "Dana ring", "owner-dana"];

async function sample(): Promise<Uint8Array> {
  const rh = await (await import("rhino3dm")).default();
  const f = new rh.File3dm();
  f.applicationName = "Rhino 8 — Nakshatra Studio";
  f.applicationDetails = "Licensed to Dana Designer";
  f.startSectionComments = "saved on studio-pc";
  f.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  const layer = new rh.Layer();
  layer.name = "Metal";
  f.layers().add(layer);
  const attrs = new rh.ObjectAttributes();
  attrs.name = "Dana ring";
  attrs.layerIndex = 0;
  attrs.setUserString("owner", "owner-dana");
  f.objects().addSphere(new rh.Sphere([0, 0, 0], 5), attrs);
  f.objects().addSphere(new rh.Sphere([12, 0, 0], 2), attrs);
  return f.toByteArray();
}

const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("strip3dm", () => {
  it("removes every identifying string while keeping geometry, layers and units", async () => {
    const original = await sample();
    expect(SECRET.some((s) => latin1(original).includes(s))).toBe(true);

    const result = await strip3dm(original);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = latin1(result.bytes);
    for (const s of SECRET) expect(text).not.toContain(s);

    const rh = await (await import("rhino3dm")).default();
    const back = rh.File3dm.fromByteArray(result.bytes);
    expect(back.objects().count).toBe(2);
    expect(back.layers().get(0).name).toBe("Metal");
    expect(back.settings().modelUnitSystem).toBe(rh.UnitSystem.Millimeters);
  }, 60_000);

  it("refuses bytes that are not a 3DM", async () => {
    const result = await strip3dm(new TextEncoder().encode("3D Geometry File Format  not really"));
    expect(result.ok).toBe(false);
  }, 60_000);

  it("goes through the async gate: renamed, cleaned, and refused without a stripper", async () => {
    const bytes = await sample();
    const input = { filename: "Dana ring final.3dm", declaredMimeType: "model/x-3dm", sizeBytes: bytes.length, bytes };
    const gate = await sanitizeUploadAsync(input, "opaque123", { requireMetadataStrip: true, strip3dm });
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.file.objectName).toBe("opaque123.3dm");
      expect(gate.file.metadataStripped).toBe(true);
      expect(latin1(gate.file.bytes)).not.toContain("Nakshatra");
    }
    const refused = await sanitizeUploadAsync(input, "opaque123", { requireMetadataStrip: true });
    expect(refused.ok).toBe(false);
  }, 60_000);
});
