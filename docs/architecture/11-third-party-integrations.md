# Third-party integrations

Every outside service the platform depends on: what it does for TCP, how it is connected, which settings it uses, how it fails, and what to do when it does.

## Summary

| Service | Role | Direction | Data shared | If it is down |
|---|---|---|---|---|
| Clerk | Sign-in, sessions, user accounts | App ↔ Clerk | Email, name, sign-in methods | Nobody can sign in; signed-in pages fail. The website still works. |
| Supabase | Database, file storage, realtime, scheduled SQL | App ↔ Supabase | Everything in the platform | The portal is down; the website mostly works (the `/results` page and forms fail) |
| Razorpay | Checkout (card, UPI, international); Route payouts | App ↔ Razorpay, webhook in | Amount, order reference, payment ids; payee bank linkage for Route | New payments wait; orders stay unpaid; webhooks retry later |
| Resend | Transactional email | App → Resend | Recipient email, subject, body | Emails queue in `email_outbox` and send later |
| Web Push services | Phone and browser notifications | App → push service | Short notification text, identity-free | Pushes delayed or dropped; in-app bell unaffected |
| GitHub Actions | CI; 5-minute scheduler | GitHub → app | `CRON_SECRET` bearer | CI blocked; push and email delayed until it runs |
| Vercel | Hosting, DNS, build | | Full application runtime | Site down; roll back or wait |
| Google (OAuth) | "Continue with Google" | Clerk ↔ Google | Email, name, Google id | Use email code instead |
| Google Workspace | People's mailboxes | | | Staff email only |
| WhatsApp | Support one-tap link (`wa.me`) | Link only, no API | Nothing until the person sends | Phone support |

## Clerk

- **Package:** `@clerk/nextjs` (server and client), `@clerk/backend` and `@clerk/testing` (CI, scripts).
- **Settings:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, optional `CLERK_JWKS_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL`.
- **Server use:** `auth()` and `getToken()` in pages, actions and handlers. `lib/clerk/*` looks up accounts by email (adding designers and clients) and resolves names for admins (`lib/clerk/identities.ts`, logged via `record_identity_lookup`).
- **Production instance:** created 13 November 2026. The full runbook and record are in `docs/CLERK-PRODUCTION.md`, including the account-copy script (`scripts/clerk-copy-users.mjs`), the id remap (`db/ops/clerk-id-remap.sql`) and the health check (`db/ops/clerk-switch-health.sql`).
- **Supabase link:** Supabase → Authentication → Third-Party Auth → Clerk, set to the production Frontend API domain. Clerk → Integrations → Supabase must be enabled on the production instance.
- **Failure modes:** a wrong issuer or domain makes signed-in reads return empty; a development key on production shows a "Development mode" badge and caps accounts at 100; Google sign-in without custom credentials gives "Access blocked: missing client_id".

## Supabase

- **Package:** `@supabase/supabase-js`.
- **Clients:**
  - `createUserSupabaseClient()`: the anon key plus the person's Clerk token (`lib/supabase/server.ts`);
  - `createAdminSupabaseClient()`: the service role, server only (`lib/supabase/admin.ts`);
  - a live client for Realtime in the browser, which fetches a fresh Clerk token per connection (`lib/supabase/live.ts`).
- **Settings:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; `DATABASE_URL` for migrations only (never in Vercel).
- **Storage:** three private buckets (chapter 8). Signed URLs last 60 seconds.
- **Realtime:** private channels per thread; a "changed" signal only, sent by database triggers; channel access governed by policies on `realtime.messages` (migrations `0052_chat_live.sql`, `0053_chat_receipts.sql`); switched on by `NEXT_PUBLIC_CHAT_REALTIME=1`.
- **Scheduled SQL:** `sla_sweep()` every minute through `pg_cron`, if enabled (SEC-14).
- **Failure modes:** project paused (Free plan), wrong third-party auth domain, an exposed schema list that includes `app` (SEC-06), or region far from the Vercel functions (slow pages).

## Razorpay

- **Settings:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (different from the key secret; checked by `/api/health`).
- **Checkout:** `open_payment_intent()` records an intent, the server creates the Razorpay order, and the client pays in Razorpay's own widget. TCP never sees or stores card numbers.
- **Webhook:** `POST /api/webhooks/razorpay`, HMAC-verified, with these events:
  - `payment.captured` → `confirm_payment`;
  - `payment.failed` → `fail_payment_intent`;
  - transfer processed or reversed → `record_payout_result`.
- **Payouts (Route):** Finance releases a closed order. `open_payouts_for_order` creates obligations. `lib/payouts/execute.ts` claims them (`claim_payouts`) and sends transfers with our idempotency key in the transfer notes. Results come back by webhook, or by asking Razorpay for stale payouts (`stale_payouts`). A bounced transfer becomes a ledger REVERSAL.
- **Manual payments:** an admin records Wise, PayPal or bank transfers (`mark_payment_received`).
- **Verification scripts:** `npm run verify:payment`, `verify:payout`, `verify:delivery` (see `docs/LAUNCH.md`).
- **Status:** live payments are on hold until the owner approves. Razorpay Route activation is required for payouts.

## Resend (email)

- **Settings:**
  - `RESEND_API_KEY`;
  - `EMAIL_FROM`, `EMAIL_REPLY_TO`;
  - `EMAIL_DELIVERY` (`live` sends to real recipients; anything else sends to `EMAIL_TEST_TO` with a "[Test → recipient]" prefix);
  - `EMAIL_BATCH`.
- **Flow:** events insert into `email_outbox` in the same transaction, with an idempotency key. `/api/cron/emails` (called every 5 minutes) renders templates (`core/email/templates.ts`) and sends through Resend (`lib/email/dispatch.ts`), recording attempts.
- **Templates (25):** WELCOME, ORDER_RECEIVED, ORDER_PLACED_FOR_YOU, QUOTE_READY, QUOTE_REMINDER, PAYMENT_RECEIVED, ORDER_CONFIRMED, ORDER_DELAYED, FIRST_LOOK_READY, PREVIEW_REMINDER, REVISION_RECEIVED, REVISED_DESIGN_READY, DESIGN_APPROVED, FILES_DELIVERED, FEEDBACK_REQUEST, NEW_MESSAGE, PROBLEM_RECEIVED, CREDIT_DECIDED, ORDER_CANCELLED, ORDER_REFUNDED, PAYOUT_SENT, CONTACT_RECEIVED, DESIGNER_APPLICATION_RECEIVED, DESIGNER_APPLICATION_ACCEPTED, DESIGNER_APPLICATION_REJECTED.
- **Preferences:** per person on `/account` (`email_preferences`).
- **Admin test:** Admin → Emails sends every template to the test inbox (admins only).
- **Domain:** sender domain verification and DMARC are pending (SEC-07).

## Web Push

- **Settings:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_BATCH`.
- **Flow:** people opt in on the device (`components/pwa/push-opt-in.tsx`), which stores a subscription in `push_subscriptions`. `/api/cron/push` sends pending notifications (`lib/push`, `web-push`), and the service worker (`public/sw.js`) shows them. Subscriptions that have expired are removed.

## GitHub Actions scheduler

`push-dispatch.yml` runs every 5 minutes. It calls `${APP_URL}/api/cron/push` and `/api/cron/emails` with `Authorization: Bearer ${CRON_SECRET}`. A 404 means the secret in GitHub does not match Vercel's. To move to Vercel Pro crons, delete the workflow and add `{"crons":[{"path":"/api/cron/push","schedule":"* * * * *"}]}` (plus the email path) to `vercel.json`.

## Google

- **OAuth (sign-in):** Google Cloud project "The CAD Pillar"; OAuth client "Clerk production"; redirect URI `https://clerk.thecadpillar.com/v1/oauth_callback`; consent screen published (External). No logo, to avoid brand review.
- **Search Console:** site verification by TXT record and `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`. SEO is described in `docs/SEO.md`.

## Adding a new integration: checklist

- [ ] Server-only secrets; never `NEXT_PUBLIC_` for a secret. Add the name to `.env.example` and to `/api/health` if it is required.
- [ ] Verify inbound webhooks by signature, in constant time, before parsing, and handle them idempotently.
- [ ] Queue outbound side effects in the database (an outbox) inside the business transaction; send from a worker.
- [ ] Share the minimum data. Never send counterparty identities across the anonymity wall.
- [ ] Document it here and in the privacy page's list of service providers.
