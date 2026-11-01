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
 * on its layer. Everything else is left behind by construction.
 *
 * Blocks (instance references: stones, heads, prongs placed many times) are
 * EXPLODED on the way: each placement becomes a copy of the block's geometry
 * moved into place, nested blocks included. The block's name and definition
 * table are not carried over, so nothing named inside a block can leak
 * either. (Before, any file with a block was refused, and most jewelry
 * files have them.)
 */

/** A block nested deeper than this is a loop, not a design. */
const MAX_BLOCK_DEPTH = 16;

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

    let copied = 0;
    const put = (geometry: import("rhino3dm").GeometryBase, layerIndex: number) => {
      const attrs = new rh.ObjectAttributes();
      attrs.layerIndex = layerIndex;
      out.objects().add(geometry, attrs);
      copied++;
    };

    // A block placement: copy each member of its definition, moved by the
    // placement (and by every enclosing placement, for nested blocks).
    const explode = (ref: import("rhino3dm").InstanceReference, xform: import("rhino3dm").Transform, depth: number) => {
      if (depth > MAX_BLOCK_DEPTH) throw new Error("the 3DM has blocks nested too deeply to read");
      const def = src.instanceDefinitions().findId(ref.parentIdefId);
      if (!def) return; // a placement of a missing block: nothing to draw
      for (const id of def.getObjectIds() as string[]) {
        const member = src.objects().findId(id);
        const g = member?.geometry();
        if (!member || !g) continue;
        if (g instanceof rh.InstanceReference) {
          explode(g, rh.Transform.multiply(xform, g.xform), depth + 1);
          continue;
        }
        const copy = g.duplicate();
        copy.transform(xform);
        put(copy, member.attributes().layerIndex);
      }
    };

    const objects = src.objects();
    for (let i = 0; i < objects.count; i++) {
      const obj = objects.get(i);
      const attributes = obj.attributes();
      // A block's own members are drawn through its placements, not here.
      if (attributes.isInstanceDefinitionObject) continue;
      const geometry = obj.geometry();
      if (!geometry) continue;
      if (geometry instanceof rh.InstanceReference) {
        explode(geometry, geometry.xform, 1);
        continue;
      }
      put(geometry, attributes.layerIndex);
    }
    if (copied === 0) return { ok: false, reason: "the 3DM has no geometry" };

    const options = new rh.File3dmWriteOptions();
    options.saveUserData = false;
    return { ok: true, bytes: out.toByteArrayOptions(options) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "could not rebuild the 3DM" };
  }
}
