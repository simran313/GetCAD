// The double-blind design: identities live apart from orders.
export default {
  title: "Anonymity wall (double blind)",
  width: 1040, height: 400,
  caption: "Orders carry opaque ids; each side's identity sits in its own table, read only through logged functions",
  groups: [
    { x: 20, y: 40, w: 280, h: 330, label: "Client side" },
    { x: 380, y: 40, w: 280, h: 330, label: "Shared (no names)", fill: "#FFFFFF" },
    { x: 740, y: 40, w: 280, h: 330, label: "Designer side" },
  ],
  nodes: [
    { id: "cp", x: 40, y: 80, w: 240, h: 70, label: "client_profiles", sub: "company, contact\nadmins only (identity reads logged)", kind: "data" },
    { id: "cv", x: 40, y: 190, w: 240, h: 64, label: "Client sees", sub: "\"Your team\" · \"Designer\"\nnever a designer's name", kind: "note" },
    { id: "orders", x: 400, y: 80, w: 240, h: 70, label: "orders", sub: "opaque ids · job_code · status\nmoney columns via functions", kind: "data" },
    { id: "threads", x: 400, y: 180, w: 240, h: 64, label: "threads / messages", sub: "role labels, not people\ndesigners never post to clients", kind: "data" },
    { id: "files", x: 400, y: 274, w: 240, h: 64, label: "file_versions", sub: "metadata stripped on the way in", kind: "data" },
    { id: "dp", x: 760, y: 80, w: 240, h: 70, label: "designer_profiles", sub: "legal name, bank, documents\nadmins only · every view logged", kind: "data" },
    { id: "dv", x: 760, y: 190, w: 240, h: 64, label: "Designer sees", sub: "the brief and \"Client\"\nnever company, price or payments", kind: "note" },
  ],
  edges: [
    { from: "cp", to: "orders", dashed: true, label: "client_id only" }, { from: "dp", to: "orders", dashed: true, label: "designer_id only" },
    { from: "orders", to: "threads", fromSide: "b", toSide: "t" }, { from: "threads", to: "files", fromSide: "b", toSide: "t" },
  ],
};
