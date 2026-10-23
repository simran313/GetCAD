# The CAD Pillar — Build Spec v1 (ops, SLA, pay, checklist)

Drop this file in the repo root next to the Build Bible. It extends the live app; it does not replace it.
Design source: the signed-off canvas "The CAD Pillar — App Screens" (1440×900 desktop, 390×844 mobile). Screen codes below (C4, D4b, P5…) refer to that canvas.

## 0. Rules for whoever builds this

- Keep every existing invariant: two-way anonymity enforced in the database, append-only hash-chained audit log, QC as a separate login and an unskippable gate, server-side auth only, RLS as versioned SQL.
- Every new table gets RLS in the same migration. No table ships without a policy file and a test.
- Every state change, tick, credit and payout writes an audit row.
- Money is stored as integers (cents for USD, paise for INR). Never floats.
- Timers are computed from stored timestamps on the server. The UI only displays them.
- Use Opus for sections 3, 4, 5 and 7 (state, SLA, money, RLS). Sonnet is fine for UI.

## 1. Roles

| Role in this spec | Existing role(s) | What they do |
|---|---|---|
| CLIENT | client | Orders, pays, reviews, downloads. Talks to "the team" only. |
| DESIGNER | designer | Works only on jobs assigned to them. Talks to their pod lead and admin only. |
| POD_LEAD | QC | Owns a pod. Assigns jobs to designers, runs QC, can create orders for clients. Paid per QC review. |
| ADMIN | SALES + OPS + FINANCE | Everything: pricing, category, pod-lead assignment, delivery, payouts, refunds, credits, access. |

Keep the existing SALES / OPS / FINANCE / QC role values in the database; ADMIN is a user holding SALES + OPS + FINANCE. POD_LEAD is the QC role plus a `pod_id`.

### Visibility (enforce in RLS, not just UI)

| Data | Client | Designer | Pod lead | Admin |
|---|---|---|---|---|
| Own orders | ✓ | — | — | ✓ |
| Client identity | own | never | reference only | ✓ |
| Designer identity | never | self | names in own pod | ✓ |
| Jobs | — | only assigned to me | all in my pod | all |
| Checklist | — | own ticks + read QC | both columns | read |
| Payout amounts | — | own | own QC pay | all |
| Order price | ✓ | never | ✓ | ✓ |

### Messaging

Two thread types per order:
- `client_team` — participants: the client, plus admin and pod lead shown as "Team · {first name}". Designers can never be added.
- `internal` — participants: the assigned designer, the pod lead, and admin.

Designer inbox (D5) shows only `internal` threads. A designer posting to a `client_team` thread must fail at the RLS level.

## 2. Job categories (seed table)

Table `job_categories(letter, minutes, tier, designer_rate_paise)` — seed exactly:

| Cat | Minutes | Tier | Designer pay (₹500/h) |
|---|---|---|---|
| A | 15 | standard | ₹125 |
| B | 30 | standard | ₹250 |
| C | 45 | standard | ₹375 |
| D | 60 | standard | ₹500 |
| E | 90 | standard | ₹750 |
| F | 120 | standard | ₹1,000 |
| G | 180 | complex | ₹1,500 |
| H | 240 | complex | ₹2,000 |
| I | 300 | complex | ₹2,500 |
| J | 360 | complex | ₹3,000 |
| K | 420 | complex | ₹3,500 |
| L | 480 | complex | ₹4,000 |

Formula: `designer_pay = minutes × 500 / 60` (₹). Rates are admin-editable; a change applies only to orders quoted after it.

## 3. Order model changes

Add to `orders`:

| Column | Type | Notes |
|---|---|---|
| `category` | char(1) FK job_categories | Required before quote. Admin or pod lead sets it. |
| `tier` | enum standard/complex | Derived from category, stored at quote. |
| `price_cents` | int | Existing quote amount. |
| `complex_deadline_hours` | int null | Required when tier = complex. Set with the price. |
| `sla_started_at` | timestamptz null | = payment captured time. |
| `sla_due_at` | timestamptz null | started + 6 h (standard) or + complex_deadline_hours. |
| `first_look_at` | timestamptz null | First time the order reaches CLIENT_PREVIEW. |
| `sla_status` | enum pending/running/met/breached/breached_credited | |
| `sla_credit_ledger_id` | uuid null | Wallet ledger row of the auto-credit. |
| `source` | enum portal/whatsapp/email/phone | |
| `created_on_behalf_by` | uuid null | Admin or pod lead who created it. |
| `intake_mode` | enum full/quick | quick = screenshot-led. |
| `client_po` | text null | |
| `pod_id` / `pod_lead_id` | uuid null | Set by admin. |
| `designer_payout_paise` | int | Locked at quote = category rate. |
| `qc_payout_paise` | int | Locked at quote (section 5). |

New tables: `order_screenshots`, `job_assignments`, `checklist_items`, `order_checks`, `deliverables`, `payouts`, `sla_events`. Details in the sections below.

### State machine additions

Keep the existing machine. Add or confirm only these:

| Transition | Who | Guard |
|---|---|---|
| SUBMITTED → QUOTED | Admin | category set; complex → deadline set; payouts computed and locked |
| QUOTED → PAYMENT_HELD | Webhook | sets `sla_started_at`, `sla_due_at`, `sla_status = running` |
| PAYMENT_HELD → ASSIGNED | Pod lead | `pod_lead_id` set by admin first; designer in same pod; capacity check (section 7) |
| IN_PROGRESS → DESIGNER_SUBMITTED | Designer | all 19 designer ticks + sign-off + all required deliverable slots filled |
| QC_REVIEW → CLIENT_PREVIEW | Pod lead | all 19 QC ticks; sets `first_look_at` if null |
| QC_REVIEW → REVISION_REQUESTED | Pod lead | revision note required (non-empty) |
| DELIVERED → REVISION_REQUESTED | Client (re-open) | within 30 days |

Revisions from the client after approval create a new job row with its own category and pay (section 5). QC send-backs reuse the same job and are not paid again.

## 4. SLA engine

**Rule (signed off):**
- Categories A–F (standard): the first look must be shared within **6 hours of payment**.
- Categories G–L (complex): deadline = `complex_deadline_hours`, set by admin with the price.
- The clock starts when the client accepts the price and pays (`QUOTED → PAYMENT_HELD`).
- **Met** = the order reaches CLIENT_PREVIEW (renders or files shared for approval) at or before `sla_due_at`.
- **Missed, standard tier only:** the full amount paid is credited back to the client's wallet automatically, once, and the order still has to be completed.
- **Missed, complex tier:** flag only (admin queue lane "SLA missed"); no automatic credit.

**Implementation:**
1. A function `sla_sweep()` runs every minute (Supabase cron or Vercel cron calling a server route with a secret).
2. It selects orders where `sla_status = 'running' AND first_look_at IS NULL AND now() > sla_due_at`.
3. For standard tier, in one transaction:
   - insert wallet ledger row `type = 'sla_credit', amount = price_cents, order_id`, with a unique index on (order_id, type) so it can never double-credit;
   - set `sla_status = breached_credited` and `sla_credit_ledger_id`;
   - write the audit row.
4. For complex tier, set `sla_status = breached` and write the audit row.
5. When `first_look_at` is set before the deadline, set `sla_status = met`.
6. Notify client, admin and pod lead on breach.

Clock runs continuously (no business-hours pause) unless "pause on client hold" is approved (open decision 2).

**Internal targets shown to the team:**
- Designer "first look due" (D3, D4) = `sla_due_at − qc_buffer` (default 60 min, admin setting).
- Designer "your time left" = category minutes − elapsed since Start work.
- Pod lead and admin see `sla_due_at` directly (P5, P2, A1).

**Client copy (C5, N5, C4):** "First look within 6 hours of payment, or the full amount comes back to your wallet, and we still finish it."

## 5. Pay rules

**Designer:** category rate from section 2, locked on the order at quote.

**QC / pod lead:** by order value, locked at quote.
- `qc_pay_inr = max(500, round_to_50(order_usd × 1000 / 60))`
- $30 → ₹500 · $45 → ₹750 · $60 → ₹1,000 · $90 → ₹1,500 · $180 → ₹3,000
- Orders under $30 pay the ₹500 minimum.

**When:** payout rows are created on CLOSED and released through the existing `releaseEscrowAction` / Razorpay payouts flow.
**Revisions:** QC send-backs → no extra pay. Client-requested changes after approval → a new job at its own category, paid separately.
**Admin warning:** on the quote panel (A3), show margin after payouts; warn if payouts exceed 40% of the price.

## 6. Ordering and intake

**Client, desktop (N1, N7):** one page, focus mode (no sidebar). Service switch CAD / Renders / CAD + renders. Four columns. A fixed bottom bar shows the live summary, the SLA line, and "Review order".
**Client, mobile:** the existing four-step form.
**Review (N5):** aligned label/value grid with Edit per section, plus the SLA strip.

**Minimum to submit a CAD order** (block "Review order" until met):
- product type
- at least 1 reference photo or sketch
- ring: size or circumference; bangle/bracelet: inner size or length
- metal
- centre stone: yes/no (if yes: shape + size)

Everything else is optional.

**On-behalf orders (A10 admin, P6 pod lead):**
- Fields: client (required), source (required), received at, **at least one screenshot (required, cannot be skipped)**, service, category (required), tier (auto from category), assignee (admin → pod lead; pod lead → designer).
- All brief fields are optional in quick mode.
- The order appears in the client's portal as "Placed via WhatsApp by the team" and still needs the client to accept the price and pay. The SLA clock starts then.
- Toggle: notify the client by email and WhatsApp.

## 7. Assignment, capacity and the team board

- Admin assigns each order to a pod lead (A1 "Assign pod lead").
- The pod lead assigns it to a designer in their pod (P5 board or P6).
- Capacity: sum of category minutes of open jobs per designer per shift; shift = 480 min (admin setting). Block assignment over capacity; admin can override with a reason (audited).
- **Team board (P5):** columns = Unassigned + one per designer (name, ref, minutes used / 480). Cards show job, category, status and the SLA countdown.
- **Designer Open jobs (D3):** RLS returns only `job_assignments.designer_id = auth user`. Tabs: Open, Submitted to QC, Done.

## 8. Two-level checklist

Seed `checklist_items` (19 rows, grouped, ordered, with flags):

- **Before starting:**
  1. Brief read — measurements, stone specs and special requirements noted
  2. Reference image open alongside the CAD — compare at every stage `MUST`
  3. Metal and stone colour noted — matches the brief
  4. Unclear points flagged to ops before starting `STOP IF UNSURE`
- **Dimensions:**
  5. Length correct
  6. Width and height / depth correct
  7. Size correct — ring inner diameter, bangle or bracelet circumference
  8. Shank — top width, bottom width, top depth, bottom depth match the brief
- **Stones:**
  9. Centre stone seat matches brief dimensions
  10. Side stone count, size and placement match the brief
- **Geometry:**
  11. No open or naked edges — all geometry closed `CRITICAL`
- **3DM file:**
  12. Delivery views captured — TV, PV, RV, FV, BV, M, DD, GW
  13. Folder renamed for QC — follows the naming convention
- **STL:**
  14. Magic file applied and Ctrl+T executed
  15. Naked edge check passed before export `CRITICAL`
  16. Mesh all files — max distance / edge = 0.005
- **Final:**
  17. Special requirements fulfilled — order notes re-read before submitting
  18. Both 3DM and STL uploaded to the correct folder

Plus sign-off rows: Designer sign-off (19) and QC reviewed by.

`order_checks(order_id, job_version, item_id, designer_by, designer_at, qc_by, qc_at)`

Rules:
- The designer can tick only the designer column, and only while IN_PROGRESS.
- QC can tick only the QC column, only in QC_REVIEW, and only after the designer has signed off.
- A new version resets both columns.
- Every tick is audited.

## 9. Deliverables

- Required slots per CAD job: 3DM, STL, TV, PV, RV, FV, BV, M, DD, GW.
- Optional slots: gold weight chart, diamond details, summary sheet.
- Uploads are auto-renamed `{ORDER}_{SLOT}_v{n}.{ext}`, which removes the manual "folder renamed" step.
- **Fix the existing upload check so STL and 3DM are accepted.** Keep metadata stripping.
- Client download gate stays as today: files unlock after approval.

## 10. Notifications

| Event | Client | Designer | Pod lead | Admin |
|---|---|---|---|---|
| Quote ready | ✓ | | | |
| Payment captured, SLA started | ✓ | | ✓ | ✓ |
| Order assigned to pod / designer | | ✓ | ✓ | |
| 60 min before designer due time | | ✓ | ✓ | |
| Designer submitted | | | ✓ | |
| Sent back with note | | ✓ | | |
| First look shared | ✓ | | | |
| SLA missed + credit issued | ✓ | | ✓ | ✓ |
| Client approved / re-opened | | ✓ | ✓ | ✓ |
| On-behalf order created | ✓ | | ✓ | ✓ |

## 11. Screens → routes

| Canvas | Route (suggested) |
|---|---|
| N1 / N7 / N5 / N6 | `/orders/new?service=cad\|render`, `/orders/new/review`, `/orders/[id]/sent` |
| C1, C3, C4, C5, C6, C7, C8 | `/`, `/orders`, `/orders/[id]`, `/orders/[id]/pay`, `/orders/[id]/review`, `/messages`, `/files` |
| W1, W2, W3, C9 | `/wallet`, `/wallet/transactions`, `/wallet/invoices`, `/account` |
| D3, D4, D4b, D5, D6 | `/work`, `/work/[jobId]`, `/work/[jobId]/checklist`, `/work/messages`, `/work/earnings` |
| P1, P2, P5, P6, P4 | `/qc`, `/qc/[orderId]`, `/pod/board`, `/pod/orders/new`, `/qc/earnings` |
| A1, A10, A2, A3, A8, A9 | `/admin`, `/admin/orders/new`, `/admin/orders`, `/admin/orders/[id]`, `/admin/billing`, `/admin/clients` |

## 12. Build order and acceptance tests

1. **Migrations + RLS:** categories, order columns, assignments, checks, deliverables, payouts, sla_events.
   - Tests: a designer cannot read an unassigned job, a client thread or a price; a pod lead cannot read another pod.
2. **Quote + payment hooks:** category, tier, locked payouts, SLA start on webhook.
   - Test: paying sets `sla_due_at = paid_at + 6h` for D, and + deadline for H.
3. **SLA sweep + auto-credit.**
   - Tests: a breach credits exactly once (run the sweep twice); a complex breach doesn't credit; first look at 5:59 = met.
4. **Assignment + capacity + board.**
   - Test: the 481st minute is blocked without an admin override.
5. **Checklist + deliverable gates.**
   - Tests: can't submit at 18/19; QC can't pass at 18/19; send-back without a note fails; STL/3DM upload works.
6. **On-behalf intake.**
   - Tests: no screenshot = rejected; the order is visible to the client; the clock starts only at payment.
7. **Messaging split.**
   - Test: a designer post to `client_team` is rejected by RLS.
8. **Payout calculation.**
   - Test: QC for $20 = ₹500, $60 = ₹1,000, $180 = ₹3,000; designer D = ₹500, L = ₹4,000.
9. **UI** from the canvas, desktop first for staff, mobile first for client and designer.

## 13. Open decisions (defaults used until answered)

1. When the SLA is missed and credited, do the designer and QC still get paid? **Default: yes** (the business absorbs the credit).
2. Pause the SLA clock while waiting on the client for missing info? **Default: no pause** (signed-off rule is continuous); recommended to add.
3. Rush option: hidden in v1 until a rush deadline and price are defined.
4. QC payout rounding: nearest ₹50 (default).
