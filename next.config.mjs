/** @type {import('next').NextConfig} */

// Uploads (order files, designer application portfolios) travel through Server
// Actions, so this is the REAL transport ceiling — Next defaults it to 1MB,
// which silently rejected every realistic CAD file or PDF before the
// sanitization gate ever saw it. It must stay >= core/files' MAX_UPLOAD_BYTES,
// or the gate advertises a size the transport cannot accept.
// tests/config/upload-limits.test.ts fails if the two drift apart.
export const UPLOAD_BODY_LIMIT_MB = 25;

// Server Action origin (CSRF) trust.
//
// Dev hosts proxy Server Actions from a forwarded host that differs from the
// origin, so Codespaces needs an explicit allowance. That allowance MUST NOT
// ship to production: "*.app.github.dev" is a domain anyone can obtain a
// subdomain on, so trusting it in prod would weaken Next's origin check for the
// deployed site. In production the list starts empty (same-origin only); add a
// real deployment host via NEXT_SERVER_ACTION_ALLOWED_ORIGINS (comma-separated)
// only if your host proxies Server Actions from a different origin.
const devOrigins =
  process.env.NODE_ENV === "production" ? [] : ["localhost:3000", "*.app.github.dev"];

const extraOrigins = (process.env.NEXT_SERVER_ACTION_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  // 3DM uploads are cleaned with rhino3dm (lib/files/strip3dm.ts), which loads
  // a WebAssembly file from its own folder at runtime. Left to the bundler,
  // that file would not be found; kept external, it is required from
  // node_modules, and the explicit include makes sure the .wasm is deployed.
  serverExternalPackages: ["rhino3dm"],
  outputFileTracingIncludes: {
    "/orders/**": ["./node_modules/rhino3dm/rhino3dm.wasm"],
  },
  // Pages from the old site (owner answer Q15, Phase 6): kept as addresses
  // so links and search results still land, on the page that replaced them.
  async redirects() {
    return [
      { source: "/about", destination: "/", statusCode: 301 },
      { source: "/security", destination: "/guarantee", statusCode: 301 },
      { source: "/blog", destination: "/", statusCode: 301 },
      { source: "/blog/:slug*", destination: "/", statusCode: 301 },
      { source: "/for-designers", destination: "/apply-designer", statusCode: 301 },
      { source: "/quality-control", destination: "/quality", statusCode: 301 },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: `${UPLOAD_BODY_LIMIT_MB}mb`,
      allowedOrigins: [...devOrigins, ...extraOrigins],
    },
  },
  // The foundation ships no runtime secrets. Any future server config must stay
  // server-only — never expose secrets via NEXT_PUBLIC_*.
};

export default nextConfig;
