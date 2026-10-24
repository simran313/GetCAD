/** What version_spec() returns (0050): the job and QC screens' spec state. */
export interface VersionSpec {
  version: number;
  volume_mm3: number | null;
  measurements: {
    min_wall_um: number;
    min_prong_um: number | null;
    stone_seats: { position?: string; shape?: string; size_mm?: string }[];
    ring_size: string | null;
    inner_diameter_um: number | null;
    mesh_tolerance_um: number;
    open_edges: number;
  } | null;
  waivers: { spec: string; requested: string; note: string | null }[];
  minimums: { wall_um: number | null; prong_um: number | null };
  certificate: boolean;
}
