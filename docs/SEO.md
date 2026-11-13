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

## US search optimization (12 Nov 2026)

One PR, no page added, removed, renamed or moved (`tests/config/route-inventory.test.ts` pins the 12 website routes).

### What was wrong, measured on the live site as Googlebot

| Finding | Cause | Fix |
| --- | --- | --- |
| Unknown URLs answered **307 to clerk.accounts.dev** instead of 404 (Search Console "Redirect error") | Every path that was not a listed website page went through Clerk's middleware, and a development instance sends a first-time browser to its handshake | `skipsClerk` (`core/auth/session.ts`): a GET/HEAD of a website page **or of a path that is no route** skips Clerk and gets the real 404. Every app route, sign-in, the API and every form post still go through Clerk; the rule is the same for every visitor |
| No page had an `og:image`; X cards were `summary` | No sharing image existed | `public/og/the-cad-pillar-jewelry-cad.png` (1200 × 630, `scripts/og-image.mjs`), on every page, `summary_large_image` |
| Structured data on the home page only (WebSite, Organization) | — | Home: WebSite, Organization, **Service**, **FAQPage** (the questions shown). `/jewelry-cad` and `/pricing`: Service. `/faq`: FAQPage. Every other page: **BreadcrumbList**. One organization id throughout; no address, rating or review |
| Generic titles ("Pricing", "FAQ", "How it works", "Contact Sales"), descriptions up to 210 characters | — | Each page's own title and a description under 160 characters, around its search intent (below) |
| `/jewelry-cad` linked from nowhere (sitemap and ads only) | — | Footer → Product → **Jewelry CAD services**; the page links to how it works, pricing, quality and guarantees |
| `/jewelry-cad` 272 words, no service detail | Ads landing page | One section: CAD from sketches and photos, 3DM + STL, rendering, white-label outsourcing, working from the US (USD, portal, ET hours). Every line is an existing promise |
| 404 page offered only "Go to dashboard" (`<a><button>`, nested controls) | — | Links to the website and to the dashboard, an `<h1>`, `noindex` |

### Keyword map (one cluster per page, no overlap)

| Page | Title | Cluster |
| --- | --- | --- |
| `/` | The CAD Pillar: jewelry CAD, factory-ready in hours (unchanged) | Brand: thecadpillar, The CAD Pillar, The CAD Pillar jewelry CAD |
| `/jewelry-cad` | Custom Jewelry CAD Design Services | Jewelry CAD services, custom jewelry CAD design, 3D modeling, rendering, white-label |
| `/how-it-works` | How Jewelry CAD Outsourcing Works | Jewelry CAD outsourcing, CAD from sketches |
| `/pricing` | Jewelry CAD Pricing: From $35 a Design | Jewelry CAD pricing, cost |
| `/quality` | Jewelry CAD Quality Control, Checked Twice | Manufacturing-ready, castable CAD |
| `/guarantee` | Our Jewelry CAD Guarantees | Turnaround and spec guarantee |
| `/faq` | Jewelry CAD Services FAQ | Buyer questions: US clients, pieces, white-label, files, ownership |
| `/contact` | Contact Sales: Jewelry CAD for Your Business | Sales enquiries, retainers |
| `/apply-designer` | Apply as a Jewelry CAD Designer | Designer recruitment (kept apart from buyer intent) |

Headings (`<h1>`), navigation labels and URLs are unchanged. No search-volume figures were available, so none are claimed.

### Measured (production build, 4× CPU throttling, phone viewport, median of 3)

| Page | LCP before → after | CLS | JS |
| --- | --- | --- | --- |
| `/` | 1056 → 1000 ms | 0 → 0 | 155 kB → 155 kB |
| `/jewelry-cad` | 880 → 876 ms | 0 → 0 | 159 kB → 159 kB |
| `/pricing` | 940 → 940 ms | 0 → 0 | 145 kB → 145 kB |

No performance change was needed or made: same bundles, same static pages, no layout shift. Field data (Core Web Vitals report) comes from Search Console after release.

### Owner steps after merging

1. **Search Console → Pages → Redirect error → Validate fix.** Unknown URLs now answer 404; the public pages already answered 200.
2. **URL inspection → Request indexing** for `/`, `/jewelry-cad`, `/how-it-works`, `/pricing`, `/faq` (titles and structured data changed).
3. **Rich results test** (`https://search.google.com/test/rich-results`) on `/` and `/faq`: Organization, Breadcrumb and FAQ should parse without errors. FAQ rich snippets are shown by Google only for some sites; the data still describes the page.
4. **Switch Clerk to production keys.** `/sign-in` and `/sign-up` still pass through Clerk's development handshake (307). They are noindex, so this is not a ranking issue, but a production instance removes the redirect for everyone.
5. **Analytics:** the site has no GA4 or other third-party analytics; leads are attributed by the first-party first-touch cookie and the "How did you hear about us?" answer (Admin → Clients → Where clients come from). To add GA4, create a property, then decide on consent before adding the tag; it is a third-party script and costs page speed.
6. Add LinkedIn / Instagram / Google Business Profile URLs to `sameAs` in `lib/seo.ts` once those profiles exist.
