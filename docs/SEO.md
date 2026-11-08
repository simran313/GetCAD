# Search: indexing and branded search (8 Nov 2026)

Goal: appear for **"thecadpillar"**, **"The CAD Pillar"** and **"The CAD Pillar jewelry CAD"**.

## Audit of the live site (thecadpillar.com, fetched as Googlebot, 8 Nov 2026)

| Check | Finding | Status |
| --- | --- | --- |
| DNS | A records on Vercel (216.198.79.1, 64.29.17.65); NS ns1/ns2.vercel-dns.com; CAA allows Let's Encrypt, Sectigo, Google; MX Google Workspace. No `google-site-verification` TXT record yet. | OK; add verification (below) |
| HTTPS / host | `https://thecadpillar.com` answers 200. `https://www.thecadpillar.com` redirects with **307 (temporary)** to the apex. | Change to 308 (below) |
| robots.txt | 200, `Allow: /`, portal paths disallowed, sitemap listed. Also disallowed `/sign-in` and `/sign-up`, which the site links to: Google could list them as bare links it cannot read. | Fixed |
| sitemap.xml | 200, 11 public pages, all answer 200 with a self-referencing canonical. Home listed as `https://thecadpillar.com` while its canonical is `https://thecadpillar.com/`; every `lastmod` was the request time (Google ignores a lastmod that is always "now"). | Fixed |
| Rendering | Pages are server-rendered: the home page HTML carries its full text (about 6,000 characters), title, description, canonical and Open Graph tags without JavaScript. | OK |
| Titles | Every page title ends "\| The CAD Pillar". The home title led with "Factory-ready jewelry CAD, in hours". | Home now brand-first |
| noindex | Public pages: none (correct). Portal pages: a signed-out visitor (Googlebot) gets a 404 marked `noindex`. `/p/…` preview links: `noindex, nofollow`. Sign-in / sign-up: 200 with no noindex. | Fixed |
| Structured data | **None.** Google takes a site's name, alternate names and logo from WebSite and Organization structured data. | Added |
| Clerk | Production serves a Clerk **development** key (`pk_test_…`, header `x-clerk-auth-reason: dev-browser-missing`). The marketing pages do not load Clerk, so crawling is unaffected; it is a production risk for sign-in (dev instances have limits). | Owner: switch to production keys |

## What the code now does

- **Home page:** title "The CAD Pillar: jewelry CAD, factory-ready in hours"; description opens with "The CAD Pillar is…". The page itself is unchanged.
- **Structured data on the home page** (`lib/seo.ts`, `siteJsonLd`):
  - `WebSite`: name "The CAD Pillar"; alternate names "thecadpillar", "CAD Pillar", "The CAD Pillar jewelry CAD", "thecadpillar.com".
  - `Organization`: the same names; legal name Ichizu Private Limited; logo `/icons/pillar-512.png`.
- **Every page:**
  - `metadataBase` is the site URL, so canonical and Open Graph URLs are absolute.
  - The default description names the brand and the domain.
  - The `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` setting adds Google's verification meta tag when it is set.
- **robots.txt:** every portal area is disallowed (`tests/config/seo.test.ts` fails if a new one is missing). `/sign-in` and `/sign-up` are crawlable so their `noindex` is read.
- **noindex:** sign-in and sign-up, the offline page, and every portal page (the portal layout says so too).
- **Sitemap:** home at `https://thecadpillar.com/`, matching its canonical. `lastmod` is a fixed date (`SITE_CONTENT_UPDATED` in `app/sitemap.ts`); move it forward when website content changes.

## Owner steps

### 1. Vercel: make www → apex permanent (2 minutes)
Vercel → Project **tcp** → Settings → **Domains** → `www.thecadpillar.com` → Edit → Redirect to `thecadpillar.com` with **308 Permanent Redirect** → Save. Leave `thecadpillar.com` as the primary domain.
Also confirm Settings → Environment Variables → Production has `NEXT_PUBLIC_SITE_URL = https://thecadpillar.com`.

### 2. Google Search Console: verify the domain (DNS, recommended)
1. Open https://search.google.com/search-console → **Add property** → **Domain** → `thecadpillar.com` → Continue.
2. Copy the TXT value Google shows (`google-site-verification=…`).
3. Vercel → **Domains** → `thecadpillar.com` → DNS Records (the domain uses Vercel's nameservers) → **Add**: Name `@`, Type `TXT`, Value the copied text → Save.
4. Back in Search Console → **Verify** (DNS can take a few minutes; retry if it fails at first).

This covers `https://`, `http://` and `www` in one property.

*Alternative (URL-prefix property `https://thecadpillar.com/`, HTML tag method):*
1. Copy the `content` value from Google's meta tag.
2. In Vercel → Environment Variables (Production), set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to that value.
3. Redeploy, then press Verify.

### 3. Submit the sitemap
Search Console → **Sitemaps** → enter `https://thecadpillar.com/sitemap.xml` → **Submit**. Expect "Success" with 11 discovered pages.

### 4. Ask Google to crawl the key pages now
Search Console → **URL inspection**:
1. Paste `https://thecadpillar.com/`.
2. Run **Test live URL**. Check "URL is available to Google".
3. Open **View tested page → More info**: the structured data should show WebSite and Organization.
4. Press **Request indexing**.

Repeat for `/jewelry-cad` and `/pricing`.

### 5. Validate the structured data
https://search.google.com/test/rich-results → `https://thecadpillar.com/` → should list "Organization" with no errors. (WebSite site-name data is not a rich result, so it shows under the full schema at https://validator.schema.org.)

### 6. Switch Clerk to production keys
Clerk dashboard → create the Production instance for `thecadpillar.com` (DNS records it asks for go in Vercel DNS). Then replace `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` in Vercel Production with the `pk_live_` / `sk_live_` keys and redeploy. This is a sign-in matter, not an indexing one.

## What to expect, and what moves it further

- **New site, branded query.** Once the sitemap is processed, "thecadpillar" and "The CAD Pillar" usually show the home page within days to a few weeks. The site name in results ("The CAD Pillar" instead of the domain) can take longer.
- **"The CAD Pillar jewelry CAD"** matches the home title and /jewelry-cad.
- **The biggest lever outside the code is links and mentions that name the brand:**
  - a Google Business Profile, if you have an address to list;
  - LinkedIn and Instagram company pages that link to https://thecadpillar.com.
  Add those profile URLs to `sameAs` in `lib/seo.ts` once they exist.
- **Checking progress:** Search Console → Performance → Queries, filtered to "cad pillar".
