import { expect, test, type Page } from "@playwright/test";

import { signedIn } from "./helpers";
import { PERSONAS, readState } from "./state";

/**
 * Phase 8a — the anonymity proof in a real browser (IMPLEMENTATION-PLAN 1.1,
 * DECISIONS §2). Signed in as the designer, follow every link the app offers
 * and keep each page's HTML and every RSC/JSON response it loads.
 *
 *   1. None of the clients' identifiers appear anywhere in what was served.
 *   2. Two jobs of the same client share nothing that a job of another
 *      client does not also share (so the designer cannot link them).
 */
const state = readState();
const { sameClient, otherClient } = state.fixtures.crawlOrders;
const MAX_PAGES = 50;

function forbidden(): string[] {
  const { users, fixtures } = state;
  const clients = [users.client, users.client2];
  return [
    ...clients,
    ...clients.map((c) => fixtures.clientCodes[c]!),
    ...clients.map((c) => fixtures.clientProfileIds[c]!),
    ...Object.values(fixtures.orderRefs),
    ...(["client", "client2"] as const).flatMap((p) => [
      PERSONAS[p].email,
      PERSONAS[p].business,
      PERSONAS[p].legalName,
      PERSONAS[p].phone,
    ]),
    "Mehta anniversary halo",
    "Kapoor solitaire",
    "Iyer eternity band",
    "PO-MEHTA-7781",
    "PO-KAPOOR-4410",
    "PO-IYER-1203",
  ].filter(Boolean);
}

/** Everything the server sent for a page: its HTML and its RSC/JSON fetches. */
async function capture(page: Page, path: string): Promise<string> {
  const bodies: Promise<string>[] = [];
  const onResponse = (r: import("@playwright/test").Response) => {
    const type = r.headers()["content-type"] ?? "";
    if (r.url().startsWith("http://127.0.0.1:3100") && /text\/x-component|application\/json|text\/html/.test(type)) {
      // A body still streaming after 5 s is not waited for.
      bodies.push(Promise.race([r.text().catch(() => ""), new Promise<string>((ok) => setTimeout(() => ok(""), 5_000))]));
    }
  };
  page.on("response", onResponse);
  // "load", not "networkidle": the order pages poll for changes every few
  // seconds, and each page's own server data is already in its HTML.
  await page.goto(path, { waitUntil: "load" });
  const html = await page.content();
  page.off("response", onResponse);
  return [html, ...(await Promise.all(bodies))].join("\n");
}

const tokens = (text: string) => new Set(text.match(/[A-Za-z0-9][A-Za-z0-9_+@.:-]{3,}/g) ?? []);

test("nothing the designer can reach names or links a client", async ({ browser }) => {
  test.setTimeout(480_000);
  const started = Date.now();
  const page = await signedIn(browser, "designer");

  // 1. Crawl from home over same-origin links.
  const seen = new Map<string, string>();
  const queue = ["/home", "/work", ...[...sameClient, otherClient].flatMap((id) => [`/work/${id}`, `/work/${id}/checklist`])];
  while (queue.length > 0 && seen.size < MAX_PAGES) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.set(path, await capture(page, path));
    if (seen.size % 10 === 0) console.log(`crawl: ${seen.size} pages, ${Math.round((Date.now() - started) / 1000)} s`);
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const href of links) {
      if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/") || href.startsWith("/sign")) continue;
      const clean = href.split("#")[0]!;
      if (!seen.has(clean)) queue.push(clean);
    }
  }
  console.log(`crawled ${seen.size} pages in ${Math.round((Date.now() - started) / 1000)} s`);
  expect(seen.size).toBeGreaterThan(5);

  // Whole-word matches: a client code like "MJ1" must not be found inside
  // a random build hash.
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = forbidden().map((v) => [v, new RegExp(`(^|[^A-Za-z0-9])${escape(v)}($|[^A-Za-z0-9])`)] as const);
  const leaks: string[] = [];
  for (const [path, body] of seen) {
    for (const [value, re] of patterns) if (re.test(body)) leaks.push(`${path}: ${value}`);
  }
  expect(leaks, "client identifiers served to the designer").toEqual([]);

  // 2. Linkability: what the two jobs of one client share, minus what any
  // job shares with the other client's job, must be nothing.
  const jobTokens = (id: string) => tokens([`/work/${id}`, `/work/${id}/checklist`].map((p) => seen.get(p) ?? "").join("\n"));
  const [a, b] = sameClient.map(jobTokens) as [Set<string>, Set<string>];
  const other = jobTokens(otherClient);
  const linking = [...a].filter((t) => b.has(t) && !other.has(t) && !t.includes(sameClient[0]) && !t.includes(sameClient[1]));
  expect(linking, "tokens only the same client's two jobs share").toEqual([]);

  await page.context().close();
});
