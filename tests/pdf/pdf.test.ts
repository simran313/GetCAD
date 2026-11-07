import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Phase 7a: the certificate and weight sheet render to real PDFs from the
 * shapes certificate_data() and weight_sheet_data() return (0050).
 */
const checklist = [
  ...Array.from({ length: 9 }, (_, i) => ({
    item: 101 + i,
    group: "Designer check",
    label: `Designer line ${i + 1}`,
    signoff: false,
    stage: "DESIGNER",
    outcome: "PASS" as const,
    designer_at: "2026-11-03T09:00:00Z",
    qc_at: null,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    item: 201 + i,
    group: "QC manager check",
    label: `QC manager line ${i + 1}`,
    signoff: false,
    stage: "MANAGER",
    outcome: "PASS" as const,
    designer_at: null,
    qc_at: "2026-11-03T11:00:00Z",
  })),
];
/** A version checked before 0059: the 19 ticked lines. */
const legacy = Array.from({ length: 19 }, (_, i) => ({
  item: i + 1,
  group: i < 4 ? "Before starting" : "Final",
  label: `Check ${i + 1}`,
  signoff: i === 18,
  designer_at: "2026-11-03T09:00:00Z",
  qc_at: "2026-11-03T11:00:00Z",
}));

describe("PDFs", () => {
  it.each([
    ["two-stage QC", checklist],
    ["a version checked before 0059", legacy],
  ] as const)("renders the certificate: %s", async (_name, lines) => {
    const { renderCertificate } = await import("../../lib/pdf/certificate");
    const buf = await renderCertificate({
      order_ref: "TCP-J261102-003",
      version: 2,
      category: "D",
      service: "cad",
      product: "RING",
      passed_at: "2026-11-03T11:05:00Z",
      measurements: {
        min_wall_um: 820,
        min_prong_um: 600,
        stone_seats: [{ position: "centre", shape: "Oval", size_mm: "9 x 7" }],
        ring_size: "US 6.5",
        inner_diameter_um: 16900,
        mesh_tolerance_um: 5,
        open_edges: 0,
      },
      minimums: { wall_um: 800, prong_um: 800 },
      waivers: [{ spec: "prong", requested: "0.6 mm", note: "client asked" }],
      checklist: [...lines],
      designer_ref: "DSG-0142",
      pod_name: "Rhino pod",
      files: [{ slot: "STL", sha256: "a".repeat(64), size_bytes: 1000, file_name: "RN-C-12_STL_v2.stl" }],
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 60_000);

  it("renders the weight sheet", async () => {
    const { renderWeightSheet } = await import("../../lib/pdf/weightSheet");
    const buf = await renderWeightSheet({
      ref: "TCP-J261102-003",
      version: 2,
      volume_mm3: 250,
      densities_mg_cm3: { "10K": 11600, "14K": 13100, "18K": 15600, Pt950: 21400, Ag925: 10400 },
      spec: { product: "RING", ring_size: "US 6.5", has_centre_stone: true, centre_shape: "OVAL", centre_length_um: 9000, centre_width_um: 7000 },
      accents: [{ shape: "ROUND", width_um: 1500, quantity: 12, setting: "PAVE" }],
      measurements: { ring_size: "US 6.5", inner_diameter_um: 16900 },
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("renders the summary sheet with both images, stones, weights and the timeline (Phase 13a)", async () => {
    const { renderSummarySheet } = await import("../../lib/pdf/summarySheet");
    const { pdfText } = await import("../e2e/pdf");
    const { deflateSync } = await import("node:zlib");
    // A real 2×2 PNG.
    const crc = (b: Buffer) => {
      let c = ~0;
      for (const x of b) {
        c ^= x;
        for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      }
      return ~c >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(td));
      return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 0, 255]);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const buf = await renderSummarySheet(
      {
        ref: "MF1-RN-C-24",
        title: "Halo engagement ring",
        product_type: "RING",
        service: "cad",
        status: "APPROVED",
        version: 2,
        created_at: "2026-11-01T09:00:00Z",
        confirmed_at: "2026-11-01T10:00:00Z",
        volume_mm3: 312.5,
        densities_mg_cm3: { "14K": 13070, "18K": 15580 },
        spec: { product: "RING", has_centre_stone: true, centre_shape: "OVAL", centre_length_um: 9000, centre_width_um: 7000, centre_quantity: 1 },
        accents: [{ shape: "ROUND", width_um: 1500, quantity: 24, setting: "PAVE" }],
        measurements: { ring_size: "US 6.5", inner_diameter_um: 16900 },
        timeline: [
          { at: "2026-11-01T14:30:00Z", to: "CLIENT_PREVIEW" },
          { at: "2026-11-01T18:00:00Z", to: "APPROVED" },
        ],
      },
      { render: png, technical: png },
    );
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await pdfText(buf);
    expect(text).toContain("Halo engagement ring");
    // Eyebrows are letter-spaced: compare without spaces.
    expect(text.replace(/\s/g, "")).toContain("RENDERVIEWS");
    expect(text.replace(/\s/g, "")).toContain("TECHNICALSHEET");
    expect(text).toMatch(/24 × Round 1\.5 mm · Pave/);
    expect(text).toMatch(/14\s*K/);
    expect(text).toContain("4 h 30 min after confirmation");
    expect(text).toContain("Turnaround 8 h");
  }, 30_000);
});
