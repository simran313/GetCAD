// From sign-in to a database row: how identity reaches row-level security.
export default {
  title: "Authentication and identity bridge",
  width: 1040, height: 360,
  caption: "Clerk proves who you are; the database decides what you may do",
  nodes: [
    { id: "u", x: 20, y: 140, w: 130, h: 64, label: "Person", sub: "email code or\nGoogle", kind: "actor" },
    { id: "clerk", x: 190, y: 140, w: 170, h: 64, label: "Clerk (production)", sub: "clerk.thecadpillar.com", kind: "external" },
    { id: "jwt", x: 400, y: 140, w: 170, h: 64, label: "Session JWT", sub: "sub = user_… id\nshort-lived, rotated" },
    { id: "sb", x: 610, y: 140, w: 180, h: 64, label: "Supabase third-party auth", sub: "checks signature (JWKS)\nand issuer", kind: "data" },
    { id: "fn", x: 830, y: 50, w: 190, h: 64, label: "app.current_clerk_id()", sub: "reads the JWT sub", kind: "data" },
    { id: "roles", x: 830, y: 140, w: 190, h: 64, label: "users.role + user_roles", sub: "CLIENT · DESIGNER · QC\nSALES · OPS · FINANCE · ADMIN", kind: "data" },
    { id: "rls", x: 830, y: 230, w: 190, h: 64, label: "RLS policies and functions", sub: "allow or refuse each row", kind: "data" },
    { id: "welcome", x: 400, y: 260, w: 170, h: 64, label: "/welcome · ensure_self()", sub: "first visit creates a\nCLIENT row (audited)" },
  ],
  edges: [
    { from: "u", to: "clerk" }, { from: "clerk", to: "jwt", label: "issues" }, { from: "jwt", to: "sb", label: "Bearer" },
    { from: "sb", to: "fn", via: [[700, 82]], toSide: "l" }, { from: "fn", to: "roles", fromSide: "b", toSide: "t" }, { from: "roles", to: "rls", fromSide: "b", toSide: "t" },
    { from: "jwt", to: "welcome", fromSide: "b", toSide: "t", dashed: true, label: "no row yet" },
  ],
};
