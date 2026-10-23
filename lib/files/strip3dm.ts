import type { StripResult } from "@/core";

/**
 * Clean a Rhino 3DM file of who made it, for the double-blind delivery path.
 *
 * A 3DM records the user who created and last edited it, the application
 * and its licence details, start-section comments, document notes, object
 * names, user text and plug-in data — any of which can name the designer's
 * studio to the client. Some of those (notes, plug-in data) are not even
 * reachable from the rhino3dm API, so editing the file in place could miss
 * them.
 *
 * So the file is REBUILT: a new, empty model receives only the unit system
 * and tolerances, the layers (name and colour) and each object's geometry
 * on its layer. Everything else is left behind by construction. Block
 * definitions (instance references) cannot be rebuilt faithfully here, so a
 * file containing them is refused with a message asking for them to be
 * exploded, rather than delivered broken.
 */

type Rhino = import("rhino3dm").RhinoModule;

let rhinoPromise: Promise<Rhino> | null = null;

async function rhino(): Promise<Rhino> {
  if (!rhinoPromise) {
    rhinoPromise = import("rhino3dm").then((m) => m.default());
  }
  return rhinoPromise;
}

export async function strip3dm(bytes: Uint8Array): Promise<StripResult> {
  const rh = await rhino();
  const src = rh.File3dm.fromByteArray(bytes);
  if (!src) return { ok: false, reason: "not a readable 3DM file" };

  try {
    if (src.instanceDefinitions().count > 0) {
      return { ok: false, reason: "the 3DM contains blocks — explode them in Rhino and upload again" };
    }

    const out = new rh.File3dm();
    const s = src.settings();
    const o = out.settings();
    o.modelUnitSystem = s.modelUnitSystem;
    o.modelAbsoluteTolerance = s.modelAbsoluteTolerance;
    o.modelAngleToleranceRadians = s.modelAngleToleranceRadians;
    o.modelRelativeTolerance = s.modelRelativeTolerance;

    const layers = src.layers();
    for (let i = 0; i < layers.count; i++) {
      const from = layers.get(i);
      const layer = new rh.Layer();
      layer.name = from.name;
      layer.color = from.color;
      out.layers().add(layer);
    }

    const objects = src.objects();
    let copied = 0;
    for (let i = 0; i < objects.count; i++) {
      const obj = objects.get(i);
      const geometry = obj.geometry();
      if (!geometry) continue;
      const attrs = new rh.ObjectAttributes();
      attrs.layerIndex = obj.attributes().layerIndex;
      out.objects().add(geometry, attrs);
      copied++;
    }
    if (copied === 0) return { ok: false, reason: "the 3DM has no geometry" };

    const options = new rh.File3dmWriteOptions();
    options.saveUserData = false;
    return { ok: true, bytes: out.toByteArrayOptions(options) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "could not rebuild the 3DM" };
  }
}
