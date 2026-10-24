import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Phase 7a: the certificate and weight sheet render to real PDFs from the
 * shapes certificate_data() and weight_sheet_data() return (0050).
 */
const checklist = Array.from({ length: 19 }, (_, i) => ({
  item: i + 1,
  group: i < 4 ? "Before starting" : "Final",
  label: `Check ${i + 1}`,
  signoff: i === 18,
  designer_at: "2026-11-03T09:00:00Z",
  qc_at: "2026-11-03T11:00:00Z",
}));

describe("PDFs", () => {
  it("renders the certificate", async () => {
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
      checklist,
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
});
