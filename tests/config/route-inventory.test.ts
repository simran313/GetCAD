import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_ROUTE_SEGMENTS, PROTECTED_PREFIXES, PUBLIC_WEBSITE_PAGES, skipsClerk } from "@/core";

/**
 * The public website's pages are fixed (SEO, 12 Nov 2026): no page is added,
 * removed or renamed without changing this list on purpose, so an indexed
 * URL cannot disappear by accident. And every route outside the website sits
 * under a segment that always goes through Clerk's middleware.
 */
const APP_DIR = join(process.cwd(), "app");

function routes(dir = APP_DIR, url: string[] = [], group = ""): { path: string; group: string }[] {
  const out: { path: string; group: string }[] = [];
  const entries = readdirSync(dir);
  if (entries.some((f) => /^(page|route)\.(tsx?|jsx?)$/.test(f))) out.push({ path: `/${url.join("/")}`, group });
  for (const name of entries) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || name === "fonts" || name.startsWith("_")) continue;
    const isGroup = /^\(.+\)$/.test(name);
    out.push(...routes(full, isGroup ? url : [...url, name], group || (isGroup ? name : "")));
  }
  return out;
}

const all = routes();

describe("public website route inventory", () => {
  it("has exactly the existing public pages, at the same URLs", () => {
    const website = all.filter((r) => r.group === "(marketing)").map((r) => r.path).sort();
    expect(website).toEqual(
      [
        "/",
        "/apply-designer",
        "/contact",
        "/faq",
        "/guarantee",
        "/how-it-works",
        "/jewelry-cad",
        "/pricing",
        "/privacy",
        "/quality",
        "/results",
        "/terms",
      ].sort(),
    );
  });

  it("lists every website page as public (no sign-in check on a page view)", () => {
    for (const r of all.filter((x) => x.group === "(marketing)")) {
      expect((PUBLIC_WEBSITE_PAGES as readonly string[]).includes(r.path), r.path).toBe(true);
    }
  });

  it("puts every other route under a segment that always goes through Clerk", () => {
    const others = all.filter((r) => r.group !== "(marketing)" && r.path !== "/offline");
    for (const r of others) {
      const first = r.path.split("/").filter(Boolean)[0] ?? "";
      expect((APP_ROUTE_SEGMENTS as readonly string[]).includes(first), `${r.path} (segment "${first}")`).toBe(true);
    }
  });

  it("covers every protected prefix", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect((APP_ROUTE_SEGMENTS as readonly string[]).includes(prefix.slice(1)), prefix).toBe(true);
    }
  });
});

describe("skipsClerk", () => {
  it("serves public pages and unknown paths (a 404) without Clerk", () => {
    expect(skipsClerk("GET", "/")).toBe(true);
    expect(skipsClerk("GET", "/pricing")).toBe(true);
    expect(skipsClerk("HEAD", "/jewelry-cad/")).toBe(true);
    expect(skipsClerk("GET", "/does-not-exist")).toBe(true);
    expect(skipsClerk("GET", "/old/page/link")).toBe(true);
  });

  it("keeps Clerk on every app route, sign-in, the API and every form post", () => {
    for (const p of ["/home", "/orders/abc", "/admin", "/admin/access", "/sign-in", "/sign-up/verify", "/api/health", "/p/token", "/work/1", "/tools", "/materials", "/Admin"]) {
      expect(skipsClerk("GET", p), p).toBe(false);
    }
    expect(skipsClerk("POST", "/pricing")).toBe(false);
    expect(skipsClerk("POST", "/does-not-exist")).toBe(false);
  });
});
