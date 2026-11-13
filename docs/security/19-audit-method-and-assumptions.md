# Audit method, assumptions and missing access

This chapter records how the findings in this handbook were produced, what was verified and how, what could not be verified, and why. It exists so a future reviewer can repeat the audit and knows exactly where its conclusions stop.

## Scope

- **Code:** the whole repository `simran313/GetCAD` at the audited revision (`main` after pull request #137; the short SHA is printed on the cover and in every generated appendix).
- **Database:** a database built from `db/migrations` (67 files) and `db/policies` (46 files) in a throwaway local Postgres 16. The production database was **not** connected to or queried. Production facts come from the owner's read-only health checks on 13 November 2026.
- **Live site:** public, read-only HTTP requests to `https://thecadpillar.com` (pages, headers, `/api/health`, robots, sitemap) and public DNS lookups.
- **Out of scope:** penetration testing against production, load testing, third-party providers' internal security, and legal review.

## Method

| Step | How | Output |
|---|---|---|
| Inventory | Walked `app/` for pages and route handlers; found every `"use server"` file; read `core/auth/session.ts` for guards | Appendices C and D |
| Database catalogue | Applied all migrations and policies to a scratch database and read `pg_class`, `pg_policies`, `pg_proc`, grants and triggers | Appendices A and B |
| RLS coverage | `relrowsecurity` for all 69 tables | 69/69 on |
| Definer hardening | `prosecdef` with `proconfig` containing `search_path` | 254/254 pinned |
| Grants | `has_function_privilege` / `has_schema_privilege` for `anon` and `authenticated` | SEC-06, SEC-11 |
| Caller checks | Read the source of sampled definer functions (brief, references, files, money, identity, admin) | Checks present in all sampled |
| Service-role usage | Found all 36 files that create the service-role client; read the guard before each use | Inventory table, ch. 9 |
| Webhook and cron | Read the signature and bearer checks (constant time) and their tests | Controls verified |
| Files | Read the sanitisation gate, metadata stripper, 3DM rebuild, PDF cleaner and download gate | Ch. 8 |
| Headers | `curl -I https://thecadpillar.com/` | HSTS and the other headers present; CSP framing only |
| Secrets | `npm run secret-scan`; a pattern scan of the full git history for Clerk, Razorpay, Supabase JWT, Postgres URL, Resend and private-key formats; a check of tracked env files | Clean |
| Dependencies | `npm audit --omit=dev` and `npm audit` (13 Nov 2026) | SEC-01, 04, 05, 12 |
| Email domain | Public DNS (TXT at apex and `_dmarc`, DKIM selectors) | SEC-07 |
| Remediation test | The drafted grant-hardening migration was applied as a temporary migration, and the full database test suite run (58 files, 607 tests, all passing); then removed | Restricted annex |
| Tests | `npm run ci` on the audited branch | See the verification results in the pull request |

## Verified facts (with evidence)

- All 69 tables have RLS enabled; 43 policies exist (Appendix A).
- 285 functions, 254 SECURITY DEFINER, all with a pinned `search_path` (Appendix B).
- `anon` and `authenticated` have no `USAGE` on schema `audit`.
- 73 pages, 20 route handlers, 92 server actions in 31 files (Appendices C and D).
- Signed URL lifetime 60 s; preview tokens 192-bit and hashed; webhook HMAC in constant time; cron bearer in constant time.
- Live headers include HSTS `max-age=63072000`.
- No secrets in the working tree or the git history (patterns listed above).
- Dependency advisories as listed in SEC-01, 04, 05, 12 on 13 November 2026.
- 34 configuration variable names are read by the code (Appendix E).

## Assumptions

1. The production database was built from exactly the migrations and policies in the repository, in order, with nothing changed by hand. `scripts/apply-migrations.mjs` records applied files in `public.schema_migrations`; the owner can confirm with `npm run db:status`.
2. Production uses the `tcp` Vercel project, deploying `main`.
3. Supabase Storage buckets were created private, as the code and migrations assume.
4. The owner's screenshots on 13 November 2026 show the actual current settings (Supabase plan, Vercel variables, Clerk configuration).
5. Business rules follow `docs/DECISIONS.md` v1.28 where a document and the code disagree. Where the code differs from DECISIONS, the code describes what *runs* and DECISIONS what is *intended*.

## Not verified (missing infrastructure access)

| Item | Why it matters | How the owner can verify |
|---|---|---|
| Supabase exposed Data API schemas | SEC-06 exploitability | Supabase → Project Settings → Data API → Exposed schemas = `public, graphql_public` |
| `pg_cron` enabled with the SLA sweep scheduled | SLA promise | Supabase → Database → Extensions; `select * from cron.job;` |
| Supabase backups and PITR configuration | Recovery | Supabase → Database → Backups |
| Vercel environment scoping for Preview | SEC-08 | Vercel → `tcp` → Settings → Environment Variables (Preview column) |
| Vercel function region | Performance | Vercel → `tcp` → Settings → Functions |
| GitHub branch protection and Actions secrets | Process safety | GitHub → Settings → Branches / Secrets |
| Team membership across providers | Access control | Each provider's members page |
| Razorpay live configuration and Route activation | Payments | Razorpay dashboard; `npm run verify:*` |
| Transactional email sender domain (`EMAIL_FROM`) | SEC-07 | Vercel variables; Resend → Domains |
| Live behaviour of authenticated pages under load | Performance | Not tested in this audit |

## Repeating this audit

1. Check out the revision. Run `npm ci` and `npm run test:db:up`.
2. Run `node docs/document-generation/extract-reference.mjs` and compare the summary JSON (`docs/document-generation/generated-summary.json`) with the previous run: new tables without RLS, new definer functions without `search_path`, new `anon`-executable functions.
3. Grep for `createAdminSupabaseClient` and review any new uses.
4. Run `npm audit --omit=dev`.
5. Re-check headers, DNS and the "Not verified" table with the owner.
6. Update chapter 9's register and the restricted annex. Rebuild the handbook.
