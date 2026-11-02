import "server-only";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { techPanel, weightWord, type JobWeights } from "@/core/tools/calculators";

/**
 * The technical measurement image, with the weights joined under it (Phase
 * 13f, owner 2 Nov 2026): the designer's image, scaled to one width, then a
 * white panel with the cast gold weight per metal and the diamond details
 * from the calculators. The panel is drawn by next/og (its own font, so the
 * text renders the same on every server) and stacked with sharp.
 */
export const SHEET_WIDTH = 1600;
const ROW = 40;
const PAD = 40;
const HEAD = 64;

const cell = (flex: number, align: "left" | "right" = "left", strong = false) =>
  ({ display: "flex", flex, justifyContent: align === "right" ? "flex-end" : "flex-start", fontWeight: strong ? 700 : 400 }) as const;

function Panel({ w }: { w: JobWeights }) {
  const p = techPanel(w);
  const stoneRows = Math.max(p.stones.length, 1) + 1;
  const row = { display: "flex", height: ROW, alignItems: "center", borderBottom: "1px solid #E4E4E0", fontSize: 24 } as const;
  const head = { ...row, color: "#52524C", fontSize: 20, borderBottom: "2px solid #0A0A0A" } as const;
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#FFFFFF", color: "#0A0A0A", padding: PAD, gap: PAD, borderTop: "4px solid #0A0A0A" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", height: HEAD, alignItems: "center", fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>GOLD WEIGHT</div>
        <div style={head}>
          <div style={cell(1.2)}>Metal</div>
          <div style={cell(1, "right")}>Cast</div>
          <div style={cell(1, "right")}>With post</div>
        </div>
        {p.gold.map((g) => (
          <div key={g.metal} style={{ ...row, fontWeight: g.metal === "18K" ? 700 : 400 }}>
            <div style={cell(1.2)}>{g.metal}</div>
            <div style={cell(1, "right")}>{`${weightWord(g.cast)} g`}</div>
            <div style={cell(1, "right")}>{`${weightWord(g.withPost)} g`}</div>
          </div>
        ))}
        <div style={{ display: "flex", marginTop: 12, fontSize: 18, color: "#52524C" }}>
          {`18K ${weightWord(w.gold18k)} g + ${weightWord(w.castingAllowance)} g casting · post ${weightWord(w.postAllowance)} g`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1.6 }}>
        <div style={{ display: "flex", height: HEAD, alignItems: "center", fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>DIAMOND DETAILS</div>
        <div style={head}>
          <div style={cell(1.4)}>Shape</div>
          <div style={cell(1.2)}>Size (mm)</div>
          <div style={cell(0.6, "right")}>Pcs</div>
          <div style={cell(0.9, "right")}>Ct each</div>
          <div style={cell(0.9, "right")}>Total ct</div>
        </div>
        {p.stones.length === 0 ? (
          <div style={row}>No diamonds</div>
        ) : (
          p.stones.map((s, i) => (
            <div key={i} style={row}>
              <div style={cell(1.4)}>{s.shape}</div>
              <div style={cell(1.2)}>{s.size}</div>
              <div style={cell(0.6, "right")}>{String(s.pcs)}</div>
              <div style={cell(0.9, "right")}>{weightWord(s.carat, 3)}</div>
              <div style={cell(0.9, "right")}>{weightWord(s.totalCt, 3)}</div>
            </div>
          ))
        )}
        <div style={{ ...row, borderBottom: "none", fontWeight: 700 }}>
          <div style={cell(2.6)}>Total</div>
          <div style={cell(0.6, "right")}>{String(p.totals.pcs)}</div>
          <div style={cell(0.9, "right")} />
          <div style={cell(0.9, "right")}>{`${weightWord(p.totals.ct, 3)} ct`}</div>
        </div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 18, color: "#52524C" }}>
          {`Diamond weight ${weightWord(p.totals.grams, 3)} g (ct × 0.2) · ${stoneRows - 1} line${stoneRows - 1 === 1 ? "" : "s"}`}
        </div>
      </div>
    </div>
  );
}

/** Panel height for these weights: the taller of the two tables, plus headings and notes. */
export function panelHeight(w: JobWeights): number {
  const p = techPanel(w);
  const goldRows = p.gold.length + 1; // + header
  const stoneRows = Math.max(p.stones.length, 1) + 2; // + header + total
  return PAD * 2 + HEAD + Math.max(goldRows, stoneRows) * ROW + 12 + 30 + 4;
}

/** The weights panel alone, as a PNG. */
export async function renderPanel(w: JobWeights, width = SHEET_WIDTH): Promise<Buffer> {
  const res = new ImageResponse(<Panel w={w} />, { width, height: panelHeight(w) });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The designer's image with the panel joined underneath, at SHEET_WIDTH.
 * Same format out as in (PNG stays PNG; anything else becomes JPEG).
 */
export async function joinTechSheet(raw: Uint8Array, w: JobWeights): Promise<{ bytes: Buffer; contentType: "image/png" | "image/jpeg"; extension: "png" | "jpg" }> {
  const source = sharp(raw, { failOn: "none" }).rotate();
  const meta = await source.metadata();
  const top = await source.resize({ width: SHEET_WIDTH }).flatten({ background: "#FFFFFF" }).png().toBuffer();
  const topHeight = (await sharp(top).metadata()).height ?? 0;
  const panel = await renderPanel(w);
  const panelH = panelHeight(w);
  const canvas = sharp({ create: { width: SHEET_WIDTH, height: topHeight + panelH, channels: 3, background: "#FFFFFF" } }).composite([
    { input: top, top: 0, left: 0 },
    { input: panel, top: topHeight, left: 0 },
  ]);
  if (meta.format === "png") return { bytes: await canvas.png({ compressionLevel: 9 }).toBuffer(), contentType: "image/png", extension: "png" };
  return { bytes: await canvas.jpeg({ quality: 90 }).toBuffer(), contentType: "image/jpeg", extension: "jpg" };
}
