import { deflateSync } from "node:zlib";

/**
 * Real files for the upload slots, made in memory: the upload gate checks
 * the bytes, so placeholders would be refused (as they should be).
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A small solid-colour PNG. */
export function png(rgb: [number, number, number] = [180, 150, 90], size = 16): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A binary STL: a closed tetrahedron, 4 facets. */
export function stl(): Buffer {
  const v: [number, number, number][] = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 10],
  ];
  const faces = [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ];
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.write("e2e tetrahedron", 0, "ascii");
  buf.writeUInt32LE(faces.length, 80);
  faces.forEach((f, i) => {
    const o = 84 + i * 50;
    f.forEach((vi, j) => v[vi]!.forEach((c, k) => buf.writeFloatLE(c, o + 12 + j * 12 + k * 4)));
  });
  return buf;
}

/** A Rhino 3DM with one sphere, in millimetres. */
export async function threeDm(): Promise<Buffer> {
  const rh = await (await import("rhino3dm")).default();
  const f = new rh.File3dm();
  f.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  f.objects().addSphere(new rh.Sphere([0, 0, 0], 5), new rh.ObjectAttributes());
  return Buffer.from(f.toByteArray());
}

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** What goes in each of the ten required slots. */
export async function slotFile(code: string): Promise<UploadFile> {
  if (code === "3DM") return { name: "ring.3dm", mimeType: "application/octet-stream", buffer: await threeDm() };
  if (code === "STL") return { name: "ring.stl", mimeType: "model/stl", buffer: stl() };
  return { name: `${code.toLowerCase()}.png`, mimeType: "image/png", buffer: png() };
}
