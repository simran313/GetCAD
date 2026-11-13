# Founder's technical education

This chapter explains, in plain language, the ideas you need to understand your own platform, make decisions about it and talk to developers with confidence. No programming knowledge is assumed. Technical words are explained the first time they appear; all of them are also in the [glossary](./18-glossary.md).

## The building blocks, as a shop

Think of The CAD Pillar as a jewelry workshop with a shopfront.

| Part of the shop | Technical name | What it is | Your provider |
|---|---|---|---|
| Shop window and reception | **Website** (frontend) | The pages people see in a browser | Built in **Next.js**, hosted on **Vercel** |
| The back office where staff work | **Server** (backend) | Code that runs on computers you rent, not on the visitor's phone. It does things the visitor must not be able to fake. | Also Next.js on Vercel ("serverless functions") |
| The filing cabinet | **Database** | Where every order, message, payment and person is recorded | **Supabase** (a managed **Postgres** database) |
| The vault for drawings | **Storage** | Where CAD files and pictures are kept | Supabase Storage, in **private buckets** |
| The doorman who checks ID | **Authentication** | Proving who someone is (sign-in) | **Clerk** |
| The rule book on who may open which drawer | **Authorisation** | Deciding what a signed-in person may do | Written into the database as **row-level security** |
| The cashier | **Payments** | Taking card or UPI payments, paying designers | **Razorpay** |
| The post room | **Email** | Order updates and receipts | **Resend** (sends), plus your Google Workspace mailbox |
| The workshop's master copy of the blueprints | **Code repository** | Every line of the software and its history | **GitHub** (`simran313/GetCAD`) |

## How a page reaches someone's screen

1. A client types `thecadpillar.com` or opens the installed app on their phone.
2. **DNS**, the internet's address book (managed in Vercel, with the domain registered at GoDaddy), tells the phone which computers serve that name.
3. **Vercel** runs the Next.js code and builds the page. If the page needs data, the server asks **Supabase**, sending along proof of who the visitor is.
4. The **database checks its rules** and returns only the rows that person may see.
5. The page arrives in the browser, encrypted end to end (**HTTPS**, the padlock).

## Sign-in: who are you?

When someone signs in, Clerk checks their email code or their Google account. It then gives the browser a **session token**: a short-lived, tamper-proof digital pass (a **JWT**, JSON Web Token) that says "this is user `user_3Hd…`". Every request carries that pass. Supabase checks the pass's signature with Clerk's public key. A forged or expired pass is refused.

**Why this matters to you:** nobody at TCP ever stores passwords. Clerk does, and it specialises in it. On 13 November 2026 the site moved from Clerk's *development* setup to its *production* setup. That is why every account received a new id (`docs/CLERK-PRODUCTION.md`).

## Permissions: what may you do?

The most important security decision in the platform is **where the rules live**. They are in the database itself, as **row-level security (RLS)**. Every table in the filing cabinet has a lock, and the database checks every single row against a rule before handing it over:

- A client sees only their own orders.
- A designer sees only jobs assigned to them, and never the client's name or the price.
- A pod lead sees their own pod's work and pay, and never what the client paid.
- Only admins see identities and bank details, and each such read is written to a permanent log.

Because the rules are in the database, a mistake in a screen cannot leak data. The screen simply receives nothing it is not allowed to see. If a developer adds a new table and forgets to write a rule, the table is **closed by default**.

## Money: escrow in software

When a client pays, the money is recorded as **held** in an **escrow ledger**: a list of entries that can only be added to, never changed. The ledger has an automatic rule (a **trigger**): no payout or refund may take out more than was paid in. When the order is closed, Finance **releases** it in three parts: the designer's pay (in rupees), the pod's pay, and TCP's commission. Payouts go to verified bank accounts through **Razorpay Route**. If a bank transfer bounces, a **reversal** entry puts the money back in escrow, so it is never lost.

The client cannot mark their own order paid. Only a message from Razorpay that carries Razorpay's secret signature can do that, or an admin recording a manual payment.

## Files and your intellectual property

CAD files are your clients' designs and your designers' work. The platform protects them in five ways:

1. **Checked on the way in:** a file must really be the type it claims to be. A program renamed `.stl` is refused.
2. **Cleaned:** hidden information such as author names, GPS data in photos and software details is removed.
3. **Kept private:** the storage buckets are not public. There is no web address that opens a file.
4. **Released per request:** each time someone downloads a file, the server checks they are allowed *right now*. A client, for example, only gets final files after approving. The server then creates a link that works for **60 seconds**.
5. **Fingerprinted:** each delivered file gets a **SHA-256 fingerprint**, a unique code that changes if even one byte changes. This backs the spec guarantee: if a client edits a file, the fingerprint no longer matches.

## The audit log: your black box recorder

Every important event is appended to the **audit log**: a state change, a payment, a payout, a QC decision, or someone opening a designer's identity documents. Each entry includes a **hash** (a fingerprint) of the previous entry, forming a chain. If anyone altered an old entry, the chain would break and `audit.verify_chain()` would report where. Nobody, not even the platform's own scripts, can edit or delete entries.

## How changes reach the live site

1. A developer (or Claude) writes code on a **branch**: a private copy of the code where changes are made without touching the live site.
2. They open a **pull request (PR)**: a request to merge the branch into `main`, the master copy.
3. **Continuous integration (CI)** runs automatically on GitHub. It type-checks the code, runs 1,201 automated tests against a throwaway database, scans for leaked secrets, and runs browser journeys through every role.
4. Vercel builds a **preview** of the branch at its own temporary address.
5. **You review and merge.** Vercel then deploys `main` to `thecadpillar.com` within minutes.
6. **Database changes (migrations) are applied by you**, separately and deliberately. CI and Vercel never change the production database.

**Rolling back** a bad release is instant: in Vercel, pick the last good deployment and choose *Promote to Production*. Database changes do not roll back automatically. That is why they are tested against a throwaway database first.

## Secrets and keys

Some settings are **secrets**: the database password, the Supabase service-role key, the Razorpay secrets, the Clerk secret key and the cron secret. They live only in Vercel's environment-variable settings (and in GitHub Actions secrets for the scheduler). Rules to live by:

- Never paste a secret into chat, email, a document or a screenshot.
- Anything starting with `NEXT_PUBLIC_` is **not** secret: it is visible to every visitor by design.
- If a secret may have been exposed, **rotate** it: create a new one, update Vercel, redeploy, then revoke the old one.

## Backups and recovery

Your data lives in one Supabase project. Recovery after a mistake or an outage depends on the plan: paid plans keep daily backups and can offer **point-in-time recovery**, meaning a restore to any second within the retention window. At audit time the organisation showed the **Free** plan. Chapter 14 explains why upgrading is the single most valuable resilience step.

## Questions to ask any developer

- "Which tables does this change touch, and what are their RLS rules?"
- "Does this add a SECURITY DEFINER function? How does it check the caller?"
- "Does it use the service role? What check happens before it?"
- "Is there a migration? Has it been tested on a throwaway database? How do we undo it?"
- "Could this show a client a designer's identity, or a designer a price?"
- "What do the tests prove, and did CI pass?"
