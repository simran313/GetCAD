// The e2e stand-in for the Supabase API gateway (Phase 8).
//
//   /rest/v1/*     → PostgREST (the real thing, against the throwaway Postgres)
//   /storage/v1/*  → a small file store on disk, for the four storage calls
//                    the app makes: upload, createSignedUrl, remove, and the
//                    signed download a browser follows.
//
// Storage is the only part not run for real: the Supabase storage server
// needs its own schema and a container. The app only ever reaches storage
// with the service-role key, after its own checks, so the stand-in checks
// that key and nothing else — exactly what the real bucket policies do for
// the service role.
//
// Env: GATEWAY_PORT (54321), POSTGREST_URL (http://127.0.0.1:3000),
//      SUPABASE_SERVICE_ROLE_KEY, E2E_STORAGE_DIR (.e2e/storage)

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest, createServer } from "node:http";
import { dirname, join, normalize } from "node:path";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = new URL(process.env.POSTGREST_URL ?? "http://127.0.0.1:3000");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ROOT = process.env.E2E_STORAGE_DIR ?? join(process.cwd(), ".e2e", "storage");
const SIGNING = randomBytes(32);

if (!SERVICE_KEY) throw new Error("gateway: SUPABASE_SERVICE_ROLE_KEY is not set");
mkdirSync(ROOT, { recursive: true });

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

function isService(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(SERVICE_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

// bucket/path → a file under ROOT, never outside it.
function fileFor(bucket, key) {
  const rel = normalize(join(bucket, key));
  if (rel.startsWith("..") || rel.includes("\0")) return null;
  return join(ROOT, rel);
}

const sign = (objectPath, exp) => createHmac("sha256", SIGNING).update(`${objectPath}\n${exp}`).digest("base64url");

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function storage(req, res, path) {
  const url = new URL(req.url, "http://gateway");

  // A browser following a signed URL: /object/sign/{bucket}/{path}?token=…
  if (req.method === "GET" && path.startsWith("/object/sign/")) {
    const objectPath = decodeURIComponent(path.slice("/object/sign/".length));
    const [exp, mac] = (url.searchParams.get("token") ?? "").split(".");
    const valid = exp && mac && Number(exp) > Date.now() / 1000 && mac === sign(objectPath, exp);
    if (!valid) return json(res, 400, { statusCode: "400", error: "InvalidSignature", message: "invalid signature" });
    const [bucket, ...rest] = objectPath.split("/");
    const file = fileFor(bucket, rest.join("/"));
    if (!file || !existsSync(file)) return json(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
    const meta = existsSync(`${file}.meta.json`) ? JSON.parse(readFileSync(`${file}.meta.json`, "utf8")) : {};
    const headers = { "content-type": meta.contentType ?? "application/octet-stream", "content-length": statSync(file).size };
    if (url.searchParams.has("download")) {
      const name = url.searchParams.get("download") || rest.at(-1);
      headers["content-disposition"] = `attachment; filename="${name}"`;
    }
    res.writeHead(200, headers);
    return createReadStream(file).pipe(res);
  }

  if (!isService(req)) return json(res, 403, { statusCode: "403", error: "Unauthorized", message: "service role only" });

  // createSignedUrl: POST /object/sign/{bucket}/{path} {expiresIn}
  if (req.method === "POST" && path.startsWith("/object/sign/")) {
    const objectPath = decodeURIComponent(path.slice("/object/sign/".length));
    const [bucket, ...rest] = objectPath.split("/");
    const file = fileFor(bucket, rest.join("/"));
    if (!file || !existsSync(file)) return json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const { expiresIn = 60 } = JSON.parse((await body(req)).toString() || "{}");
    const exp = String(Math.floor(Date.now() / 1000) + Number(expiresIn));
    return json(res, 200, { signedURL: `/object/sign/${objectPath}?token=${exp}.${sign(objectPath, exp)}` });
  }

  // remove: DELETE /object/{bucket} {prefixes:[…]}
  if (req.method === "DELETE" && /^\/object\/[^/]+$/.test(path)) {
    const bucket = path.split("/")[2];
    const { prefixes = [] } = JSON.parse((await body(req)).toString() || "{}");
    const removed = [];
    for (const key of prefixes) {
      const file = fileFor(bucket, key);
      if (file && existsSync(file)) {
        rmSync(file);
        rmSync(`${file}.meta.json`, { force: true });
        removed.push({ name: key, bucket_id: bucket });
      }
    }
    return json(res, 200, removed);
  }

  // upload: POST /object/{bucket}/{path} (raw bytes; x-upsert)
  if ((req.method === "POST" || req.method === "PUT") && path.startsWith("/object/")) {
    const objectPath = decodeURIComponent(path.slice("/object/".length));
    const [bucket, ...rest] = objectPath.split("/");
    const file = fileFor(bucket, rest.join("/"));
    if (!file || rest.length === 0) return json(res, 400, { statusCode: "400", error: "InvalidKey", message: "invalid key" });
    const upsert = req.method === "PUT" || req.headers["x-upsert"] === "true";
    if (existsSync(file) && !upsert) return json(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    const bytes = await body(req);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    writeFileSync(`${file}.meta.json`, JSON.stringify({ contentType: req.headers["content-type"] ?? "application/octet-stream" }));
    return json(res, 200, { Id: randomUUID(), Key: objectPath });
  }

  return json(res, 404, { statusCode: "404", error: "not_found", message: `no stand-in for ${req.method} ${path}` });
}

function proxyRest(req, res, path) {
  const upstream = httpRequest(
    {
      host: POSTGREST.hostname,
      port: POSTGREST.port,
      method: req.method,
      path: path + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""),
      headers: { ...req.headers, host: POSTGREST.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => json(res, 502, { message: `PostgREST unreachable: ${e.message}` }));
  req.pipe(upstream);
}

createServer((req, res) => {
  const path = new URL(req.url, "http://gateway").pathname;
  if (path === "/health") return json(res, 200, { ok: true });
  if (path.startsWith("/rest/v1")) return proxyRest(req, res, path.slice("/rest/v1".length) || "/");
  if (path.startsWith("/storage/v1")) {
    return storage(req, res, path.slice("/storage/v1".length)).catch((e) => json(res, 500, { message: String(e) }));
  }
  json(res, 404, { message: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`e2e gateway on http://127.0.0.1:${PORT}`));
