# Phase 8a rollout — browser tests

What ships: a second automatic check on every PR, **e2e**, that drives the real app in a browser — a client orders, the team quotes and assigns, the designer works, QC sends back then passes, the client approves and downloads — and proves a designer can never see or link a client.

Nothing changes for users. No database change; no `db:apply` this time.

## 1. One-time setup (before merging)
1. Clerk dashboard → your **development** instance (the one previews use).
   - It must be the one linked to Supabase (Supabase → Authentication → Third-Party Auth → Clerk). The tests check that Clerk's session token carries `role: authenticated`; if the first check fails on that, turn on Clerk's Supabase integration for this instance.
2. Clerk → **API keys**: copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
3. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `E2E_CLERK_PUBLISHABLE_KEY`
   - `E2E_CLERK_SECRET_KEY`

The tests create five test users in that Clerk instance (emails `e2e-…+clerk_test@getcad.dev`) and reuse them on every run. They receive no email.

## 2. Merge
Merge when **both** `verify` and `e2e` are green. `e2e` takes about 10 minutes.

## 3. If e2e fails
Open the failed run → **Artifacts → playwright-report**: a step-by-step trace with screenshots of where it stopped.
