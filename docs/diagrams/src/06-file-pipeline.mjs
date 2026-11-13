// Upload to download: how CAD files are cleaned, stored and released.
export default {
  title: "File pipeline and IP protection",
  width: 1040, height: 420,
  caption: "The bucket is private; every download is decided per request and lasts 60 seconds",
  nodes: [
    { id: "dz", x: 20, y: 70, w: 150, h: 64, label: "Designer / client", sub: "chooses a file", kind: "actor" },
    { id: "su", x: 210, y: 70, w: 170, h: 64, label: "Signed upload URL", sub: "per slot, per order\n≤ 50 MB" },
    { id: "gate", x: 420, y: 50, w: 210, h: 104, label: "Sanitization gate", sub: "extension + magic bytes\nmetadata stripped (EXIF, XMP)\n3DM blocks exploded · PDF cleaned\nauto-named ORDER_SLOT_vN" },
    { id: "store", x: 670, y: 70, w: 170, h: 64, label: "order-files bucket", sub: "private", kind: "data" },
    { id: "fv", x: 880, y: 70, w: 140, h: 64, label: "file_versions", sub: "versioned · audited", kind: "data" },
    { id: "fp", x: 880, y: 190, w: 140, h: 64, label: "SHA-256 fingerprint", sub: "delivered = archived\nread-only" , kind: "data" },
    { id: "req", x: 20, y: 280, w: 150, h: 64, label: "Download request", sub: "/api/files/…", kind: "actor" },
    { id: "dg", x: 210, y: 270, w: 210, h: 84, label: "Download gate", sub: "Clerk auth() → RLS\nvisible_orders() + role\nstate (e.g. client only after\napproval)" },
    { id: "sign", x: 460, y: 280, w: 190, h: 64, label: "60-second signed URL", sub: "service role, after the gate", kind: "warn" },
    { id: "audit", x: 690, y: 280, w: 150, h: 64, label: "audit_log", sub: "identity reads logged", kind: "data" },
  ],
  edges: [
    { from: "dz", to: "su" }, { from: "su", to: "gate" }, { from: "gate", to: "store" }, { from: "store", to: "fv" }, { from: "fv", to: "fp", fromSide: "b", toSide: "t" },
    { from: "req", to: "dg" }, { from: "dg", to: "sign", label: "granted" }, { from: "sign", to: "store", fromSide: "t", toSide: "b", via: [[555, 230], [755, 230]] },
    { from: "dg", to: "audit", dashed: true, via: [[315, 380], [765, 380]], toSide: "b" },
  ],
};
