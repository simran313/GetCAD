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

## What is covered (8a)

- `00-setup` — Clerk session tokens carry `role: authenticated`; a signed-in page reads the database.
- `anonymity` — signed in as the designer, crawl every reachable page; no client identifier in any HTML or RSC/JSON response; two jobs of one client share nothing a job of another client does not.
- `journey` — client brief → admin quote, payment, confirm → pod lead assigns → designer v1 → QC send-back → designer v2 → QC measures and passes → client approves → STL and certificate download.

Phase 8b adds: the on-behalf WhatsApp order, SLA credit, spec claim, preview link, website → sign-up, and the acceptance re-runs.
