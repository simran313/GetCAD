# Performance (Phase 12)

How fast the portal and the website are, how that is measured, what was changed to make them feel instant, and what is left. Numbers come from CI (`tests/e2e/zz-speed.e2e.ts`, `tests/e2e/stack/lighthouse.mjs`), not from guesses.

## How it is measured

- **Every database call is delayed by 60 ms** at the e2e gateway (`/__latency?ms=60`). Production makes the same calls across a network, so each round that runs one after another costs a full hop. With Vercel and Supabase in the same region a hop is about 1–5 ms; across continents it is 70–250 ms.
- **The speed test runs after the journeys**, so the database holds real orders. It records:
  - **server ms**: the HTML response for a full page load;
  - **first ms**: from the press until the screen first changes (the progress bar counts);
  - **ready ms**: from the press until the new page's heading is on screen;
  - **LCP, CLS**: the browser's own Web Vitals for each load;
  - **shown / saved**: a chat message on screen as sending, then saved by the server;
  - **team → client**: from the team pressing Send to the message being on the client's open chat;
  - **INP**: the slowest press in the chat session, from Event Timing.
- **A phone pass** repeats the client pages and tabs with the CPU slowed 4×.
- **Lighthouse** runs on the home and pricing pages in mobile mode (`lighthouserc.json`).

## Budgets

| What | Budget | Why |
| --- | --- | --- |
| A press is acknowledged (first) | ≤ 100 ms | perceived as instant |
| A main tab opens (ready), seen or prefetched | ≤ 100 ms | from memory, no server round |
| A page the first time (server, at 60 ms/call) | ≤ 250 ms | at most 3 rounds plus rendering |
| Chat message shown | ≤ 100 ms | optimistic bubble |
| Chat message saved | ≤ 600 ms | one write plus the page's refresh |
| Team → client message (polling) | ≤ 3 s | 2 s poll plus refresh; < 0.5 s needs Realtime |
| INP | ≤ 200 ms (p75) | Web Vitals "good" |
| CLS | ≤ 0.1 | Web Vitals "good" |
| Website LCP (Lighthouse, mobile) | ≤ 2.5 s | Web Vitals "good"; not met yet |

## Baseline, before and after

Same CI machine and same data for both runs, at 60 ms per database call. Before = `9a898a0` (measurement only), after = `f240b98`. **first** is the first change on screen after a press; **ready** is the new page's heading. Values marked * in the before run were negative (a measurement bug fixed in `f240b98`: a change just before the press counted as its answer) and are left out.

### Moving around the portal

| What | Before first / ready (ms) | After first / ready (ms) |
| --- | ---: | ---: |
| Tab: Orders | * / 339 | 49 / 49 |
| Tab: Messages | 209 / 209 | 18 / 18 |
| Tab: Files | 20 / 637 | 22 / 22 |
| Tab: Home | 19 / 316 | 21 / 21 |
| Tab: Orders again | 19 / 339 | 20 / 20 |
| Tab: Messages again | 196 / 196 | 24 / 24 |
| Open an order from the list | * / * | 77 / 77 |
| Back to the list | 105 / 105 | 68 / 68 |
| Phone (CPU 4×): Orders | * / 370 | 100 / 100 |
| Phone (CPU 4×): Messages | 290 / 290 | 50 / 50 |
| Phone (CPU 4×): Orders again | 56 / 351 | 55 / 55 |

### Chat

| What | Before | After |
| --- | ---: | ---: |
| Message on screen (as sending) | 5–8 ms | 5–9 ms |
| Message saved | 272–300 ms | 263–358 ms |
| Team message on the client's open chat (3 samples) | 4433, 265, 4270 ms | 1396, 283, 1157 ms |
| Slowest press or key in the chat (INP) | 40 ms | 56 ms |

### Full page loads (server ms / LCP ms; CLS was 0 on every page in both runs)

| Page | Before | After |
| --- | ---: | ---: |
| client /home | 93 / 492 | 116 / 536 |
| client /orders | 89 / 476 | 94 / 524 |
| client /orders/new | 266 / 420 | 252 / 340 |
| client /messages | 177 / 268 | 171 / 252 |
| client /files | 91 / 572 | 85 / 548 |
| client /account | 314 / 424 | 223 / 340 |
| client an order | 217 / 320 | 215 / 336 |
| client a conversation | 187 / 296 | 181 / 276 |
| admin /admin, /admin/orders, an order | 109, 93, 356 | 91, 87, 346 |
| visitor /, /pricing, /how-it-works, /faq (median of 3) | 23, 13, 14, 13 | 7, 6, 6, 6 |

Full loads were not the target (each was already 2–4 rounds); they move within run-to-run noise. Files has 2 fewer rounds, but with one order in the test data the saving is small; it grows with the number of orders. Website pages now come from the build: in CI that is about 15 ms less; in production it removes a server function call on every visit, which CI cannot show.

### Lighthouse (website, simulated mid-range phone)

| Page | Before | After |
| --- | --- | --- |
| Home | 85, LCP 3.7 s | 85, LCP 3.8 s |
| Pricing | 89, LCP 3.4 s | 90, LCP 3.3 s |

Unchanged within noise. Lighthouse runs against `next start` on the CI machine, so the CDN gain does not show here; LCP is held back by a ~3 s render delay (fonts and script start-up on a throttled CPU), see item 12.

### Tests

- `npm run ci`: 985 passed.
- e2e: 37 of 37 passed, including `session.e2e.ts` (sign-out reload, double tap) and the pre-launch crawl (179 pages, no findings).

## Bottlenecks found

Ranked by measured impact.

| # | Bottleneck | Evidence | Fix | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **Functions far from the database** | Every page makes 2–4 sequential rounds of calls; Vercel defaults to iad1 (US East) | Set the Vercel function region to the Supabase region (`docs/DEPLOY.md` §2b) | None in code | **Owner** (needs the Supabase region) |
| 2 | **No page is kept in memory** | Every tab press asked the server again: ready 196–637 ms at 60 ms/call | Prefetch the main lists in full while their links are on screen; keep pages 30 s (`staleTimes`); rows load on touch (`IntentLink`) | Stale data for up to 30 s on a page someone else changed. Mitigated: any server action clears the memory, the order and chat pages keep polling, and sign-out reloads the page | Done |
| 3 | **Sign-out moved in-app** | The new e2e test failed on the code before this change: the page set before sign-out survived it | Sign-out ends with a full page load (`components/auth/sign-out.tsx`) | None | Done |
| 4 | **Chat is polled every 5 s** | Team → client: 4.4 s, 0.3 s, 4.3 s | An open conversation asks every 2 s, and at once on focus | 2.5× more of one small request per open chat | Done. Realtime signals built (Phase 13, `0052_chat_live.sql`); on once set up (`docs/DEPLOY.md` §2c) |
| 5 | **The website rendered on every visit** | Header called `auth()`; every page was ƒ (dynamic); TTFB 460 ms in Lighthouse | Signed-in or not read in the browser from Clerk's `__client_uat` cookie; pages are static (○) | A signed-in visitor sees the signed-out buttons for one frame | Done |
| 6 | **Files: 5 sequential rounds plus one call per order** | Code: role → orders → specs → versions → fingerprints | 3 rounds (role and orders together; fingerprints with versions) | None | Done. The per-order calls need a batched function (below) |
| 7 | **Double tap could create two drafts** | Tiles on New order were plain submit buttons | `SubmitPlain`: disabled and busy while the action runs | None | Done |
| 8 | **Hydration error #418 on admin pages** | CI log, 11b | Countdown and timer accept that the server and browser clocks differ | None | Done in 11b |
| 9 | **Most pages read the role before anything else** | One extra round per page | The role is in the database only; moving it into the Clerk session would save the round | Auth change | Not done (approval) |
| 10 | **Lists load every order** | `visible_orders()` has no limit; `.in("order_id", ids)` grows with the list | Paging or a cursor | URL length breaks at roughly 600 orders | Not done (later) |
| 11 | **No timeout on database calls** | A hung database holds the page until the platform's limit | Timeouts on reads only (a timed-out write may still commit) | Wrong error on a slow-but-successful write | Not done (recommendation) |
| 12 | **Website LCP 3.4–3.7 s on a simulated mid phone** | Lighthouse: render delay about 3 s after TTFB | Static pages remove most TTFB in production; the rest is fonts and script start-up | Design sign-off for font loading | Partly (static) |

Checked and fine: bundle sizes (102 kB shared; three.js loads only on the preview page), the service worker (static files only, never page data), indexes on the hot tables (messages, threads, notifications, orders), chat's optimistic send with Retry.

## What needs an owner decision

1. **Vercel region = Supabase region.** The single biggest lever; no code.
2. **Live chat through Supabase Realtime**: built in Phase 13 (an empty "thread changed" signal on each thread's private channel; only people who may read the thread can join). Off until the migration is applied and `NEXT_PUBLIC_CHAT_REALTIME=1` is set (`docs/DEPLOY.md` §2c). Expected delivery under 0.5 s; CI has no Realtime server, so it is measured after it is switched on.
3. **Safe Retry in chat.** A message the server saved but whose reply was lost is sent twice on Retry. Needs a client message id with a unique constraint (migration).
4. **Batched fingerprints for Files** (one database function instead of one call per order; migration).
5. **Paging for order lists** before any client passes a few hundred orders.
6. **Showing why an action was refused** in production (11c: actions return the reason instead of throwing it).

## Next steps, in order

1. Owner: set the Vercel region (minutes; largest gain).
2. Owner: approve Realtime for chat (item 2) and safe Retry (item 3); one PR each.
3. 11c: refusals show their reason.
4. Paging and the batched Files call when data volume calls for them.
