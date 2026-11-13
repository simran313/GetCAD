# Switching Clerk to production (with existing accounts)

The site signs people in with a Clerk **development** instance. A
**production** instance is a separate list of accounts: the same person gets
a new Clerk user id there. The database keys everyone by that id (`users.id`,
63 foreign keys, plus plain columns such as `orders.designer_id` and
`messages.sender_id`). So the switch has two parts: create everyone's account
on production, then move the database from the old ids to the new ones. Both
are done by two tested tools:

| Tool | What it does | Touches |
|---|---|---|
| `scripts/clerk-copy-users.mjs` | Creates each development account on production (same email and name, no password), writes the old id to new id list and a filled-in remap SQL | Clerk production (only with `--apply`); never the database |
| `db/ops/clerk-id-remap.sql` | Moves every reference from old id to new id in one all-or-nothing statement. Dry run by default. Audit history is left as it was; the move is recorded in the audit log. | The database, once, by you, in the Supabase SQL Editor |

Tested by `tests/db/clerk_id_remap.test.ts`: every reference moves (bank
details, identity documents, roles, pods, jobs, chat), no trigger fires (no
email, notification or state change), the audit chain still verifies, the
person sees their data under the new id, and a wrong list is refused whole.

Keys are typed only into your own terminal and the dashboards. Never paste a
key, a database URL or the id list into a chat or a ticket.

## Before the day (no effect on the live site)

1. **Create the production instance.** Clerk dashboard → instance switcher at
   the top → *Create production instance* → *Clone development instance
   settings*. Domain: `thecadpillar.com`.
2. **DNS.** Clerk → *Domains* lists about five CNAME records. Add them at your
   DNS provider exactly as shown. On Cloudflare set each to *DNS only* (grey
   cloud). Wait until Clerk shows every record verified and the certificates
   issued (minutes to 24 hours).
3. **Sign-in methods.** Clerk → *User & authentication*: turn on *Email
   verification code* as a way to sign in. Copied accounts have no password;
   people sign in with a code (or use *Forgot password* to set one). If you
   offer Google sign-in, production needs your own Google OAuth client ID and
   secret (Google Cloud Console, with the redirect URI Clerk shows); the shared
   development credentials do not work on production.
4. **Supabase link.** Clerk (production) → *Integrations* → *Supabase* →
   enable. Note the Clerk domain it shows: `https://clerk.thecadpillar.com`.
5. **Copy the accounts (plan only).** On your own computer, in this
   repository (Node 18 or later):
   ```bash
   CLERK_DEV_SECRET_KEY=sk_test_... CLERK_PROD_SECRET_KEY=sk_live_... node scripts/clerk-copy-users.mjs
   ```
   Keys: Clerk → *API keys*, in each instance. It lists who it would create
   and changes nothing. Check the list: staff and designers must all be there.
6. **Vercel.** Settings → Environment Variables, **Production only** (leave
   Preview on the development keys):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
   - `CLERK_SECRET_KEY` = `sk_live_…`
   - `CLERK_JWT_ISSUER` = `https://clerk.thecadpillar.com`
   - `CLERK_JWKS_URL`: delete it if it is set.

   Saving does nothing until the redeploy in step 11. Leave the GitHub
   Actions secrets alone: CI and the browser tests stay on development.

## The switch (about 15 minutes; pick a quiet hour)

7. **Copy the accounts for real:**
   ```bash
   CLERK_DEV_SECRET_KEY=sk_test_... CLERK_PROD_SECRET_KEY=sk_live_... node scripts/clerk-copy-users.mjs --apply
   ```
   It writes `.clerk-migration/clerk-id-remap.ready.sql` (git-ignored; holds
   emails). Re-running is safe: existing production accounts are reused.
8. **Dry run.** Supabase → SQL Editor → paste the whole of
   `clerk-id-remap.ready.sql` → Run. It must end with an error that starts
   **`DRY RUN OK, nothing was changed. Would move N accounts`**, followed by
   the rows per column. N should be your real accounts (the 31 in `users`,
   less any listed as *Skipped, not in this database*). Any other error:
   stop; nothing was changed. Send me the error text (not the file).
9. **Apply.** In the editor, change `dry_run constant boolean := true;` to
   `false` and run again. **"Success. No rows returned"** means done; every
   failure undoes the whole run.
10. **Supabase.** Authentication → *Third-Party Auth* → Clerk → set the
    domain to `https://clerk.thecadpillar.com`.
11. **Vercel.** Deployments → latest production deployment → *Redeploy*,
    with *Use existing build cache* off. (The publishable key is built into
    the pages.)

Between step 9 and the end of step 11, anyone signed in sees empty pages.
Keep that gap to the length of a deploy.

## Check (5 minutes)

12. Open `thecadpillar.com/sign-in` in a private window: no "Development
    mode" badge. Sign in with your email and the code. Your admin home shows
    your data.
13. Admin → Designers: names and emails show (they come from Clerk by the
    new ids), and a bank detail opens.
14. SQL Editor:
    ```sql
    SELECT audit.verify_chain();                                     -- "valid": true
    SELECT created_at FROM audit.audit_log WHERE action = 'CLERK_INSTANCE_MIGRATION';  -- one row
    ```
15. `thecadpillar.com/api/health` is green.
16. Tell the team: *"Sign in at thecadpillar.com/sign-in with the same email
    as before. Use the code we email you, or Forgot password to set a new
    password."*
17. Delete the `.clerk-migration/` folder on your computer.

## If something is wrong

- **Step 8 or 9 fails:** nothing was changed (the whole run is one
  statement). Send me the error text only. (13 Nov 2026: the first version
  failed with "permission denied to set parameter session_replication_role";
  it now pauses triggers as the table owner instead, and the test runs it as
  a non-superuser owner, as Supabase does.)
- **After step 9, you need to go back:** set the Vercel variables back to the
  development keys, set Supabase Third-Party Auth back to the development
  Clerk domain, redeploy, and run the remap again with each pair reversed
  (swap the first two values on every line of the MAP block). Do this before
  new work piles up under the new ids.
- **Someone finished onboarding on production before step 9:** step 9
  refuses and names their id. Delete that person's new account in Clerk
  production, re-run step 7, and repeat from step 8.

## Not moved, on purpose

- `audit.audit_log`: each entry's hash covers its actor id. History keeps
  the old ids; the `CLERK_INSTANCE_MIGRATION` entry holds the old to new
  list, so every old id stays traceable.
- Stored file paths that contain an old id (for example
  `designers/<old id>/…`): the files stay where they are and the database
  rows still point at them. Only the folder name keeps the old id.
- JSON payloads of sent emails and analytics events: historical records.

## Done: 13 November 2026 (what happened, for next time)

- 26 accounts moved (913 references); 5 automated test accounts left as
  they were. Google sign-in set up with the company's own credentials.
- The first remap version failed on Supabase (`session_replication_role`
  needs a superuser); nothing changed. Fixed to pause triggers as the table
  owner; the test now runs as a non-superuser owner.
- **The window matters.** Between the remap (step 9) and the redeploy
  (step 11), a designer with an open development session reached /welcome,
  whose `ensure_self()` created an empty CLIENT account under their old id.
  Found by `db/ops/clerk-switch-health.sql` (rows 4 and 8), removed with
  `db/ops/clerk-duplicate-cleanup.sql` (dry run first; recorded in the audit
  log as DUPLICATE_ACCOUNT_REMOVED). Next time: do steps 9 to 11 back to
  back, and run the health check straight after.
- Health check after the cleanup: all 10 rows as expected.
