# Phase 7b rollout — preview links, spec claims, public numbers

What ships: clients can send their customer a branded 3D preview, raise a claim when a file breaks its certificate, and the site can show weekly numbers once you switch them on.

## 1. Apply the database change
In the Codespace:

```
npm install
npm run db:apply
```

`npm install` adds the 3D viewer library. `db:apply` applies `0051_preview_claims_stats.sql` and the policy `0040_preview_claims_rls.sql`. Nothing about work in progress changes.

## 2. Merge
Merge once the checks are green. No new settings or keys.

## 3. What changes
- **Client, Account:** **Your logo** (PNG or JPEG, up to 2 MB). It appears on their preview links.
- **Client, order page (approved or delivered):**
  - **Share a 3D preview** → choose 7, 30 or 90 days → **Create link**. The link is shown **once** — copy it then. Each link shows its views; **+30 days** or **Turn off**.
  - The link opens a page with their logo and business name, the piece turning in 3D and the renders. No prices, no order number, nothing of ours.
  - **Spec guarantee:** for 30 days after delivery, **Open a claim**: what is wrong, a description, casting details, the exact STL/3DM they cast from, and 1–10 photos.
- **What happens to a claim:**
  - File doesn't match anything we delivered (it was edited) → **Not covered**, told why at once.
  - The spec was waived at the client's request → **Not covered**.
  - Third claim from that client in 90 days → goes to **admin review**.
  - Otherwise → the **pod lead** sees it on the **QC queue** and the order page, downloads the file and photos, re-measures, and **Upholds** or **Rejects** with a note.
  - **Upheld:** a free fix order is created in the same pod (designer not paid, QC paid as normal) and the CAD fee is credited to the client's next order — once per order, even if an admin later overturns a rejection.
- **Admin:**
  - **Queue** lists claims waiting, and flags a designer with upheld claims in the last 90 days;
  - can decide any claim and overturn a rejection;
  - **Clients → Public numbers:** the latest weekly numbers and **Recompute**.

## 4. Public numbers (/results)
Hidden until you turn them on. After 30 days of real orders:
1. **Clients → Public numbers → Recompute**, and check the figures.
2. In the Supabase SQL editor:
   ```sql
   UPDATE feature_flags SET enabled = true WHERE key = 'public_stats';
   ```
3. Visit `/results`. To hide it again, set it back to `false`.

They recompute every Monday at 06:00 UTC where the scheduler (pg_cron) is enabled; otherwise press Recompute.

## 5. Check it
1. As a client with an approved test order: upload a logo, create a preview link, open it in a private window, see the 3D piece and your logo. Turn the link off; reload: "This preview is not available".
2. Mark a test order delivered, open a claim with the delivered STL and a photo: it shows **Being re-measured**. Open one with an edited STL on another order: **Not covered**.
3. As pod lead: uphold the first claim; a free fix order appears, and the client sees **Upheld** and the credit.
