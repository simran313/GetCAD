// How one signed-in request reaches the data, and where each check happens.
export default {
  title: "Request flow and trust boundaries",
  width: 1040, height: 470,
  caption: "Every read and write runs as the signed-in person; the service role is used only after the app's own check",
  groups: [
    { x: 20, y: 40, w: 150, h: 400, label: "Browser" },
    { x: 190, y: 40, w: 470, h: 400, label: "Vercel · Next.js server", fill: "#FFFFFF" },
    { x: 680, y: 40, w: 340, h: 400, label: "Supabase" },
  ],
  nodes: [
    { id: "b", x: 35, y: 180, w: 120, h: 60, label: "Page / form", sub: "Clerk cookie", kind: "actor" },
    { id: "mw", x: 210, y: 80, w: 190, h: 60, label: "1 · Middleware", sub: "skipsClerk() / protect()" },
    { id: "rsc", x: 210, y: 180, w: 190, h: 70, label: "2 · Server Component\nor Server Action", sub: "auth() → userId" },
    { id: "uc", x: 440, y: 180, w: 200, h: 70, label: "3 · createUserSupabaseClient", sub: "Bearer = Clerk session JWT" },
    { id: "ac", x: 440, y: 330, w: 200, h: 70, label: "createAdminSupabaseClient", sub: "service role · server-only\nafter the app's own check", kind: "warn" },
    { id: "rest", x: 700, y: 80, w: 150, h: 60, label: "PostgREST", sub: "verifies JWT (JWKS)", kind: "data" },
    { id: "rls", x: 700, y: 180, w: 300, h: 70, label: "4 · RLS + SECURITY DEFINER functions", sub: "app.current_clerk_id() = JWT sub\nrole helpers · column rules", kind: "data" },
    { id: "tables", x: 870, y: 80, w: 130, h: 60, label: "Tables", sub: "fail closed", kind: "data" },
    { id: "st", x: 700, y: 330, w: 300, h: 70, label: "Storage (private buckets)", sub: "60-second signed URL to the browser", kind: "data" },
  ],
  edges: [
    { from: "b", to: "mw", via: [[95, 110]], toSide: "l" },
    { from: "mw", to: "rsc" },
    { from: "rsc", to: "uc" },
    { from: "uc", to: "rest", via: [[540, 110]], toSide: "l" },
    { from: "rest", to: "rls", fromSide: "b", toSide: "t", via: [[775, 165]] },
    { from: "rls", to: "tables", fromSide: "t", toSide: "b", via: [[935, 165]] },
    { from: "rsc", to: "ac", label: "only when needed", dashed: true, via: [[305, 365]], toSide: "l" },
    { from: "ac", to: "st" },
    { from: "st", to: "b", label: "redirect · 60 s", dashed: true, via: [[850, 425], [95, 425]], toSide: "b" },
  ],
};
