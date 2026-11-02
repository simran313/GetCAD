import sharp from "sharp";

/**
 * Demo files for the marketing screenshots: a halo engagement ring as an
 * STL the 3D view can draw, and pictures that read as a reference photo, a
 * render, a technical drawing and a placeholder logo. Made here, in code, so
 * nothing private or licensed goes into the screenshots.
 */

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class Mesh {
  tris: [V, V, V][] = [];
  /** One triangle, wound so its normal points away from `inside`. */
  tri(a: V, b: V, c: V, inside: V) {
    const n = cross(sub(b, a), sub(c, a));
    const mid: V = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    this.tris.push(dot(n, sub(mid, inside)) >= 0 ? [a, b, c] : [a, c, b]);
  }
  quad(a: V, b: V, c: V, d: V, inside: V) {
    this.tri(a, b, c, inside);
    this.tri(a, c, d, inside);
  }
  stl(): Buffer {
    const buf = Buffer.alloc(84 + this.tris.length * 50);
    buf.write("halo engagement ring", 0, "ascii");
    buf.writeUInt32LE(this.tris.length, 80);
    this.tris.forEach((t, i) => {
      const o = 84 + i * 50;
      const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      const len = Math.hypot(...n) || 1;
      n.forEach((c, k) => buf.writeFloatLE(c / len, o + k * 4));
      t.forEach((v, j) => v.forEach((c, k) => buf.writeFloatLE(c, o + 12 + j * 12 + k * 4)));
    });
    return buf;
  }
}

/** A torus. `frame(u)` gives the tube centre and its two cross-section axes. */
function tube(m: Mesh, nu: number, nv: number, frame: (u: number) => { c: V; e1: V; e2: V; r1: number; r2: number }) {
  const at = (i: number, j: number): [V, V] => {
    const f = frame((i % nu) / nu * Math.PI * 2);
    const v = (j % nv) / nv * Math.PI * 2;
    const p: V = [0, 1, 2].map((k) => f.c[k]! + f.e1[k]! * f.r1 * Math.cos(v) + f.e2[k]! * f.r2 * Math.sin(v)) as V;
    return [p, f.c];
  };
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const [a, ca] = at(i, j);
      const [b] = at(i + 1, j);
      const [c] = at(i + 1, j + 1);
      const [d] = at(i, j + 1);
      m.quad(a, b, c, d, ca);
    }
}

/** A solid of revolution about a vertical line through (x, z): profile is [radius, y] from bottom to top. */
function lathe(m: Mesh, x: number, z: number, profile: [number, number][], seg: number, inside: V) {
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2;
    const a1 = ((s + 1) / seg) * Math.PI * 2;
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k]!;
      const [r1, y1] = profile[k + 1]!;
      const p = (r: number, y: number, a: number): V => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
      if (r0 === 0) m.tri(p(0, y0, 0), p(r1, y1, a0), p(r1, y1, a1), inside);
      else if (r1 === 0) m.tri(p(r0, y0, a0), p(r0, y0, a1), p(0, y1, 0), inside);
      else m.quad(p(r0, y0, a0), p(r0, y0, a1), p(r1, y1, a1), p(r1, y1, a0), inside);
    }
  }
}

/** US 6.5 halo engagement ring, millimetres: band, halo frame, 16 halo stones, a 6.5 mm centre, four prongs. */
export function ringStl(): Buffer {
  const m = new Mesh();
  // Band: finger axis along z, 16.9 mm inside, 2.0 mm wide, 1.7 mm thick.
  const R = 8.45 + 0.85;
  tube(m, 160, 24, (u) => ({ c: [R * Math.cos(u), R * Math.sin(u), 0], e1: [Math.cos(u), Math.sin(u), 0], e2: [0, 0, 1], r1: 0.85, r2: 1.0 }));
  const top = R + 0.85;
  // Basket under the centre stone.
  lathe(m, 0, 0, [[0, top - 0.4], [1.9, top - 0.4], [2.3, top + 1.6], [0, top + 1.6]], 32, [0, top + 0.6, 0]);
  // Halo frame: a ring of metal around the centre, facing up (+y).
  const hy = top + 1.9;
  tube(m, 96, 14, (u) => ({ c: [4.35 * Math.cos(u), hy, 4.35 * Math.sin(u)], e1: [Math.cos(u), 0, Math.sin(u)], e2: [0, 1, 0], r1: 0.75, r2: 0.55 }));
  // Halo stones: 16 small brilliants on the frame.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = 4.35 * Math.cos(a);
    const z = 4.35 * Math.sin(a);
    const y = hy + 0.45;
    lathe(m, x, z, [[0, y - 0.5], [0.65, y], [0.4, y + 0.3], [0, y + 0.3]], 12, [x, y, z]);
  }
  // Centre stone: 6.5 mm round brilliant, pavilion, girdle, crown, table.
  const g = hy + 1.0;
  lathe(m, 0, 0, [[0, g - 2.8], [3.25, g], [3.25, g + 0.1], [1.85, g + 1.0], [0, g + 1.0]], 32, [0, g, 0]);
  // Four prongs.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = 3.15 * Math.cos(a);
    const z = 3.15 * Math.sin(a);
    lathe(m, x, z, [[0, top], [0.38, top], [0.38, g + 0.6], [0.2, g + 0.85], [0, g + 0.85]], 12, [x, g, z]);
  }
  return m.stl();
}

const halo = (cx: number, cy: number, s: number, stone: string, metal: string) => {
  const stones = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `<circle cx="${cx + Math.cos(a) * 62 * s}" cy="${cy + Math.sin(a) * 40 * s}" r="${11 * s}" fill="url(#${stone})" stroke="#9aa3ad" stroke-width="${1.2 * s}"/>`;
  }).join("");
  const facets = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<line x1="${cx}" y1="${cy - 4 * s}" x2="${cx + Math.cos(a) * 46 * s}" y2="${cy - 4 * s + Math.sin(a) * 30 * s}" stroke="#c9d3dd" stroke-width="${1.2 * s}"/>`;
  }).join("");
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${76 * s}" ry="${50 * s}" fill="none" stroke="url(#${metal})" stroke-width="${12 * s}"/>
    ${stones}
    <ellipse cx="${cx}" cy="${cy - 4 * s}" rx="${46 * s}" ry="${30 * s}" fill="url(#${stone})" stroke="#aab4bf" stroke-width="${1.5 * s}"/>
    ${facets}
    <polygon points="${cx - 18 * s},${cy - 14 * s} ${cx + 18 * s},${cy - 14 * s} ${cx + 26 * s},${cy - 2 * s} ${cx},${cy + 10 * s} ${cx - 26 * s},${cy - 2 * s}" fill="#ffffff" opacity="0.55"/>
    ${[45, 135, 225, 315].map((d) => {
      const a = (d * Math.PI) / 180;
      return `<circle cx="${cx + Math.cos(a) * 44 * s}" cy="${cy - 4 * s + Math.sin(a) * 29 * s}" r="${5 * s}" fill="url(#${metal})"/>`;
    }).join("")}`;
};

const defs = `
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6dc9a"/><stop offset="0.45" stop-color="#d4a94f"/><stop offset="0.7" stop-color="#f3d58b"/><stop offset="1" stop-color="#a87a2c"/>
  </linearGradient>
  <radialGradient id="ice" cx="0.4" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e7eef5"/><stop offset="1" stop-color="#b8c6d4"/>
  </radialGradient>`;

function ringPicture(w: number, h: number, background: string, shadow: boolean): string {
  const cx = w / 2;
  const cy = h * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${defs}
      <radialGradient id="bg" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="#d9d2c6"/></radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${shadow ? "url(#bg)" : background}"/>
    ${shadow ? `<ellipse cx="${cx}" cy="${cy + h * 0.28}" rx="${w * 0.3}" ry="${h * 0.04}" fill="#000" opacity="0.12"/>` : ""}
    <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.27}" ry="${h * 0.24}" fill="none" stroke="url(#gold)" stroke-width="${w * 0.035}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.27 - w * 0.012}" ry="${h * 0.24 - w * 0.012}" fill="none" stroke="#fff3cf" stroke-width="${w * 0.004}" opacity="0.7"/>
    <path d="M ${cx - w * 0.07} ${cy - h * 0.2} L ${cx - w * 0.03} ${cy - h * 0.3} M ${cx + w * 0.07} ${cy - h * 0.2} L ${cx + w * 0.03} ${cy - h * 0.3}" stroke="url(#gold)" stroke-width="${w * 0.018}" stroke-linecap="round"/>
    ${halo(cx, cy - h * 0.33, w / 600, "ice", "gold")}
  </svg>`;
}

/** A client's reference photo (as if taken of a ring they like). */
export const referencePhoto = () => sharp(Buffer.from(ringPicture(1200, 900, "#f4efe7", true))).jpeg({ quality: 88 }).toBuffer();
/** A second, closer reference, for the chat. */
export const chatPhoto = () => sharp(Buffer.from(ringPicture(1000, 1000, "#efe9df", true))).jpeg({ quality: 88 }).toBuffer();
/** The render, on white. */
export const renderImage = () => sharp(Buffer.from(ringPicture(1600, 1200, "#ffffff", false))).png().toBuffer();

/** The technical drawing: front and side views with the measurements. */
export function techDrawing(): Promise<Buffer> {
  const w = 1600;
  const h = 1000;
  const line = 'stroke="#111" stroke-width="3" fill="none"';
  const thin = 'stroke="#555" stroke-width="1.5" fill="none"';
  const text = (x: number, y: number, s: string, size = 26, anchor = "middle") =>
    `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#111" text-anchor="${anchor}">${s}</text>`;
  const arrow = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${thin} marker-start="url(#a)" marker-end="url(#a)"/>`;
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#555"/></marker></defs>
      <rect width="${w}" height="${h}" fill="#fff"/>
      ${text(400, 70, "FRONT VIEW", 28)}
      <circle cx="400" cy="560" r="250" ${line}/>
      <circle cx="400" cy="560" r="222" ${line}/>
      <circle cx="400" cy="235" r="80" ${line}/>
      <circle cx="400" cy="235" r="58" ${line}/>
      ${Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return `<circle cx="${400 + Math.cos(a) * 70}" cy="${235 + Math.sin(a) * 70}" r="9" ${thin}/>`;
      }).join("")}
      ${arrow(178, 560, 622, 560)}${text(400, 548, "Ø 16.9 mm · US 6.5")}
      ${arrow(320, 120, 480, 120)}${text(400, 108, "Halo Ø 10.2 mm")}
      ${arrow(660, 560, 660, 532)}${text(700, 552, "1.7 mm", 24, "start")}
      ${text(1150, 70, "SIDE VIEW", 28)}
      <rect x="1100" y="310" width="100" height="500" rx="18" ${line}/>
      <path d="M1060 310 L1240 310 L1220 250 L1080 250 Z" ${line}/>
      <path d="M1095 250 L1150 160 L1205 250" ${line}/>
      ${arrow(1100, 860, 1200, 860)}${text(1150, 900, "Band 2.0 mm")}
      ${arrow(1290, 160, 1290, 310)}${text(1305, 245, "Height 7.2 mm", 24, "start")}
      <line x1="40" y1="940" x2="${w - 40}" y2="940" ${thin}/>
      ${text(60, 975, "Halo engagement ring · 18K yellow · centre 6.5 mm round (1.00 ct) · halo 16 × 1.3 mm", 24, "start")}
    </svg>`),
  )
    .png()
    .toBuffer();
}

/** A placeholder logo for the branded preview link. */
export const placeholderLogo = () =>
  sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">
      <rect x="4" y="4" width="592" height="192" rx="24" fill="#ffffff" stroke="#111" stroke-width="6" stroke-dasharray="18 12"/>
      <text x="300" y="122" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" letter-spacing="8" fill="#111" text-anchor="middle">YOUR LOGO</text>
    </svg>`),
  )
    .png()
    .toBuffer();
