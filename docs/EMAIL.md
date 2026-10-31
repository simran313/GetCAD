# Client emails (Phase 17)

Every email is owed by a verified change in the database — a status the order
state machine reached, a clock that started, a team message — never by a page
or a button. Migration `0054_client_emails.sql` adds the triggers; each
enqueues one row in the existing outbox (`email_outbox`, 0025) with an
idempotency key, so the same event can never send twice. The dispatcher
(`lib/email/dispatch.ts`) sends right after the action has answered the
browser (`after()`), and the 5-minute sweep (`/api/cron/emails`, called by
`.github/workflows/push-dispatch.yml`) sends anything left and the reminders.
A failed send retries with backoff, up to 8 attempts (0025); each attempt is
recorded on the row (`status`, `attempts`, `last_error`, `sent_at`,
`provider_id`).

Words live in `core/email/` (`order.ts` for client order emails, `layout.ts`
for the shell). Every template, with sample data: **Admin → Settings → Email
previews** (`/admin/emails`).

## What sends what

| Event (database) | Email | CTA | Can turn off |
|---|---|---|---|
| Client creates their own account | WELCOME | Start your first design | no |
| Portal order submitted | ORDER_RECEIVED | View your order | no |
| Order quoted (each new price) | QUOTE_READY | Review and pay | no |
| Quote unpaid 24 h | QUOTE_REMINDER | Review and pay | yes (reminders) |
| Payment held | PAYMENT_RECEIVED | View your order | no |
| First-look clock starts | ORDER_CONFIRMED (with due time, ET) | Track your order | no |
| First look ready (v1) | FIRST_LOOK_READY | Review the design | no |
| Changes requested | REVISION_RECEIVED | View your order | no |
| Revised design ready (v2+) | REVISED_DESIGN_READY | Review the design | no |
| Design waiting 48 h | PREVIEW_REMINDER | Review the design | yes (reminders) |
| Design approved | DESIGN_APPROVED | View your order | no |
| Files delivered | FILES_DELIVERED | Download your files | no |
| 72 h after delivery | FEEDBACK_REQUEST | Start your next design (reply to give feedback) | yes (reminders) |
| Problem reported (disputed) | PROBLEM_RECEIVED | Open Messages | no |
| Refunded | ORDER_REFUNDED | View your order | no |
| Cancelled (not a draft) | ORDER_CANCELLED | View your order | no |
| First look missed (breached) | ORDER_DELAYED | Track your order | no |
| Late credit decided | CREDIT_DECIDED | View your order | no |
| Team writes in the client's chat | NEW_MESSAGE (max 1 per order per 30 min) | Reply | yes (messages) |

Unchanged from before: ORDER_PLACED_FOR_YOU (team-placed orders; these skip
ORDER_RECEIVED and WELCOME), designer application and contact
acknowledgements, payout sent.

**Not built, on purpose:** invoices (the app has no invoice event) and payment
failure / payment reminders beyond the quote reminder (payments, Phase 9, are
on hold). Marketing email: only the preference exists (off by default); no
marketing email is sent.

**Anonymity:** a client email's payload is built from the order and the
client's own profile only (`app.order_email_payload`); it has no designer,
pod lead or staff field. `tests/db/client_emails.test.ts` checks every payload.

## Test mode (default)

Until `EMAIL_DELIVERY=live`, **every** email — client emails and the older
ones (applications, contact form, payouts) — goes to the test inbox
(`EMAIL_TEST_TO`, default `simran@thecadpillar.com`), with the real recipient
in the subject: `[Test → client@example.com] Your quote is ready`. Nothing
reaches a client.

To see every email in a real inbox: Admin → Settings → Email previews → **Send
all to the test inbox** (admins only). Check them in Gmail, Outlook and Apple
Mail, on a phone and a computer.

## Going live (owner approval only)

1. Apply `db/migrations/0054_client_emails.sql` and
   `db/policies/0042_email_preferences_rls.sql` to production yourself.
   From then on the triggers queue emails; in test mode they go to the test
   inbox.
2. Run the system in test mode on real orders for as long as you need.
3. When approved: Vercel → `EMAIL_DELIVERY=live` → redeploy. Emails queued
   from then on go to their real recipients. (Rows already sent to the test
   inbox are not re-sent.)

To stop all client email at once: remove `EMAIL_DELIVERY` (back to test
mode) and redeploy. Nothing is lost; nothing reaches a client.
