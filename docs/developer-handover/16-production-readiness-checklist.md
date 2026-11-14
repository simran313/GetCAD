# Production readiness checklist

Use this before launch campaigns, after major releases, and quarterly. Each item has a status as of the audit (13 November 2026): ✅ done and verified, ⚠️ open or needs action, ❔ not verifiable from the repository (the owner must confirm).

## Security

| # | Item | Status | Reference |
|---|---|---|---|
| 1 | RLS enabled on every table | ✅ 69/69 | Appendix A |
| 2 | Every SECURITY DEFINER function pins `search_path` and checks its caller | ✅ 254/254 pinned; caller checks sampled | Appendix B, ch. 9 |
| 3 | Internal write helpers not executable by `anon`/`authenticated` | ⚠️ | SEC-06 |
| 4 | Exposed Data API schemas are only `public, graphql_public` | ❔ | SEC-06 |
| 5 | No secrets in the repository or its history | ✅ | ch. 9 |
| 6 | Dependencies free of High/Critical advisories | ⚠️ | SEC-01, 04, 05 |
| 7 | HSTS and security headers | ✅ | ch. 9 |
| 8 | Content-Security-Policy beyond framing | ⚠️ | SEC-09 |
| 9 | Webhook signature verification and idempotency | ✅ | ch. 7 |
| 10 | Cron endpoints secret-protected | ✅ | ch. 7 |
| 11 | Downloads authorised per request, links ≤ 60 s | ✅ | ch. 8 |
| 12 | Credentials rotated; no stray copies | ⚠️ | SEC-03 |
| 13 | Anonymity e2e crawl green | ✅ (CI) | `tests/e2e/anonymity.e2e.ts` |

## Identity and access

| # | Item | Status | Reference |
|---|---|---|---|
| 14 | Clerk production instance with own domain | ✅ | `docs/CLERK-PRODUCTION.md` |
| 15 | Google sign-in with company-owned credentials | ✅ | ch. 11 |
| 16 | Supabase third-party auth points at production Clerk | ✅ | Health check after the switch |
| 17 | Development Clerk instance holds test users only | ⚠️ | SEC-13 |
| 18 | Team access reviewed (Vercel, GitHub, Supabase, Clerk, Razorpay) | ❔ | ch. 13 |

## Data and recovery

| # | Item | Status | Reference |
|---|---|---|---|
| 19 | Paid Supabase plan with daily backups | ⚠️ (Free at audit) | SEC-02 |
| 20 | Restore drill done in the last quarter | ⚠️ | ch. 14 |
| 21 | Storage buckets copied off-site | ⚠️ | ch. 14 |
| 22 | Audit chain valid (`audit.verify_chain()`) | ✅ (checked after the Clerk switch) | ch. 5 |
| 23 | `pg_cron` enabled with the SLA sweep scheduled | ❔ | SEC-14 |

## Infrastructure and operations

| # | Item | Status | Reference |
|---|---|---|---|
| 24 | Vercel plan appropriate for commercial use | ⚠️ (Hobby) | SEC-08 |
| 25 | Preview deployments isolated from production data | ❔ | SEC-08 |
| 26 | Function region co-located with the database | ❔ | ch. 10 |
| 27 | Scheduler running (push and email every 5 min) | ✅ (workflow present) | ch. 10 |
| 28 | Error tracking and uptime alerts | ⚠️ (none) | ch. 15 |
| 29 | Branch protection on `main` | ❔ | ch. 10 |
| 30 | `/api/health` all groups true | ✅ (13 Nov 2026) | ch. 7 |

## Email and domain

| # | Item | Status | Reference |
|---|---|---|---|
| 31 | SPF covers every sender | ⚠️ (Google only) | SEC-07 |
| 32 | DKIM at the correct selector | ⚠️ (misplaced at apex) | SEC-07 |
| 33 | DMARC published | ⚠️ (missing) | SEC-07 |
| 34 | `EMAIL_DELIVERY=live` (when approved) | ❔ | ch. 11 |

## Payments

| # | Item | Status | Reference |
|---|---|---|---|
| 35 | Razorpay live keys and webhook secret distinct and strong | ❔ (payments on hold) | `docs/LAUNCH.md` |
| 36 | Razorpay Route activated for payouts | ❔ | ch. 11 |
| 37 | `verify:payment`, `verify:payout`, `verify:delivery` pass against production | ❔ | `docs/LAUNCH.md` |

## Product walkthrough (after each release, about 15 minutes)

- [ ] Website: home, pricing, an unknown URL gives 404, `/sitemap.xml`.
- [ ] Sign in as admin (email code and Google): the admin home shows the pipeline.
- [ ] Client: create a draft brief with a reference image; cancel it.
- [ ] Designer: the work list shows assigned jobs; the job page opens; the STL viewer loads.
- [ ] Pod lead: the board and performance pages load; an export downloads.
- [ ] Chat: a message from one side appears on the other without refresh.
- [ ] Downloads: a permitted file downloads; a forbidden one gives 404.
- [ ] `/api/health`: every group true.
- [ ] Vercel logs: no new errors.
