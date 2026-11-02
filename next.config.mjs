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
  // @react-pdf/renderer (Phase 7a certificate and weight sheet) runs in Node,
  // required at runtime rather than bundled.
  serverExternalPackages: ["rhino3dm", "@react-pdf/renderer"],
  // pdfkit (under @react-pdf) loads its built-in fonts through a package
  // "#standard-fonts/…" import that file tracing does not follow, so on Vercel
  // every PDF failed with "Cannot find module …/standard-fonts/Helvetica.cjs".
  // 192 KB, included everywhere a PDF can be made: the summary sheet, the
  // certificate (also issued by the QC pass action), the weight sheet and
  // the pod report.
  outputFileTracingIncludes: {
    "/orders/**": ["./node_modules/rhino3dm/rhino3dm.wasm"],
    // next/og draws the weights panel on the technical image (Phase 13f) with its own font and wasm.
    "/**": [
      "./node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/pdfkit/package.json",
      "./node_modules/next/dist/compiled/@vercel/og/*.ttf",
      "./node_modules/next/dist/compiled/@vercel/og/*.wasm",
    ],
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
  // Pre-launch (Phase 11b): no other site may frame these pages (clickjacking
  // on approve, pay or release), browsers must not guess file types, and
  // addresses with order ids are not sent to other sites. The design preview
  // frames its own samples, hence SAMEORIGIN rather than DENY.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The chat records voice messages on this site only (Phase 15).
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
  experimental: {
    // Phase 12: a portal page seen (or prefetched) in the last 30 seconds
    // opens from the browser's memory instead of asking the server again,
    // so moving between tabs and going Back is instant. Bounded on purpose:
    // anything saved through a server action clears this memory at once
    // (revalidatePath), the order and chat pages keep checking for news
    // (AutoRefresh), and signing out reloads the page so nothing is kept
    // for the next person on the device (components/auth/sign-out).
    staleTimes: { dynamic: 30, static: 60 },
    serverActions: {
      bodySizeLimit: `${UPLOAD_BODY_LIMIT_MB}mb`,
      allowedOrigins: [...devOrigins, ...extraOrigins],
    },
  },
  // The foundation ships no runtime secrets. Any future server config must stay
  // server-only — never expose secrets via NEXT_PUBLIC_*.
};

export default nextConfig;
