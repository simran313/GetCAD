# End-to-end tests (Phase 8)

Real browser (Playwright, Chromium) against a real production build.

| Piece | What runs |
| --- | --- |
| Database | the throwaway Postgres (CI service; locally `127.0.0.1:5433`), rebuilt from every migration and policy |
| API | PostgREST v12 from its official Docker image, as on Supabase |
| Gateway | `stack/gateway.mjs` on `:54321`: `/rest/v1` → PostgREST, `/storage/v1` → a small file store on disk (service-role only, signed download links) |
| App | `next build` + `next start` on `:3100` |
| Sign-in | the Clerk **development** instance, via `@clerk/testing` sign-in tokens |

`prepare.ts` creates one Clerk test user per persona (`e2e-…+clerk_test@getcad.dev`; Clerk sends no mail to `+clerk_test` addresses), gives each its role here (admin, pod lead, designer, two clients), and seeds the orders the anonymity crawl reads. PostgREST trusts Clerk's signing keys plus a key made for the run that signs the local anon and service-role keys.

## Run it

Needs Docker (for PostgREST) and the Clerk development keys:

```
export CLERK_SECRET_KEY=sk_test_…              # development instance only
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
npm run test:db:up                              # throwaway Postgres on :5433
npm run e2e                                     # prepare → PostgREST → build → tests
```

Live keys are refused. `DATABASE_URL` must point at a local database (the same guard as the DB tests).

## What is covered

Specs run in file-name order, one at a time, on one database.

- `00-setup` — Clerk session tokens carry `role: authenticated`; a signed-in page reads the database.
- `anonymity` — signed in as the designer, crawl every reachable page; no client identifier in any HTML or RSC/JSON response; two jobs of one client share nothing a job of another client does not.
- `journey` — client brief → admin quote, payment, confirm → pod lead assigns → designer v1 → QC send-back → designer v2 → QC measures and passes → client approves → STL and certificate download; the certificate's text has all 19 ticks and the measured specs (A9.1). Leaves the order id in `.e2e/journey.json`.
- `money` (8b) — a missed first look is credited once: sweep run twice, decided twice (Spec §12.3, A9.7); designer and QC pay by category and price, and the 40 % warning (Spec §12.8, A9.6).
- `on-behalf` (8b) — a WhatsApp order entered by the admin: refused without a screenshot, visible to the client, clock from payment (Spec §12.6); one minute over the shift is refused to the pod lead and allowed to an admin with a reason (Spec §12.4).
- `post-delivery` (8b) — on the journey's order: release the files; the preview link (logo, nothing of ours, off/expired/made-up links "not available", only this order's files; A9.4); spec claims (edited file not covered, delivered file open, upheld credits once, the button gone after the window; A9.5); the weight sheet's 5 alloys follow the densities on the Settings screen (A9.3).
- `website` (8b) — every website page loads with UTM tags; a new jeweler from a campaign signs up (a Clerk user made by Clerk's API, deleted after the run), must answer "How did you hear about us?" (browser and server), and the campaign is saved with the answer (A9.8); their first design is $49, the next $55 (A9.6).

What these tests do in the database directly (`db.ts`), and nothing more: make a submitted brief as the client (the brief screens are driven in `journey`), move one order's deadline or one link's end date into the past instead of waiting, run the SLA sweep as the server does, and read back counts a screen only implies.

Settings the tests change on the Settings screen (claim window, a density, shift minutes, capacity blocking) are put back at the end of each test, pass or fail.

Not driven here: Clerk's own sign-up form (its bot check and email code are Clerk's), the Spec §12.7 messaging split (a designer has no screen that can post to the client's thread; the database test covers it) and payment providers (Phase 9).
