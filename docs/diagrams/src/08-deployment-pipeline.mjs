// From a code change to production, and where people decide.
export default {
  title: "Delivery pipeline",
  width: 1040, height: 380,
  caption: "Database migrations are applied by the owner, never by CI or Vercel",
  nodes: [
    { id: "dev", x: 20, y: 70, w: 150, h: 64, label: "Branch", sub: "claude/… or feature", kind: "actor" },
    { id: "pr", x: 210, y: 70, w: 150, h: 64, label: "Pull request", sub: "one phase per PR" },
    { id: "ci", x: 400, y: 30, w: 210, h: 64, label: "CI · verify", sub: "typecheck · lint · 1,201 tests\nsecret scan (throwaway Postgres)", kind: "external" },
    { id: "e2e", x: 400, y: 110, w: 210, h: 64, label: "CI · e2e", sub: "Playwright journeys · Lighthouse\nPostgREST + Clerk dev keys", kind: "external" },
    { id: "prev", x: 400, y: 200, w: 210, h: 56, label: "Vercel preview", sub: "per branch", kind: "external" },
    { id: "rev", x: 650, y: 70, w: 150, h: 64, label: "Owner review", sub: "merges", kind: "actor" },
    { id: "main", x: 840, y: 70, w: 180, h: 64, label: "main → Vercel prod", sub: "thecadpillar.com", kind: "terminal" },
    { id: "mig", x: 650, y: 230, w: 180, h: 64, label: "db/migrations", sub: "owner runs db:apply\nor the SQL editor", kind: "warn" },
    { id: "prod", x: 870, y: 230, w: 150, h: 64, label: "Supabase prod", kind: "data" },
    { id: "dqa", x: 210, y: 230, w: 150, h: 64, label: "Design QA", sub: "[design-qa:<stage>]\nscreens + axe", kind: "external" },
  ],
  edges: [
    { from: "dev", to: "pr" }, { from: "pr", to: "ci" }, { from: "pr", to: "e2e" }, { from: "pr", to: "prev", via: [[380, 228]], toSide: "l" },
    { from: "ci", to: "rev" }, { from: "e2e", to: "rev" }, { from: "rev", to: "main" }, { from: "rev", to: "mig", dashed: true, fromSide: "b", toSide: "t", label: "if the PR adds one" }, { from: "mig", to: "prod" },
    { from: "dev", to: "dqa", dashed: true, via: [[95, 262]], toSide: "l" },
  ],
};
