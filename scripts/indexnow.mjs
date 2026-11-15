#!/usr/bin/env node
/**
 * Tell Bing (and the other IndexNow engines) that the website's pages changed,
 * so they recrawl within hours instead of weeks. ChatGPT's web search draws
 * mainly on Bing's index, so this is how website changes reach it quickly.
 * Google does not use IndexNow; it reads the sitemap.
 *
 *   node scripts/indexnow.mjs                    # submit every URL in the live sitemap
 *   node scripts/indexnow.mjs --wait 2026-11-15  # first wait (up to 15 min) until the
 *                                                # live sitemap shows this lastmod
 *   node scripts/indexnow.mjs --dry-run          # print what would be sent
 *
 * The key below is public by design: IndexNow proves ownership by fetching
 * https://thecadpillar.com/<key>.txt, which holds the same value
 * (public/<key>.txt). Run by .github/workflows/indexnow.yml after a deploy.
 */
export const INDEXNOW_KEY = "be38c624529215b5a0c00666ded56a21";
const SITE = (process.env.SITE_URL ?? "https://thecadpillar.com").replace(/\/$/, "");
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const waitFor = args.includes("--wait") ? args[args.indexOf("--wait") + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function liveSitemap() {
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim());
  return { urls, lastmods };
}

async function keyServed() {
  const res = await fetch(`${SITE}/${INDEXNOW_KEY}.txt`, { headers: { "cache-control": "no-cache" } });
  return res.ok && (await res.text()).trim() === INDEXNOW_KEY;
}

async function main() {
  // The deploy for the pushed commit may still be building: wait (up to 15
  // min) until the live site serves the key file and, with --wait, the
  // sitemap carries the new date, so engines fetch the new pages.
  let sitemap = await liveSitemap();
  let ready = () => true;
  for (let i = 0; i < (dryRun ? 0 : 30); i++) {
    const dateOk = !waitFor || sitemap.lastmods.some((d) => d.startsWith(waitFor));
    const keyOk = await keyServed();
    ready = () => dateOk && keyOk;
    if (ready()) break;
    console.log(`Waiting for the deploy (key file ${keyOk ? "live" : "not yet live"}; lastmod ${sitemap.lastmods[0] ?? "none"}${waitFor ? `, want ${waitFor}` : ""})…`);
    await sleep(30_000);
    sitemap = await liveSitemap();
  }
  if (!dryRun && !(await keyServed())) throw new Error(`${SITE}/${INDEXNOW_KEY}.txt does not serve the key; nothing submitted.`);
  if (!ready()) console.log("The live sitemap never showed the new date; submitting anyway.");

  const urlList = [...sitemap.urls, `${SITE}/llms.txt`];
  const body = { host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList };
  if (dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200 OK and 202 Accepted both mean received; 422 means a URL is not on the host.
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  console.log(`Submitted ${urlList.length} URLs to IndexNow (status ${res.status}).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
