// Starts PostgREST (the real one, from its official image) against the
// throwaway database, trusting the keys prepare.ts wrote to .e2e/jwks.json.
// Needs Docker. In CI the e2e job runs this; locally, use any machine with
// Docker (a Codespace has it).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = new URL(process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5433/postgres");
db.username = "authenticator";
db.password = "authenticator";
const jwks = readFileSync(join(process.cwd(), ".e2e", "jwks.json"), "utf8");

spawnSync("docker", ["rm", "-f", "getcad-e2e-postgrest"], { stdio: "ignore" });
const r = spawnSync(
  "docker",
  [
    "run", "-d", "--name", "getcad-e2e-postgrest", "--network", "host",
    "-e", `PGRST_DB_URI=${db.toString()}`,
    "-e", "PGRST_DB_SCHEMAS=public",
    "-e", "PGRST_DB_ANON_ROLE=anon",
    "-e", `PGRST_JWT_SECRET=${jwks}`,
    "-e", "PGRST_SERVER_HOST=127.0.0.1",
    "-e", "PGRST_SERVER_PORT=3000",
    "postgrest/postgrest:v12.2.3",
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);

// Wait until it answers (it retries the database itself).
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch("http://127.0.0.1:3000/");
    if (res.status < 500) {
      console.log("PostgREST is up on :3000");
      process.exit(0);
    }
  } catch {}
  await new Promise((ok) => setTimeout(ok, 1000));
}
spawnSync("docker", ["logs", "getcad-e2e-postgrest"], { stdio: "inherit" });
throw new Error("PostgREST did not start");
