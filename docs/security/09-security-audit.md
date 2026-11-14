# Security audit and vulnerability register

**Audit date:** 13 November 2026. **Code revision:** the commit named on the cover (`main` after pull request #137). **Classification:** this is the *sanitised* register, suitable for the repository. Precise evidence, verification queries and exploit preconditions for the items marked † are in a **restricted report** held by the owner outside the repository (see "Handling of sensitive findings" below).

## Summary

**No critical vulnerability was found in The CAD Pillar's own code.** The application's security design is strong and consistent: the database is the authorisation boundary, every table has RLS, every privileged function checks its caller and pins its search path, money and history are append-only, and files are cleaned and released per request.

The open risks are in three places:
- **third-party dependencies** with published advisories, including the Next.js framework;
- **infrastructure configuration** outside the code: database plan and backups, credential hygiene, email domain protection and hosting plan;
- a few **defence-in-depth gaps** worth closing.

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | (in TCP's code; one dependency advisory rated Critical upstream is assessed High in context, SEC-01) |
| High | 3 | SEC-01, SEC-02, SEC-03† |
| Medium | 5 | SEC-04, SEC-05, SEC-06†, SEC-07, SEC-08 |
| Low | 5 | SEC-09, SEC-10, SEC-11, SEC-12, SEC-13 |
| Informational | 2 | SEC-14, SEC-15 |

Severity uses impact × likelihood in TCP's context (the deployment on Vercel, which features are used, and who can reach the code path). The upstream rating is given where it differs.

## Vulnerability register

### SEC-01 · High · Next.js 15.5.19 has published security advisories

- **Area:** framework dependency (`next`).
- **Finding:** `npm audit` (13 November 2026) lists advisories affecting the installed version:
  - remote code execution in the Image Optimization API with crafted SVG or AVIF images (upstream **Critical**; fixed in 15.5.24 and 15.5.28);
  - denial of service through Server Actions (High);
  - server-side request forgery in rewrites and in Server Actions on custom servers (High);
  - cache poisoning and confusion (Moderate);
  - disclosure of internal Server Function endpoints (Moderate).
- **Context:** the application does not use `next/image`, sets no remote image patterns, and runs on Vercel on Linux, so the image-optimiser remote code execution path is unlikely to be reachable (hence High, not Critical). The Server Actions denial of service *does* apply: the portal is built on Server Actions.
- **Recommendation:** upgrade `next` (and `eslint-config-next`) to the latest 15.5.x (≥ 15.5.28) in its own pull request. Run `npm run ci` and the e2e suite, check the preview deployment, then merge. Add a weekly dependency check (Dependabot or `npm audit` in CI).
- **Effort:** small. **Owner:** developer.

### SEC-02 · High · Production database resilience (plan, backups, recovery)

- **Area:** infrastructure (Supabase).
- **Finding:** the Supabase organisation hosting the production project showed the **Free** plan at audit time. Free projects have limited or no restorable backups, no point-in-time recovery, and are paused after a period of inactivity. Payments, escrow records, designer identity records and all order history live in this one project.
- **Recommendation:** move to a paid plan with daily backups. Enable point-in-time recovery when revenue justifies it. Rehearse a restore into a scratch project (chapter 14). Confirm the project region and that `pg_cron` is enabled (SEC-14).
- **Effort:** small (billing change plus one restore drill). **Owner:** founder.

### SEC-03† · High · Credential rotation pending; an unused hosting project retains production database credentials

- **Area:** secrets management.
- **Finding:** the owner's own checklist calls for a database password reset that has not yet been done. Separately, an older, unused Vercel project still stores production database connection strings. A copy of a production credential outside the live system widens who could obtain it (anyone with access to that project, its logs or its future deployments).
- **Recommendation:** reset the database password in Supabase. Update only the places that need it (local `.env.local` for `db:apply`; the live app does not use `DATABASE_URL`). Delete the unused Vercel project, or at least its variables. Review who has access to the Vercel team and the GitHub repository.
- **Effort:** small. **Owner:** founder.

### SEC-04 · Medium · Image library `sharp` 0.34.5 bundles vulnerable decoders

- **Area:** dependency (`sharp`, libvips, librsvg, libheif).
- **Finding:** advisories rated High upstream cover the bundled libvips, librsvg and libheif (fixed in `sharp` ≥ 0.35.5). The server runs `sharp` on user-supplied images (technical-sheet panels, render composition, PDF images).
- **Context:** uploads are signature-checked as PNG or JPEG before decoding, so the SVG (librsvg) and HEIF (libheif) decoders should not be reached. Rated Medium.
- **Recommendation:** upgrade `sharp` to ≥ 0.35.5 together with SEC-01. Keep `limitInputPixels` set wherever `sharp` reads untrusted input.
- **Effort:** small.

### SEC-05 · Medium · Validation library `zod` 4.4.3: memory exhaustion on oversized collections

- **Area:** dependency (`zod`).
- **Finding:** advisory (High upstream): validating very large constrained arrays or records can exhaust memory (fixed in 4.6.6). Server Actions validate user input with zod.
- **Recommendation:** upgrade `zod` to ≥ 4.6.6. Keep explicit length caps before `.parse` on any user-supplied collection.
- **Effort:** small.

### SEC-06† · Medium (conditional) · Write-capable internal helper functions are executable by every database role

- **Area:** database grants.
- **Finding:** PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default. Several internal `app` schema helpers were never revoked, including two that **write** (queue an email, create a notification). The `app` schema must be usable by `anon` and `authenticated` because RLS policies call its helpers. So if the `app` schema were ever added to Supabase's exposed Data API schemas, these helpers would become directly callable with the public anon key. Today they are reachable only from inside other database functions and policies, provided the `app` schema is **not** exposed. That could not be verified from the code.
- **Recommendation:** in a migration, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` on every `app` function that writes or reveals another person's state. Callers are SECURITY DEFINER functions running as the owner, so nothing breaks. Then confirm in Supabase → Project Settings → Data API that the exposed schemas are only `public` and `graphql_public`. Add a test in `tests/db/` that fails if any non-read-only `app` function is executable by `anon` or `authenticated`.
- **Effort:** small (one migration and one test). A remediation migration has been drafted and tested: with it applied, all 58 database test files (607 tests) pass. It is in the restricted annex.

### SEC-07 · Medium · Email domain authentication is incomplete

- **Area:** DNS and email (Google Workspace, transactional email).
- **Finding (public DNS, 13 November 2026):**
  - **no DMARC record** at `_dmarc.thecadpillar.com`;
  - a DKIM public key is published at the domain apex instead of under its selector (for example `google._domainkey`), so receivers cannot use it;
  - SPF authorises Google only (`include:_spf.google.com ~all`);
  - no DNS records were found for the transactional email provider on the domain.

  Anyone can send email that claims to be from `@thecadpillar.com`, and legitimate mail is more likely to be filed as spam.
- **Recommendation:**
  1. In Google Admin, generate DKIM and publish it at `google._domainkey`; remove the apex copy.
  2. Verify the transactional sender domain with the email provider; add its SPF and DKIM records, ideally on a subdomain such as `send.thecadpillar.com`.
  3. Publish DMARC: start with `p=none` and reporting, then move to `quarantine`, then `reject`.
- **Effort:** small (DNS changes in Vercel DNS). **Owner:** founder.

### SEC-08 · Medium · Hosting plan and preview-environment isolation

- **Area:** infrastructure (Vercel).
- **Finding:** the team is on Vercel **Hobby**, which Vercel's terms limit to non-commercial use, and which lacks some production features, for example frequent crons, so a GitHub Actions workaround is in use. Preview deployments are built for every branch. Whether they receive the **production** Supabase URL and service-role key could not be verified. If they do, any branch's code runs with full access to production data.
- **Recommendation:** move to Vercel Pro. Give the Preview environment its own Supabase project (seeded test data), and keep production secrets scoped to the Production environment only. Restore crons to `vercel.json`. Turn on Deployment Protection for previews only, never for Production, because the payment webhook must reach it.
- **Effort:** medium. **Owner:** founder plus developer.

### SEC-09 · Low · Content-Security-Policy covers framing only

- **Finding:** the response headers are good: HSTS (two years), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`. But the CSP contains only `frame-ancestors 'self'`. There is no `script-src` or `connect-src` policy to contain a future cross-site scripting bug. React escapes output by default, and the only raw HTML is escaped JSON-LD (`components/seo/json-ld.tsx`), so the risk is low.
- **Recommendation:** add a CSP in report-only mode first: `script-src 'self'` with Clerk and Vercel allowances or nonces; `connect-src` for Supabase, Clerk and Razorpay; `img-src` for Supabase signed URLs. Review the reports, then enforce.

### SEC-10 · Low · No per-account rate limits or storage quotas for signed-in users

- **Finding:** public forms are rate-limited per network address (salted hash, `check_rate_limit`). Signed-in actions are not rate-limited. Anyone can sign up (an automatic CLIENT account) and upload reference images and attachments within the size caps. Abuse could raise storage and bandwidth costs or fill queues.
- **Recommendation:** per-account limits on uploads and orders (count and bytes per day) in the database functions; alerts on storage growth. Optionally require email verification before first upload (Clerk setting).

### SEC-11 · Low · Some public functions are executable by `anon`, but refuse anonymous callers

- **Finding:** a handful of `public` brief and reference functions (for example `add_reference_image`, `set_order_accents`) and website-form functions are executable by `anon`. The brief functions check the caller and raise `not authenticated`, so there is no exposure. This is defence in depth only.
- **Recommendation:** revoke `anon` execution on functions that need a signed-in caller. Keep it only on the deliberate public entry points (`submit_marketing_lead`, `submit_designer_application`, `start_brief_lead`, `record_marketing_event`, `check_rate_limit`, `public_stats_latest`).

### SEC-12 · Low · Build-time and development dependency advisories

- **Finding:** `postcss` 8.4.31 (inside Next.js), `nanoid` 3.3.15 and `source-map-js` 1.2.1 have advisories that affect build tooling rather than runtime requests. A further 12 moderate advisories are in development-only dependencies.
- **Recommendation:** most are resolved by the Next.js upgrade (SEC-01). Re-run `npm audit` afterwards. Track the rest in a dependency pull request.

### SEC-13 · Low · The development sign-in instance still holds copies of real accounts

- **Finding:** before the production switch, the development Clerk instance held the real staff, designer and client accounts. They remain there (emails and names), next to the test accounts that CI uses.
- **Recommendation:** delete non-test users from the development instance (keep only the `+clerk_test` accounts used by CI). That is data minimisation, in line with the Privacy page.

### SEC-14 · Informational · SLA sweep depends on `pg_cron` being enabled

- **Finding:** `sla_sweep()` flags overdue first looks and creates pending credits every minute **if** `pg_cron` is enabled; migration `0040_quote_sla.sql` schedules it only when the extension exists. Whether it is enabled in production could not be verified from the repository.
- **Recommendation:** in Supabase → Database → Extensions, confirm `pg_cron` is on and `cron.job` lists the sweep. Otherwise enable it and run the `cron.schedule` statement from the migration.

### SEC-15 · Informational · Scheduled jobs rely on best-effort GitHub Actions timing

- **Finding:** push notifications and emails are sent by a GitHub Actions workflow every five minutes. GitHub can delay schedules under load and pauses scheduled workflows on inactive repositories.
- **Recommendation:** resolved by SEC-08 (Vercel Pro crons). Until then, watch the workflow's run history weekly.

## Controls verified as effective

| Control | Evidence |
|---|---|
| RLS on every table | 69 of 69 tables have `relrowsecurity = true` (Appendix A) |
| Privileged functions are hardened | 254 SECURITY DEFINER functions, all with a pinned `search_path`; caller checks sampled in brief, file, money and admin functions |
| No direct anonymous access to the audit log | `anon` and `authenticated` have no `USAGE` on schema `audit` |
| Service role only on the server, after authorisation | `lib/supabase/admin.ts` imports `server-only`; every route handler that signs a URL first authorises through the user-scoped client or a definer function (table below) |
| Payment webhook integrity | HMAC-SHA256 over the raw body, constant-time comparison, verified before parsing, idempotency keys; a weak secret is reported by `/api/health` |
| Scheduled-endpoint authentication | Bearer secret compared in constant time over fixed-width buffers; 404 when wrong |
| Short-lived downloads | `SIGNED_URL_TTL_SECONDS = 60` |
| File sanitisation | Magic-byte checks, metadata allow-lists, 3DM rebuild, PDF cleaning (unit-tested) |
| Preview tokens | 192-bit random, stored hashed, expiring, revocable |
| Anonymity | E2E crawl `tests/e2e/anonymity.e2e.ts`; identity tables reachable only through logged functions |
| Transport and headers | HSTS (`max-age=63072000`), frame, MIME-type and referrer headers (verified live) |
| No secrets in the repository or its history | `npm run secret-scan` clean; a full-history pattern scan for Clerk, Razorpay, Supabase JWT, Postgres URL, Resend and private-key formats found nothing; only `.env.example` is tracked |
| Test isolation from production | The test harness refuses non-local databases (`assertDestroyable`) |

### Service-role usage inventory

| Location | Purpose | Guard before use |
|---|---|---|
| `app/api/files/[versionId]` and `/stream` | Sign and stream deliverables | `auth()` + `grantedObjectKey()` (RLS + `visible_orders` + download gate) |
| `app/api/reference-images/[imageId]` | Sign a reference image | `auth()` + RLS read |
| `app/api/thread-files/[fileId]` | Sign a chat attachment | `auth()` + `thread_file_for_download()` |
| `app/api/materials/[id]` | Sign a pod material | `auth()` + `pod_material_file()` |
| `app/api/designer-documents/[id]` | Sign an identity document | `auth()` + `designer_document_open()` (admins, audited) |
| `app/api/orders/[id]/certificate` and `/summary` | Sign or build documents | `auth()` + `certificate_for_download()` / `summary_sheet_data()` |
| `app/api/webhooks/razorpay` | Record payments and payout results | HMAC signature |
| `app/api/cron/emails` and `/push` | Send queued emails and pushes | Bearer `CRON_SECRET` |
| `app/p/[token]` | Read a preview by hashed token | Token hash, expiry, revocation |
| `app/(marketing)/results` | Public statistics | Read-only public function |
| `app/(marketing)/apply-designer/actions.ts` | Store portfolio files | Rate limit + submission function |
| `app/(app)/orders/fileActions.ts`, `brief/*`, `TeamClaims.tsx`, `work/[id]/review`, `orders/[id]/page.tsx` | Upload and sign order files | `auth()` + `my_work` / `job_slots` / RLS reads |
| `app/(app)/orders/paymentActions.ts` | Open a payment intent | `auth()` + `visible_orders()` |
| `app/(app)/orders/payoutActions.ts`, `lib/payouts/execute.ts` | Execute payouts | `requireFinance()` |
| `app/(app)/admin/*` (designers, emails, new-order, applications) | Documents, test emails, screenshots, portfolios | `requireAdmin` / `requireTeam` / admin-only functions |
| `app/(app)/account/page.tsx`, `lib/client/standingActions.ts`, `lib/work/*`, `lib/certificates/issue.ts`, `lib/email/dispatch.ts` | Logos, standing instructions, references, certificates, email dispatch | `auth()` + RLS reads, or system-only paths |

## Handling of sensitive findings

- The restricted report contains exact evidence: the function names and grants behind SEC-06, the names of the infrastructure items behind SEC-03, the verification queries and the remediation SQL. It is delivered to the owner directly and **must not be committed**. `.gitignore` excludes `docs/security/restricted/` as a safety net.
- Fixes are **not** made in the documentation pull request. Each should be its own pull request: dependency upgrades (SEC-01, 04, 05, 12) together; the grant hardening migration (SEC-06, SEC-11) with its test; infrastructure changes by the owner (SEC-02, 03, 07, 08, 13, 14).
- Re-run this audit after those changes, and at least quarterly. The method is in [Audit method and assumptions](./19-audit-method-and-assumptions.md).
