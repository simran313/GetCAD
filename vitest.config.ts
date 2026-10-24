import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror tsconfig's "@/*" path alias so tests can import app-layer modules
  // (lib/, config/) the same way the application does.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // The PDF documents (lib/pdf) are JSX; tsconfig's "preserve" leaves that to
  // Next, so tests use React's automatic runtime explicitly.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["core/**/*.test.ts", "tests/**/*.test.ts"],
    // DB and lint subprocess tests need headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run files serially so the single throwaway Postgres database is not
    // mutated by two suites at once (keeps Test D deterministic).
    fileParallelism: false,
  },
});
