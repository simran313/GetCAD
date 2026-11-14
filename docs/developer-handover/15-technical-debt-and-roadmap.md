# Technical debt and scalability roadmap

An honest list of what should be improved, why, and in what order. Items are grouped by horizon. Each has an effort estimate: **S** is under a day, **M** a few days, **L** a week or more.

## Current scale and headroom

| Dimension | Today | Comfortable limit of the current design | First bottleneck |
|---|---|---|---|
| Accounts | 26 real (plus tests) | Thousands | Admin screens that list everyone without pagination |
| Orders | Tens per month | Tens of thousands per month | Visibility functions that compute per row; missing indexes on hot filters |
| Files | MB to GB | Hundreds of GB on a paid Supabase plan | Storage cost; no lifecycle rules |
| Concurrent users | Low | Hundreds | Database connections from serverless functions (use the pooler); Realtime channel count |
| Scheduled work | Every 5 minutes (GitHub Actions) | Fine for notifications | SLA precision depends on `pg_cron` |

The architecture (stateless serverless functions plus Postgres) scales well vertically. The practical limits are database plan size, connection pooling and query cost, not the code structure.

## Now (next 30 days)

| # | Item | Why | Effort |
|---|---|---|---|
| 1 | Upgrade `next`, `sharp` and `zod` (SEC-01, 04, 05, 12) | Published advisories | S |
| 2 | Grant-hardening migration and test (SEC-06, SEC-11) | Defence in depth; closed-by-default functions | S |
| 3 | Supabase paid plan; restore drill (SEC-02) | Recoverability | S |
| 4 | Rotate the database password; remove the unused Vercel project (SEC-03) | Credential hygiene | S |
| 5 | DMARC, DKIM and the transactional sender domain (SEC-07) | Deliverability; anti-spoofing | S |
| 6 | Vercel Pro; separate preview database; crons back in `vercel.json` (SEC-08, SEC-15) | Terms, isolation, reliable schedules | M |
| 7 | Confirm `pg_cron` and the SLA sweep schedule (SEC-14) | SLA promise depends on it | S |
| 8 | Automated dependency updates (Dependabot or Renovate) and `npm audit` in CI | Catch advisories early | S |

## Next (one to three months)

| # | Item | Why | Effort |
|---|---|---|---|
| 9 | Error tracking (for example Sentry) and uptime monitoring with alerts | Today errors are found by reading Vercel logs | S |
| 10 | Content-Security-Policy, report-only then enforced (SEC-09) | XSS containment | M |
| 11 | Per-account rate limits and storage quotas (SEC-10) | Abuse and cost control | M |
| 12 | Nightly copy of Storage buckets to external storage | Files are not in database backups | M |
| 13 | Pagination and server-side filtering on admin lists (users, orders, leads) | Growth | M |
| 14 | Index review using `pg_stat_statements` on production; add indexes for hot filters (status, pod_id, client_id, created_at) | Query cost at scale | M |
| 15 | Connection pooling check (Supabase pooler for serverless) | Connection exhaustion under load | S |
| 16 | Branch protection on `main` (required checks, no force push) | Process safety | S |
| 17 | Remove real accounts from the development Clerk instance (SEC-13) | Data minimisation | S |

## Later (three to twelve months)

| # | Item | Why | Effort |
|---|---|---|---|
| 18 | Move business rules that live in both TypeScript and SQL to one place, with generated types (for example from the database schema) | Fewer drift bugs; tests already guard several pairs | L |
| 19 | Generated Supabase types for every RPC (`supabase gen types`) | Type safety at the boundary | M |
| 20 | Storage lifecycle: archive old versions to cold storage | Cost | M |
| 21 | Wallet, plans and in-app payouts out from behind flags (§12) | Revenue features | L |
| 22 | PayPal and Wise integrations (§13, last build phase) | Payment options | L |
| 23 | Read replicas or materialised summaries for pod performance reports | Report speed at scale | M |
| 24 | Multi-region or a status page | Customer trust at scale | M |
| 25 | Dental brand (separate product, January 2027 per DECISIONS) | Out of scope for this codebase | — |

## Known debt in the codebase

| Debt | Where | Notes |
|---|---|---|
| Superseded documents | `docs/SYSTEM.md`, `docs/TCP-BUILD-SPEC.md` | Marked "superseded where they disagree with DECISIONS". Keep them historical; this handbook and DECISIONS are current. |
| Two sources for some rules | `core/` and SQL (for example payout maths, slot kinds) | Pairs are cross-checked by tests; prefer one source when touching them |
| Scheduler workaround | `.github/workflows/push-dispatch.yml` | Remove on Vercel Pro |
| Legacy deliverable slots | Ten view slots before 1 November 2026 | Still readable on old versions; no new uploads |
| Large page components | Some order and work pages | Split when next touched; keep Server Components thin |
| Manual production migrations | `npm run db:apply` by the owner | Deliberate for safety; consider a gated "apply migrations" workflow with manual approval later |

## Principles for future work

- Keep the database as the security boundary. New features add functions and policies first, UI second.
- Prefer append-only records for anything with money, identity or legal weight.
- Every new external dependency needs an owner, a failure mode and a line in chapter 11.
- Measure before optimising (`tests/e2e/zz-speed.e2e.ts`, `docs/PERFORMANCE.md`).
