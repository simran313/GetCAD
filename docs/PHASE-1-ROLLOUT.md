# Phase 1 rollout — step by step

What this ships: migrations `0033`–`0037` and policies `0027`–`0030` (roles, pods, order model, client anonymity), plus the app changes that read through the new functions.

**The database and the app must change together.** The new app code needs the new functions (`visible_orders`, `order_messages`); the old app code reads columns the new database refuses (`client_id`, `sender_id`). Expect a few minutes of errors between the two steps in Part C — do it when nobody is using the app.

Who does what: you run every command below. Claude has no access to your Supabase, Vercel or Clerk accounts.

---

## Part A — Get ready (one time, ~15 min)

### A1. Computer setup
You need Node 20+ and git.

```bash
git clone https://github.com/simran313/GetCAD.git    # skip if you already have it
cd GetCAD
git fetch origin
git checkout claude/gracious-hopper-amum18
git pull
npm ci
```

### A2. Confirm the code is green (optional; CI already ran it)
```bash
npm run typecheck && npm run lint
```

### A3. Find your connection strings
Supabase → your project → **Connect** (top bar) → **Session pooler** → copy the URI. It looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Replace `<password>` with the database password (Supabase → Settings → Database → reset it if you don't know it).

⚠️ Never put this string in Vercel, in `.env.example`, or in a commit. Type it inline (as below) so it doesn't linger in your shell.

---

## Part B — Staging first (recommended, ~45 min)

A staging copy lets you click through the new rules without risking real orders. Skip to Part C only if production has no real customers yet.

### B1. Create the staging database
1. Supabase → **New project** → name it `getcad-staging`. Same region as production.
2. Authentication → **Third-Party Auth** → **Add provider → Clerk** → paste your **development** Clerk domain (`https://xxxx.clerk.accounts.dev`). Same setting production has, but pointing at the dev Clerk instance.
3. Storage → **New bucket** → name `order-files` → **Private**.

### B2. Apply all migrations to staging
```bash
DATABASE_URL="<staging session pooler string>" npm run db:status
DATABASE_URL="<staging session pooler string>" npm run db:apply
DATABASE_URL="<staging session pooler string>" npm run db:status   # must say 0 pending
```

### B3. Point a preview deployment at staging
Vercel → project → Settings → **Environment Variables** → for the **Preview** environment only, set:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service-role key |
| Clerk keys / `CLERK_JWT_ISSUER` | your **development** Clerk instance |

Then Vercel → Deployments → find the latest deployment of branch `claude/gracious-hopper-amum18` → **Redeploy** (so it picks up the Preview variables).

### B4. Create test accounts
Open the preview URL and sign up four times (use `+` emails, e.g. `you+client@gmail.com`): **client**, **designer**, **pod lead**, **admin**. Each sign-up creates a CLIENT row. Then do Part D (roles and pods) against **staging**.

### B5. Click-through checklist (staging)
| As | Do | Expect |
|---|---|---|
| Client | Create an order, fill the brief (no karat/purpose/format/finish needed), send a message | Saves; no "Priority / Rush" option; order shows a reference like `CL1-RN-C-1` after submit |
| Admin | Quote it, mark paid (or pay in Razorpay test mode), assign it to the pod (Part D3), assign the designer | Admin sees all orders |
| Designer | Open "My work" | Sees the job as `RN-C-1`; **no price, no client name, no client messages**; can message — shows as "Designer" |
| Pod lead | Open the order | Sees both threads; QC pass works only on their pod's orders |
| Client | Open messages | Sees only their thread with the team; never the designer's messages |
| Anyone else | Open the order URL directly | "Order not available" |

If anything fails, copy the error message and send it to Claude.

---

## Part C — Production (~15 min, quiet time)

### C1. Back up
Supabase → Database → **Backups** → confirm a recent backup exists (Pro plan), **or** take one yourself:

```bash
pg_dump "<production session pooler string>" -Fc -f backup-before-phase1.dump
```

(Keep the file somewhere safe and private: it contains client data.)

### C2. Dry run
```bash
DATABASE_URL="<production session pooler string>" npm run db:status
```
It must list exactly these as pending, and nothing else:

```
0033_roles_pods.sql  0034_product_kinds.sql  0035_order_model.sql
0036_pseudonymous_identity.sql  0037_ops_tables.sql
0027_roles_pods_rls.sql  0028_order_model_rls.sql  0029_identity_columns.sql  0030_ops_tables_rls.sql
```

If it lists anything older, **stop** and ask — production is behind `main`, and that needs looking at first.

### C3. Apply
```bash
DATABASE_URL="<production session pooler string>" npm run db:apply
DATABASE_URL="<production session pooler string>" npm run db:status    # 0 pending
```

Each file runs in its own transaction: if one fails, it changes nothing and the error names the file. Do **not** run `db:baseline`. Send the error to Claude.

### C4. Ship the app code (immediately after C3)
Ask Claude to open the Phase 1 pull request (or open it on GitHub: `claude/gracious-hopper-amum18` → `main`). Wait for CI to go green, then **merge**. Vercel deploys `main` to production in ~2 minutes.

### C5. Do Part D against **production**, then repeat the B5 checklist on the live site with your own test accounts.

---

## Part D — Roles and pods (SQL editor, ~10 min)

There is no Access/pods screen yet (that is Phase 5), so this is done once in Supabase → **SQL Editor**. Each block below is one run.

### D1. Find the account ids
Clerk dashboard → Users → click a user → copy the **User ID** (`user_…`). Or in SQL:

```sql
SELECT id, role, status, created_at FROM users ORDER BY created_at;
```

### D2. Make yourself admin and name the team
Replace the ids and names, then run the whole block:

```sql
-- 1. Bootstrap: you must be OPS before you can grant anything.
UPDATE users SET role = 'OPS', status = 'ACTIVE' WHERE id = 'user_ADMIN';

-- 2. From here on, act as yourself, so every change is audited.
SELECT set_config('request.jwt.claims', '{"sub":"user_ADMIN"}', false);

SELECT public.grant_user_role('user_ADMIN', 'SALES');
SELECT public.grant_user_role('user_ADMIN', 'FINANCE');     -- you are now ADMIN
SELECT public.set_staff_first_name('user_ADMIN', 'Fazil');   -- clients see "Team · Fazil"

-- Pod lead: needs the QC role.
SELECT public.set_user_role('user_PODLEAD', 'QC');
SELECT public.set_staff_first_name('user_PODLEAD', 'Priya');

-- Designers: must already have applied and signed the agreement in the app
-- (/onboarding/designer). Check: SELECT id, role, status FROM users WHERE role = 'DESIGNER';

SELECT set_config('request.jwt.claims', '', false);
```

If **you** will also run QC yourself (small team), add `SELECT public.grant_user_role('user_ADMIN', 'QC');` and use your own id as the pod lead below.

### D3. Create a pod and put people in it
```sql
SELECT set_config('request.jwt.claims', '{"sub":"user_ADMIN"}', false);

SELECT public.create_pod('Pod 1');                    -- copy the id it returns
SELECT public.set_pod_member('<POD_ID>', 'user_PODLEAD',  'POD_LEAD');
SELECT public.set_pod_member('<POD_ID>', 'user_DESIGNER', 'DESIGNER');
-- repeat set_pod_member for each designer

-- Every live order needs a pod before QC can review it:
SELECT public.assign_order_pod(id, 'user_PODLEAD')
FROM orders
WHERE pod_id IS NULL
  AND status NOT IN ('DRAFT', 'CANCELLED', 'REFUNDED', 'PAYOUT_RELEASED');

SELECT set_config('request.jwt.claims', '', false);
```

From now on, run `assign_order_pod` for each new order once it is paid (the admin screen for this arrives in Phase 3/5).

### D4. Check
```sql
SELECT u.id, u.role, array_agg(r.role) AS extra_roles, s.first_name
FROM users u
LEFT JOIN user_roles r ON r.user_id = u.id
LEFT JOIN staff_profiles s ON s.user_id = u.id
WHERE u.role <> 'CLIENT'
GROUP BY u.id, u.role, s.first_name;

SELECT p.name, m.member_role, m.user_id FROM pods p JOIN pod_members m ON m.pod_id = p.id ORDER BY 1, 2;
```

---

## Part E — What changes for people using the app

- **Clients** talk only to "the team". Old client↔designer messages are kept but visible only to admin.
- **Designers** see job codes (`RN-C-12`), no prices, no client names, and talk only to the pod lead / admin.
- **QC** works only on orders in their pod. An order with no pod cannot be reviewed — run D3's `assign_order_pod`.
- **Rush / express** is gone from the brief until the rush flag is switched on.
- **Order references** (`MJ1-RN-C-12`) appear when an order is first submitted. Older orders get theirs during C3.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `permission denied for table orders` on a page | App code is older than the database | Finish C4 (merge + deploy) |
| `function visible_orders does not exist` | Database is older than the app code | Run C3 |
| QC: "only the pod lead of this order's pod may review it" | Order has no pod, or the reviewer is not its pod lead | D3 `assign_order_pod` |
| "only an admin…" in the SQL editor | `set_config` line missing, or roles not granted yet | Run D2 in full |
| `db:apply` fails | One file was rejected; nothing from it was applied | Send the error to Claude. Never run `db:baseline` |

Restoring the backup (last resort): Supabase → Database → Backups → Restore, or `pg_restore --clean -d "<string>" backup-before-phase1.dump`. Ask before doing this — it undoes everything since the backup.

---

## After Phase 1

1. **Phase 2 (payments + 6-hour clock)** needs `pg_cron`: Supabase → Database → **Extensions** → search `pg_cron` → **Enable**. Do it on staging and production. Nothing runs until Phase 2 ships.
2. Tell Claude "start Phase 2".
