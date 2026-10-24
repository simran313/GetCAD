# Phase 5c rollout — designer and pod lead screens

What ships: the designer's and the pod lead's screens from the designs. One database file and one access rule; both only read data.

## 1. Apply the database change
In the Codespace, with `DATABASE_URL` pointing at the Supabase database:

```
npm run db:apply
```

It applies `0047_work_screens.sql` and the policy `0036_designer_rate_card.sql`. Until it is applied, the new designer and pod lead pages show "Couldn't load…".

## 2. Merge
Merge once the checks are green. No new settings.

## 3. What changes
**Designers** (menu: Home · Open jobs · Messages · Earnings · Account):
- **Home:** jobs sent back with the notes, new jobs, jobs in progress with their timer, unread messages, last payout. "Finish onboarding" shows until the agreement is signed (Onboarding is no longer in the menu).
- **Open jobs:** tabs Open · Submitted to QC · Done; Start work starts the timer (category time).
- **Job page:** the brief (never the client), reference pictures with pins, the notes for this version, the 10 upload slots, the checklist and **Submit to QC** (works once 19/19 are ticked and all files are in).
- **Earnings:** each job's pay once the order closes, the rate card, bank details.
- Old `/orders/…` links send designers to the new job page.

**Pod leads** (menu: QC queue · Team board · All orders · Create order · Messages · Earnings · Account):
- **QC queue:** submissions waiting, oldest first, and the ones you have started.
- **QC review:** the designer's files (switch between versions), the brief, the two-level checklist. Tick your 19, then **Pass to client**; or write a note and **Send back**.
- **Team board:** paid orders waiting for a designer (Assign to…), and each designer's jobs and load out of 480 minutes.
- **All orders:** your pod's orders with client code and designer ref; search and filters.
- **Earnings:** QC pay per order and the rate table.

Admins and clients see no change (admin screens are 5d).

## 4. Check it
Use a test pod with a pod lead and one designer.
1. As admin, quote and confirm an order in that pod and mark it paid.
2. As the pod lead: **Team board** shows it under Unassigned → Assign to the designer.
3. As the designer: **Home** shows "New job" → open it → **Start work** → upload the 10 files → tick the checklist → **Submit to QC**.
4. As the pod lead: **QC queue** shows it → open → tick 19 → **Pass to client** (or send back with a note and check the designer sees the note on Home).
5. As the designer: **Earnings** and **Messages** load.
