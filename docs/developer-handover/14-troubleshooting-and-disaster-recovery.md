# Troubleshooting and disaster recovery

The first part is a symptom-first troubleshooting guide. The second covers disaster recovery: what can be lost, how it is restored, and who does what. Commands that touch production are marked **(owner)**.

## First moves for any incident

1. **Is it the whole site or one feature?** Open `https://thecadpillar.com/api/health` (configuration) and a public page (hosting).
2. **What changed?** Vercel → Deployments (the latest deploy and its time); GitHub → merged pull requests; any migration applied today; any provider setting changed (Clerk, Supabase, Razorpay, DNS).
3. **Roll back first, investigate second.** If a deploy is the likely cause, Vercel → the previous good deployment → **Promote to Production**. That takes seconds and is safe.
4. **Look at the logs:** Vercel → Logs → Level: Error, around the time reported; Supabase → Logs (API, Postgres).
5. **Write down what you saw and did**, in the pull request or incident note, for the post-incident review.

## Troubleshooting by symptom

| Symptom | Likely cause | Check | Fix |
|---|---|---|---|
| Signed-in pages load but show no data | Supabase third-party auth domain does not match the Clerk instance; or `CLERK_JWT_ISSUER` is wrong | Supabase → Authentication → Third-Party Auth; Vercel variables | Set the domain to `https://clerk.thecadpillar.com`; redeploy (`docs/CLERK-PRODUCTION.md`) |
| Everyone lands on onboarding or `/welcome` as a new client | Their Clerk id has no `users` row (for example after an instance change) | `db/ops/clerk-switch-health.sql` (read-only) | Run the remap or clean-up from `db/ops` with a dry run first **(owner)** |
| "Development mode" badge, or a 100-user cap | Production deploy uses the development Clerk key | Page source contains `pk_test_` | Set the production keys on the **Production** environment; redeploy without the build cache |
| "Access blocked: missing client_id" on Google sign-in | Production Clerk has no custom Google credentials | Clerk → SSO → Google | Add the Google OAuth client ID and secret (chapter 11) |
| A sign-in code never arrives | Spam filtering; an Apple private-relay address; Clerk mail DNS | Clerk → Domains (all verified); the user's spam folder | Add the person's real email in Clerk; fix email DNS (SEC-07) |
| `/api/health` returns 503 | A required configuration group is missing | The response names the group | Add the variable in Vercel (Production); redeploy |
| Payment taken but the order still unpaid | Webhook failing: wrong secret, Deployment Protection on, or the URL changed | Razorpay → Webhooks → delivery logs; `npm run verify:delivery` | Fix the secret or URL; turn off protection for Production; replay the webhook (idempotent) |
| Webhook returns 401 | Signature mismatch | Is `RAZORPAY_WEBHOOK_SECRET` identical in Razorpay and Vercel? | Make them match exactly; redeploy |
| Payout stuck "in flight" | Lost transfer response | `stale_payouts` | The payout worker asks Razorpay and records the result; check the Razorpay dashboard |
| Push and emails not sending | Scheduler not running, or `CRON_SECRET` mismatch (404) | GitHub → Actions → push-dispatch logs | Re-sync `CRON_SECRET` in GitHub secrets and Vercel; re-run the workflow |
| Emails go to the test inbox | `EMAIL_DELIVERY` is not `live` | Vercel variables | Set `EMAIL_DELIVERY=live` when approved |
| SLA misses never flagged | `pg_cron` disabled | Supabase → Extensions; `select * from cron.job` | Enable `pg_cron`; run the schedule statement from `0040_quote_sla.sql` **(owner)** |
| Chat does not update live | Realtime off, or a channel policy missing | `NEXT_PUBLIC_CHAT_REALTIME`; Supabase Realtime settings | Set the flag; apply migration 0052 policies; the page still polls the stamp endpoints as a fallback |
| A file download gives 404 | Not permitted in this state (for example a client before approval), or the object is missing | The order status and the caller's role; Storage object key | Expected behaviour, or re-upload the version |
| Upload refused "type does not match" | The file's real signature is not the declared type | Open the file locally | Export the correct format (PNG/JPEG, real STL or 3DM) |
| Pages slow (over 1 s) | Function region far from the database | Vercel → Functions region vs Supabase region | Co-locate (`docs/DEPLOY.md` §2b) |
| Search Console "Redirect error" | Unknown paths redirected by middleware | `curl -I` an unknown path should give 404 | Already fixed by `skipsClerk`; validate the fix in Search Console |
| CI database tests fail locally | Test Postgres not running | `docker ps`, port 5433 | `npm run test:db:up` |
| "REFUSING TO RUN … not a local database" | `DATABASE_URL` exported in your shell | `echo $DATABASE_URL` | `unset DATABASE_URL`; this guard protects production |
| Audit chain invalid | Tampering or manual edits | `SELECT audit.verify_chain();` shows `broken_at` | Treat as a security incident (below) |

## Disaster recovery

### What we must be able to recover

| Asset | Where | Recovery source | Target |
|---|---|---|---|
| Application code | GitHub | Any clone; Vercel keeps every deployment | Minutes |
| Configuration and secrets | Vercel, GitHub secrets, provider dashboards | The owner's password manager (keep an encrypted, up-to-date list of variable names and where each value comes from) | Hours |
| Database (orders, money, identities, audit) | Supabase Postgres | Supabase backups / point-in-time recovery (**plan-dependent, SEC-02**); exports | RPO ≤ 24 h (daily backup) or minutes (PITR); RTO ≤ 4 h |
| Files (deliverables, documents) | Supabase Storage | Storage is **not** covered by database backups. Periodic copy to an external bucket (roadmap). | RPO ≤ 7 days today; target 24 h |
| Sign-in accounts | Clerk | Clerk keeps them. Ids are mirrored in `users`. | Provider SLA |
| Payment records | Razorpay plus the ledger | Razorpay dashboard and exports reconcile the ledger | Hours |

RPO is the recovery point objective: how much data may be lost. RTO is the recovery time objective: how long recovery may take.

### Scenario playbooks

**A. A bad deploy breaks the site.** Promote the previous deployment (seconds). Open a fix pull request. No data risk.

**B. A bad migration damaged data (owner).**
1. Stop writes if the damage is spreading: put the site in maintenance mode by promoting a deployment that shows the offline page, or pause the relevant feature flag.
2. Identify the time just before the migration (`schema_migrations.applied_at`).
3. With PITR: restore into a **new** project at that time, export the affected tables, compare, and repair production with a reviewed migration. Without PITR: the same, from the latest daily backup. Changes since then must be reconciled from the audit log and Razorpay.
4. Verify: `audit.verify_chain()`, the money conservation queries, the role walkthrough.

**C. The Supabase project is lost or unavailable for a long time (owner).**
1. Create a new project in the same region; restore the latest backup.
2. Re-apply grants and settings: third-party auth (Clerk domain), exposed schemas (`public, graphql_public`), Realtime, `pg_cron`, Storage buckets (`order-files`, `designer-application-files`, `designer-documents`, all private).
3. Restore Storage objects from the external copy.
4. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel; redeploy.
5. Run `npm run db:status` against the new database to confirm every migration is recorded.

**D. A secret is leaked (owner).**

| Secret | Rotate at | Then |
|---|---|---|
| Supabase service-role key or JWT secret | Supabase → API settings | Update Vercel; redeploy. The old key stops working at once. |
| Database password | Supabase → Database | Update local `.env.local` only |
| `CLERK_SECRET_KEY` | Clerk → API keys | Update Vercel; redeploy |
| Razorpay key secret or webhook secret | Razorpay dashboard | Update Vercel (and the webhook config); redeploy |
| `CRON_SECRET` | Generate new (`openssl rand -hex 32`) | Update Vercel **and** the GitHub secret |
| VAPID keys | Generate new | Update Vercel; existing push subscriptions must re-subscribe |
| `RESEND_API_KEY` | Resend | Update Vercel |

After rotating, review the logs for use of the old secret. Record the incident.

**E. Suspected data breach or anonymity breach.**
1. Contain: revoke the involved accounts (`set_user_status`); rotate the secrets involved.
2. Preserve evidence: export the relevant audit log range and Vercel and Supabase logs. Do not edit rows.
3. Assess what identities or files were exposed, using the audit log (identity reads are logged).
4. Notify affected clients and designers as required by contract and law (India's DPDP Act 2023; clients' jurisdictions). Get legal advice.
5. Fix the root cause in a reviewed pull request with a test that would have caught it.

**F. Clerk outage.** Sign-in is unavailable; nothing is lost. Communicate through WhatsApp support. Do not switch instances during an outage.

**G. Domain or DNS problem.** Check Vercel → Domains (valid configuration) and GoDaddy (nameservers `ns1/ns2.vercel-dns.com`, domain not expired; keep auto-renew on).

### Restore drill (quarterly)

1. Create a scratch Supabase project.
2. Restore yesterday's backup into it, or `pg_dump` and restore.
3. Point a local copy of the app at it with development Clerk keys, and confirm orders, files and the audit chain read correctly.
4. Record the times taken (actual RTO) and any gaps. Delete the scratch project.

### Recommended backup improvements

- A paid Supabase plan with daily backups; PITR when justified (SEC-02).
- A weekly encrypted `pg_dump` to storage the company controls, in a separate account.
- A nightly copy of Storage buckets to an external bucket.
- An inventory of every configuration variable (names, the provider each value comes from, who can rotate it) kept with the owner.
