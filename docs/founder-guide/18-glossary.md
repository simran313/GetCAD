# Glossary of technical terms

Plain-language definitions of the terms used in this handbook and in the codebase.

| Term | Meaning |
|---|---|
| **3DM** | Rhino's native CAD file format. Delivered with the STL. The platform rebuilds it to remove who made it, and explodes blocks. |
| **Anon key** | Supabase's public key, used by every visitor's browser. Not secret. It grants nothing on its own: row-level security decides. |
| **API** | Application Programming Interface: a way for programs to talk to each other. TCP's internal API is its server actions and `/api` routes. |
| **App Router** | The Next.js way of mapping folders in `app/` to web addresses, with server-rendered pages. |
| **Append-only** | A table that only ever gains rows; existing rows cannot be changed or deleted (enforced by triggers). Used for the audit log, the ledger, messages and certificates. |
| **Audit log** | `audit.audit_log`: the permanent record of important events, hash-chained so tampering is detectable. |
| **Authentication** | Proving who someone is (sign-in). Done by Clerk. |
| **Authorisation** | Deciding what a signed-in person may do. Done by the database. |
| **Branch** | A separate line of code changes in Git, merged into `main` when approved. |
| **Bucket** | A container for files in Supabase Storage. All of TCP's are private. |
| **CI (continuous integration)** | Automatic checks (type-checking, lint, tests, secret scan, browser journeys) run by GitHub on every pull request. |
| **Clerk** | The sign-in provider. Holds accounts and passwords; issues session tokens. |
| **CNAME** | A DNS record that points one name at another (for example `clerk.thecadpillar.com` → Clerk's servers). |
| **Cron** | A schedule for running a job repeatedly (for example every 5 minutes). |
| **CSP (Content-Security-Policy)** | A browser header that limits where scripts and data may load from; a defence against injected scripts. |
| **CSRF** | Cross-site request forgery: tricking a signed-in browser into sending a request. Server Actions check the request's origin to prevent it. |
| **Database migration** | A numbered SQL file that changes the database structure. Applied once, in order, never edited afterwards. |
| **Definer function** | See *SECURITY DEFINER*. |
| **Deployment** | One built version of the app on Vercel. Production is the deployment serving `thecadpillar.com`. |
| **DKIM** | An email signature proving a message really came from your domain. |
| **DMARC** | A DNS policy telling receivers what to do with email that fails SPF/DKIM for your domain. |
| **DNS** | The internet's address book, turning names into server addresses. Managed in Vercel for TCP. |
| **E2E (end-to-end) test** | A test that drives a real browser through a whole journey (for example brief → quote → pay → design → QC → approve). |
| **Enum** | A database type with a fixed list of allowed values (for example the 17 order statuses). |
| **Environment variable** | A setting provided to the app at run time (keys, URLs, switches), stored in Vercel, not in code. |
| **Escrow** | Holding a client's payment until the work is approved, then releasing it to the payees. |
| **Feature flag** | A switch that turns a feature on or off without a code change (`feature_flags`). |
| **Fingerprint (SHA-256)** | A unique code computed from a file's bytes. Changing one byte changes it. Used to prove delivered files are unchanged. |
| **HMAC** | A signature made with a shared secret; proves a message (for example a Razorpay webhook) is genuine and untampered. |
| **HSTS** | A header telling browsers to always use HTTPS for the site. |
| **Idempotent** | Safe to repeat: doing it twice has the same effect as once (for example processing the same webhook twice). |
| **JWT** | JSON Web Token: a signed, tamper-proof digital pass that carries who you are (`sub`). |
| **JWKS** | The public keys used to check a JWT's signature, published by Clerk. |
| **Magic bytes** | The first bytes of a file that reveal its real type, regardless of its name. |
| **Metadata** | Hidden information inside a file (author, software, GPS location, dates). Stripped on upload. |
| **Middleware** | Code that runs before every request (`middleware.ts`), deciding whether sign-in is needed. |
| **Monolith** | One application containing all features, deployed as one unit. |
| **Next.js** | The web framework TCP is built with (React-based, by Vercel). |
| **npm** | The package manager for JavaScript; `package.json` lists the libraries used. |
| **OAuth** | The standard behind "Continue with Google". |
| **pg_cron** | A Postgres extension that runs SQL on a schedule; used for the SLA sweep. |
| **PITR** | Point-in-time recovery: restoring a database to any moment within a window. |
| **Pod** | A team led by a pod lead (QC), containing designers. |
| **Policy (RLS policy)** | A rule on a table saying which rows a role may read or write. |
| **Postgres** | The database engine Supabase runs. |
| **PostgREST** | Supabase's Data API: turns database tables and functions into web endpoints, applying RLS. |
| **Preview deployment** | A temporary Vercel deployment of a branch, for review before merging. |
| **Pull request (PR)** | A proposal to merge a branch into `main`, with checks and review. |
| **PWA** | Progressive Web App: a website that installs to a phone's home screen and can work offline and receive push notifications. |
| **Realtime** | Supabase's live channels; TCP uses them to tell an open chat "something changed". |
| **Revalidate** | Telling Next.js to refresh cached pages after data changes. |
| **RLS (row-level security)** | Database rules that filter every query row by row, by who is asking. The core of TCP's security. |
| **Role** | A person's function in the system: Client, Designer, QC (pod lead), Sales, Ops, Finance, Admin. |
| **Rollback** | Returning to a previous working version (instant for the app on Vercel; a new migration for the database). |
| **Route handler** | A server endpoint under `app/api/…` (downloads, webhook, cron). |
| **RPO / RTO** | Recovery point objective (how much data may be lost) and recovery time objective (how long recovery may take). |
| **Search path** | Where Postgres looks for unqualified names. Definer functions pin it so callers cannot substitute look-alike tables. |
| **Secret** | A value that grants access (passwords, private keys, API secrets). Never in code, chat or screenshots. |
| **SECURITY DEFINER** | A database function that runs with its owner's rights, so it can do privileged work. It must check the caller itself. |
| **Server Action** | A server function called by a form in the portal (Next.js). |
| **Server Component** | A React component rendered on the server; sends HTML, never secrets. |
| **Service role** | Supabase's all-powerful key that bypasses RLS. Server-only, used only after the app's own checks. |
| **Signed URL** | A file link that works only for a short time (60 seconds at TCP). |
| **SLA** | Service level agreement: TCP's promise of a first look within 6 hours of confirmation (standard tier). |
| **SPF** | A DNS record listing which servers may send email for your domain. |
| **SQL** | The language used to query and change the database. |
| **STL** | A mesh 3D file format used for printing and casting; delivered with the 3DM. |
| **Supabase** | The managed platform providing TCP's Postgres database, file storage and realtime. |
| **Trigger** | Database code that runs automatically when rows change (for example to enforce money conservation). |
| **TypeScript** | JavaScript with types; catches many mistakes before the code runs. |
| **Vercel** | TCP's hosting provider for the Next.js app, and its DNS host. |
| **VAPID** | The key pair that identifies TCP to browser push services. |
| **Webhook** | A message a provider sends to TCP when something happens (for example Razorpay: payment captured). |
| **Zod** | A library that validates the shape of data coming into the server. |
