# Implementation plan — DECISIONS v1.0 against the current codebase

Status: draft for review · October 2026 · No feature code written yet.

Inputs: `docs/DECISIONS.md` (wins), `docs/TCP-BUILD-SPEC.md` (Spec), `docs/SPEC-ADDENDUM.md` (Add.), `docs/design/README.md` (92 screens), `docs/marketing/LANDING-COPY.md`.
Baseline: `main` at `d177466` — migrations `0000`–`0032`, policies up to `0026`, Next 15 + Clerk + Supabase + Razorpay, Vitest DB tests against a throwaway Postgres.

Rules for every phase:
- One phase = one PR. CI (`npm run ci`) green before the PR opens.
- Every new table ships with its RLS policy file and a DB test in the same PR.
- Every state change, tick, credit and payout calls `audit.log_event`.
- Money: integer cents (USD) and paise (INR). Timers computed server-side from stored timestamps.
- Feature flags (DECISIONS §12) are enforced in the database, not just hidden in the UI.
- Migrations are numbered from `0033`, policies from `0027`. Never applied to production by the build.

Section 9 lists the conflicts and open questions. Q1–Q8 are answered (section 8a); they override anything below that disagrees.

## 8a. Answers to Q1–Q8 (owner, October 2026)

| # | Decision |
| --- | --- |
| Q1 | **Multiple roles per user** — `user_roles` table. Admin = SALES + OPS + FINANCE; pod lead = QC + pod. |
| Q2 | **Separate INR payouts.** Escrow ledger keeps client USD money only; the "split must sum to price" rule is removed. Designer/QC pay lives in `payout_obligations` (paise), created on CLOSED, exported to CSV for bank transfer. Margin = price − payouts at the admin rate (Q7). |
| Q3 | **Order ref = `{CLIENT}-{PRODUCT}-{SERVICE}-{NUMBER}`**, e.g. `MJ1-RN-C-23950`. `CLIENT` = business-name initials + counter, generated automatically at sign-up (Meera Jewels → MJ1, next MJ client → MJ2). `PRODUCT` = RN ring (signets included), BD band, PD pendant, ER earrings, BR bracelet, BG bangle, NK necklace, OT other. `SERVICE` = `C` CAD, `R` render, `CR` CAD + render. `NUMBER` = one global running counter starting at 1, no zero padding (1, 2 … 10 … 100). **Designers see the job code without the client part** (`RN-C-23950`); files are named with the full ref only when delivered to the client. The full ref and the client code are column-revoked from designers like other client identifiers (1.1). |
| Q4 | **Credit balance, admin decides.** A missed standard SLA creates a *pending* credit (full amount paid) and puts it in an admin queue. Admin must choose: apply to next order · refund to card/bank · partial credit (amount + reason) · reject (reason). Every choice is audited; one decision per breach. With `auto_sla_credit` on (November) the default is still a pending credit — confirm then whether to auto-apply. |
| Q5 | **New linked order** for changes after approval: own ref, quote, payment and SLA clock; `based_on_order_id` carries the brief over (hidden from designers). |
| Q6 | **Only the DECISIONS §11 minimum is required.** Karat, purpose, output format and finish become optional. |
| Q7 | **Admin-set fixed USD→INR rate** in `app_settings` (default ₹84 = $1). |
| Q8 | **Supabase `pg_cron`** runs `sla_sweep()` every minute. Needs the extension enabled once in the Supabase dashboard; local/CI tests call `sla_sweep()` directly. |

---

## 0. Traceability — every doc section → phase

| Doc section | Phase |
| --- | --- |
| DECISIONS §1 Business basics (USD/INR, no TCC) | 1 (money columns), 6 (copy) |
| DECISIONS §2 / Spec §1 Roles + visibility | 1 |
| DECISIONS §3 / Spec §2 Categories | 1 (seed), 2 (quote) |
| DECISIONS §4 / Add. A1 §6 Prices, first design, plans | 2 (plans flagged off) |
| DECISIONS §5 / Spec §5 Payouts | 2 (lock at quote), 3 (obligation on close) |
| DECISIONS §6 / Spec §4 / Add. A1 §4 SLA | 2 |
| DECISIONS §7 Guarantees | 2 (SLA credit), 7 (spec guarantee) |
| DECISIONS §8 Revisions | 3 |
| DECISIONS §9 / Spec §9 Deliverables + slots | 3 (slots, naming, STL/3DM), 7 (fingerprint, cert, weight, preview) |
| DECISIONS §10 / Spec §8 Checklist + audit | 3 |
| DECISIONS §11 / Spec §6–7 Ordering, assignment, messaging | 3 (assignment), 4 (on-behalf, threads), 5 (N1/N7 UI) |
| DECISIONS §12 Feature flags | 1 (flag table), every phase respects it |
| DECISIONS §13 Payments | 2 |
| DECISIONS §14 Compliance | 6 (terms/privacy), 1 (seed audit for TCC data) |
| DECISIONS §15 Open decisions | defaults encoded as admin settings (Phase 1) |
| Spec §0 Rules | all |
| Spec §3 Order model + state machine | 1 (columns), 2 (quote/pay), 3 (assign/QC) |
| Spec §10 Notifications | 2, 3, 4 (each phase adds its events) |
| Spec §11 Screens → routes | 5 |
| Spec §12 Acceptance tests | listed per phase; all re-run in 8 |
| Add. A2 Certificate | 7 |
| Add. A3 Fingerprinting | 7 |
| Add. A4 Weight sheet | 7 |
| Add. A5 Preview link | 7 |
| Add. A6 Spec claims | 7 |
| Add. A7 Public stats | 7 (computation only; flag `public_stats` off) |
| Add. A8 Website + tracking | 6 |
| Add. A9 Acceptance tests | 2, 6, 7, re-run in 8 |
| design/README components + screens | 5 (portal), 6 (website) |
| LANDING-COPY | 6 |

---

## Phase 1 — Database + permissions

Goal: the data model and RLS for everything later phases need, plus the anonymity fix. No UI beyond what is needed to keep existing pages working.

### 1.1 Must-fix: clients are linkable across orders

**Finding.** A designer can read raw Clerk user IDs belonging to the client, so the same client is recognisable across orders:

| Surface | Column | How a designer reaches it |
| --- | --- | --- |
| `messages` | `sender_id` (client's Clerk ID on every client message) | `messages_read` policy (0010) → any order they can read; `app/(app)/orders/[id]/page.tsx:66` selects it |
| `orders` | `client_id`, `org_id` | `orders_designer_select` (0003) returns the whole row |
| `file_versions` | `uploaded_by` | `file_versions_read` (0007) |
| `disputes` | `raised_by` | `disputes_read` (0011) |
| `escrow_ledger` | `created_by` on HOLD = client | `escrow_ledger_read` (0009) |
| `order_specs` | `based_on_order_id` links a revision to the client's earlier order; `reference_name` is free text (often the end customer's name) | `order_specs_visible_with_order` (0023) |
| `notifications` fan-out | uses ids internally only — OK | — |

The same policies also leak **prices** to designers (`orders.price_total`, `qc_payout`, `platform_commission`; escrow HOLD amount), which DECISIONS §2 forbids.

**Fix (migration `0033_pseudonymous_identity.sql`, policy `0027_identity_columns.sql`):**
1. **Column privileges, not just row policies.** `REVOKE SELECT` on the tables above from `authenticated`, then `GRANT SELECT (col, …)` on the safe columns only. Raw user-ID columns (`client_id`, `designer_id`, `org_id`, `uploaded_by`, `raised_by`, `resolved_by`, `created_by`, `sender_id`, `qc_reviewer_id`) are not selectable by any app user. Clients, staff and the app get `is_mine` / party / alias through views and SECURITY DEFINER functions.
2. **Designers lose direct `orders` access.** Drop `orders_designer_select`. Designers read jobs only through `public.my_jobs()` / `public.my_job(p_job_id)`, which return: order ref, job id, category, product spec (minus `reference_name` and `based_on_order_id`), reference images, due times, status, own payout in paise. Never price, client ID, org, or another job.
3. **Per-thread pseudonyms.** New `thread_participants(thread_id, user_id, alias)`; `alias` is generated per thread (`Client`, `Team · {first name}`, `Designer`). Messages store `thread_id` + `sender_alias`; `sender_id` stays for audit but is column-revoked. View `thread_messages_v` (security_invoker) exposes `id, thread_id, sender_alias, is_mine, body, created_at`. Aliases are per-thread, so nothing repeats across orders.
4. **Files.** Add `uploader_party` (`CLIENT|DESIGNER|TEAM`) to `file_versions`; `uploaded_by` column-revoked. Download route `app/api/files/[versionId]/route.ts` keeps opaque storage keys and the `{ORDER}_{SLOT}_v{n}` name (Phase 3).
5. **Revision lineage.** Designer sees "Revision of an earlier job" + the copied brief, never the source order ID.
6. **`reference_name`.** Client-only label; hidden from designer and pod lead views.
7. **App changes required to keep pages working:** `app/(app)/orders/[id]/page.tsx`, `OrderDetail.tsx`, `types.ts`, `fileActions.ts`, `dashboard/page.tsx` read through the new views/functions; drop `client_id`, `sender_id`, `uploaded_by` from `select()` lists.

**Test (`tests/db/client_anonymity.test.ts`)** — the proof asked for:
- Seed one client with two orders, both assigned to the same designer, with messages, files, a dispute, an escrow hold, a revision linked by `based_on_order_id`, and reference images.
- As the designer: iterate **every** table and view in `public` where `authenticated` has SELECT (from `information_schema.column_privileges`) and **every** function `authenticated` can EXECUTE (from `pg_proc` + `has_function_privilege`), call each with the designer's job/order ids, and serialise every returned value.
- Assert none of these appear: client Clerk ID, `client_profiles.id`, email, legal name, phone, `org_id`, `reference_name`, the other order's id, `price_total`.
- **Linkability check:** for the two orders, collect every string value the designer can see; assert the intersection is only allow-listed constants (enum values, category letters, the designer's own id/alias, `Team · …` staff aliases).
- A meta-test fails if a new table/function is added that the test does not cover (it enumerates the catalogue, so new surfaces are covered automatically).
- Route-level companion in `tests/config/designer-response-anonymity.test.ts`: call the designer server actions/route handlers with mocked auth and scan the JSON/RSC payload for the same values. The full browser-level version is in Phase 8.

### 1.2 Roles, pods, staff names

Migration `0034_roles_pods.sql`, policy `0028_pods_rls.sql`.
- `user_roles(user_id, role)` — many roles per user, so ADMIN = SALES + OPS + FINANCE (Spec §1). `users.role` stays as the primary role for compatibility; `app.has_role(role)` replaces `app.current_user_role() = …` in policies. (Q1.)
- `pods(id, name)`, `pod_members(pod_id, user_id, member_role IN ('POD_LEAD','DESIGNER'))`. `app.current_pod_ids()`.
- `staff_profiles(user_id, first_name, display_ref)` — source of "Team · {first name}" and `DSG-xxxx` designer refs; not readable by clients/designers (aliases are copied into threads).
- `app.is_admin()`, `app.is_pod_lead_of(pod_id)`.
- Policy rewrite: `orders_qc_select` (0003) and `orders_staff_select` (0006) narrowed so QC sees only orders in own pod; admin sees all.

### 1.3 Order model (Spec §3)

Migration `0035_order_model.sql`:
- Enums: `job_tier(standard, complex)`, `sla_status(pending, running, met, breached, breached_credited)`, `order_source(portal, whatsapp, email, phone)`, `intake_mode(full, quick)`, `service_kind(cad, render, cad_render)`.
- `job_categories(letter, minutes, tier, designer_rate_paise, effective_from)` seeded A–L exactly per DECISIONS §3; history rows so a rate change applies only to later quotes.
- `price_bands(code, categories, price_cents, quoted)` seeded $55 / $85 / from $120 / $49 first design.
- `orders` add: `order_ref` (Q3), `category`, `tier`, `service`, `complex_deadline_hours`, `sla_started_at`, `sla_due_at`, `first_look_at`, `sla_status`, `sla_credit_id`, `source`, `created_on_behalf_by`, `intake_mode`, `client_po`, `pod_id`, `pod_lead_id`, `designer_payout_paise`, `qc_payout_paise`, `paid_at`, `payment_method (razorpay|manual)`.
- `order_specs`: add `ring_size`, `inner_circumference_mm`, `inner_diameter_mm`, `length_mm`; relax NOT NULL on `karatage`, `purpose`, `format`, `finish` for quick intake (Q6). Submission minimum enforced by `app.brief_is_submittable(order_id)` (DECISIONS §11).
- Constraint: `tier='complex' ⇒ complex_deadline_hours IS NOT NULL` once QUOTED.

### 1.4 Tables for later phases (schema + RLS now, logic later)

Migration `0036_ops_tables.sql`, policies `0029`–`0033`:
- `jobs(id, order_id, kind IN ('original','client_change'), category, version, designer_payout_paise)` — DECISIONS §5: a client change after approval is a new job. (Q5.)
- `job_assignments(job_id, designer_id, assigned_by, assigned_at, override_reason)`.
- `checklist_items` (seed, Phase 3), `order_checks`.
- `deliverable_slots` (seed: 3DM, STL, TV, PV, RV, FV, BV, M, DD, GW required; optional gold weight chart, diamond details, summary), `deliverables(job_id, slot, file_version_id, version)`.
- `order_screenshots`, `sla_events`, `client_credits` (Q4), `payout_obligations` (INR, replaces escrow RELEASE for staff pay — Q2).
- `message_threads(id, order_id, kind IN ('client_team','internal'))`, `thread_participants`.
- `feature_flags(key, enabled)` seeded from DECISIONS §12: `wallet_checkout=false`, `auto_sla_credit=false`, `rush=false`, `in_app_payouts=false`, `capacity_blocking=false`, `render_brief_one_page=true`, `public_stats=false`, `dental=false`. Admin-only write; read via `app.flag(key)`.
- `app_settings` (QC buffer 60 min, shift 480 min, wall/prong minimums 0.8 mm, alloy densities, metal price per gram, USD→INR rate for the 40 % check — Q7).

RLS matrix (Spec §1 visibility), enforced per table:

| Data | Client | Designer | Pod lead | Admin |
| --- | --- | --- | --- | --- |
| Orders | own | via `my_jobs()` only | own pod | all |
| Client identity | own | never | order ref only | all (audited read) |
| Designer identity | never | self | refs in own pod | all |
| Jobs / assignments | — | assigned to me | own pod | all |
| Checklist | — | own column + read QC | both | read |
| Payouts | — | own | own QC pay | all |
| Price | ✓ | never | ✓ | ✓ |
| Threads | `client_team` of own orders | `internal` of own jobs | both, own pod | all |

### 1.5 Other Phase 1 work

- `db/policies/0027+` comment headers follow the existing style.
- `core/auth/roles.ts`, `core/nav/tabs.ts`: multi-role aware; tabs for POD_LEAD and ADMIN.
- `config/flags.ts` + `core/flags/` reading `feature_flags`.
- Grep seed/fixtures/content for TCC data (DECISIONS §14) — add `tests/config/no-tcc.test.ts`.
- Update `README.md` / `docs/SYSTEM.md` headers to point at DECISIONS (they describe the old marketplace model).

### Phase 1 tests
- `tests/db/client_anonymity.test.ts` (above).
- `tests/db/rls_matrix.test.ts`: designer cannot read an unassigned job, a `client_team` thread, or any price; pod lead cannot read another pod; client cannot read designer identity (Spec §12.1).
- `tests/db/roles_pods.test.ts`: admin = SALES+OPS+FINANCE gets admin rights; QC without pod sees nothing.
- `tests/db/categories.test.ts`: A–L seed exact; rate change only affects later quotes.
- `tests/db/feature_flags.test.ts`: only admin can flip; defaults match §12.
- Existing suites updated where policies changed (`messaging`, `staff_order_visibility`, `qc_identity`, `file_versions`, `disputes`, `escrow`).

### Phase 1 — as built (differences from the plan above)

- Migrations `0033`–`0037`, policies `0027`–`0030` (described in `db/README.md`).
- `my_jobs()` became `visible_orders()` for every role (designer shape: job code, no money, product from the brief enum) plus `job_brief()`.
- Threads were built at the database level now, not in Phase 4: `client_team` / `internal`, per-thread aliases, `post_thread_message()`, `order_messages()`. Phase 4 keeps on-behalf intake, the staff thread UI and Realtime.
- Existing client↔designer messages are frozen in an admin-only `legacy` thread (Q12 default).
- No `jobs` table: a change after approval is a new linked order (Q5).
- `brief_missing()` exists; blocking submit on it lands with the N1 screen in Phase 5 (enforcing it now would break the current stepped brief).
- Multi-role tabs (`core/nav/tabs.ts`) and a flags helper in `config/` move to Phase 5, where the screens that use them are built.
- The route-level anonymity check is a source guard (`tests/config/identity-columns.test.ts`); the full browser crawl stays in Phase 8.
- Found and fixed while testing: `app.escrow_held()` and `settlement_state()` were callable by any role for any order id (price leak to designers, money leak to anyone signed in).
- Brooches map to product code `OT`.
- Not enforceable by the database: free text written by the client (brief notes, change summary) reaches the designer as written.

---

## Phase 2 — Quote, confirmation and the SLA clock

Changed by DECISIONS v1.1: the clock starts when the order is **paid and confirmed** (whichever is later); payment providers moved to Phase 9.

Migrations `0039_payment_methods.sql`, `0040_quote_sla.sql`; policy `0031_quote_sla_rls.sql`.

**Database**
- `set_order_category(order, letter)` — admin, or the pod lead of the order's pod.
- `quote_order_v2(order, category?, price_cents?, complex_deadline_hours?)` — SALES (admin). Default price from the band; $49 first design once per account; override allowed. Locks `designer_payout_paise` (category rate) and `qc_payout_paise` (`max(₹500, round_to_50(USD × 1000 / 60))`). Returns a warning when payouts exceed 40 % of the price at the admin FX rate. Complex requires a deadline.
- `confirm_order(order)` — admin or pod lead; records `confirmed_at`.
- `mark_payment_received(order, method, reference)` — FINANCE (admin) for manual / Wise / PayPal / bank payments; holds the quoted amount like a card payment.
- Clock: a trigger on the escrow HOLD sets `paid_at`; `app.maybe_start_sla()` starts the clock once `paid_at` and `confirmed_at` both exist: due = start + 6 h (standard) or + deadline (complex).
- First look: a trigger on `→ CLIENT_PREVIEW` sets `first_look_at`, and `met` when on time.
- `sla_sweep()` every minute via `pg_cron`: overdue → `breached`; standard tier → one **pending** credit for the amount paid (unique per order). With `auto_sla_credit` on, the credit is created already decided as "apply to next order".
- `decide_sla_credit(credit, decision, amount?, reason?)` — admin: apply to next order, refunded, partial (reason, smaller amount), rejected (reason). Once only.
- Notifications: clock started (client, pod lead), breach (pod lead), credit decided (client).

**App** — staff quote panel (category, price, deadline, warning), Confirm order, Mark paid, SLA line on the order, `/admin/credits` decision queue.

**Tests** — payout examples ($20 → ₹500, $55 → ₹900, $60 → ₹1,000, $85 → ₹1,400, $180 → ₹3,000; D → ₹500, L → ₹4,000); C defaults to $55; $49 once per account; > 40 % warns; clock starts at the later of paid / confirmed (both orders); D due + 6 h, H due + deadline; first look at 5:59 met, 6:01 breached; sweep twice → one credit; complex breach → no credit; credit decided once, by admin only.

---

### Phase 2 — as built
- As planned above; runbook `docs/PHASE-2-ROLLOUT.md`.
- The old `quote_order` (free USD split) still exists for the existing test fixtures; the app no longer calls it. Remove it in Phase 3 with the payout rework.
- "Refunded" credits are recorded only; the money goes back by hand until Phase 9.
- Orders paid before Phase 2 get `paid_at` backfilled; their clock starts when someone presses Confirm order.

---

## Phase 3 — Assignment + checklist + upload slots

Migrations `0040_assignment.sql`, `0041_checklist.sql`, `0042_deliverables.sql`, `0043_state_machine_v2.sql`.

**State machine (Spec §3) — changes to `order_transitions` / `transition_order`:**
- `SUBMITTED → QUOTED`: admin (SALES role) via `quote_order_v2` only.
- New pre-step `assign_pod_lead(order_id, pod_lead_id)` (admin), not a status.
- `PAYMENT_HELD → ASSIGNED`: pod lead of the order's pod via `assign_designer(job_id, designer_id, override_reason?)`; designer in same pod; capacity = Σ open category minutes per shift vs 480. Over capacity: warning only while `capacity_blocking` is off; blocked without admin override when on.
- `IN_PROGRESS → DESIGNER_SUBMITTED`: 19 designer ticks + sign-off + all required slots filled.
- `DESIGNER_SUBMITTED → QC_REVIEW`: pod lead (today OPS — Q10).
- `QC_REVIEW → CLIENT_PREVIEW`: all QC ticks; calls `record_first_look`.
- `QC_REVIEW → REVISION_REQUESTED`: non-empty note.
- `CLIENT_PREVIEW → REVISION_REQUESTED` by client: counted; max 2 rounds within 14 days of `first_look_at` (DECISIONS §8). Third request or late → `create_change_job()` (new job, own category, own pay).
- `DELIVERED → REVISION_REQUESTED` within 30 days (Spec): **not built** — conflicts with DECISIONS §5/§8 (C4).

**Checklist** — seed 18 items + designer sign-off (Spec §8; Q9). `tick_check(order_id, item_id, column)`: designer column only in IN_PROGRESS by assignee; QC column only in QC_REVIEW, after designer sign-off, by pod lead ≠ designer (existing 0020 rule). New version resets both. Every tick audited.

**Upload slots** — `core/files/sanitizationGate.ts`: add STL (binary + ASCII `solid`) and 3DM (`3D Geometry File Format`) rules to `DELIVERABLE_ALLOWLIST`; 3DM metadata stripping via existing `rhino3dm` (notes, author, revision history). `fileActions.ts`: upload into a slot; server renames to `{ORDER}_{SLOT}_v{n}.{ext}`. Map slots ↔ existing `file_kind` (review set vs release set gate stays — download unlocks after approval).

**Payouts** — on CLOSED, create `payout_obligations` rows (designer per job, QC per order, INR). `in_app_payouts` off → admin CSV export (`app/(app)/admin/billing/export/route.ts`); existing Razorpay Route path (`lib/payouts/execute.ts`, 0024) stays but only runs when the flag is on.

**Notifications** — assigned (designer, pod lead); 60 min before designer due (via SLA cron); submitted (pod lead); sent back (designer); first look (client); approved/re-opened (designer, pod lead, admin). `app.fanout_notifications` (0015) extended with pod lead/admin recipients.

**Tests** — 481st minute blocked only with `capacity_blocking` on (warns when off); can't submit at 18/19; QC can't pass at 18/19; send-back without note fails; STL/3DM upload works and strips metadata; file auto-named; third client revision → new job; QC send-back not paid twice; payout export totals match obligations.

---

### Phase 3 — split and owner answers (October 2026)
- **Q10:** submitting goes straight to the pod lead's QC queue.
- **Q9:** 19 ticks for each column: 18 checks + sign-off; row 19 is the pod lead's own sign-off in the QC column.
- **Q20:** all 10 required slots (3DM, STL, TV, PV, RV, FV, BV, M, DD, GW). The client reviews all 5 render views plus diamond details and gold weight; 3DM, STL, M and the summary unlock after approval.
- Split into **3a** (assignment, capacity, checklist, slots, STL/3DM, file names — migration `0041`, policy `0032`, runbook `docs/PHASE-3A-ROLLOUT.md`) and **3b** (2 revision rounds within 14 days then a new linked order, payout obligations on close, CSV export, removal of the old `quote_order`, 60-minute due reminders).
- 3DM files are rebuilt clean (`lib/files/strip3dm.ts`): geometry, layers (name, colour) and units are kept; creator names, notes, object names and user data are dropped. Files with blocks are refused with a request to explode them. Layer names are kept as written.
- Image slots take PNG or JPEG; PDF is refused on the delivery path (it cannot be cleaned reliably).

### Phase 3b — as built
- Migration `0042`, policy `0033`, runbook `docs/PHASE-3B-ROLLOUT.md`.
- **Revisions:** the client asks with a note; 2 rounds within 14 days of first look; each opens a new work version; designer and pod lead are notified; QC send-backs are not counted. The note reaches the designer as the round's brief, without who wrote it.
- **Changes after that (Q5):** a new linked order (same client, product and pod, brief copied plus the change), quoted at its own category. Ordering a paid change on a preview whose rounds are used approves that preview (the change is built on it). Designers never see which order a change came from (Phase 1 linkability rule).
- **Payouts:** CLOSED creates the designer and QC obligations at the INR pay locked at quote, once per party. `/admin/payouts`: export owed rows with bank details as a batch, download the CSV (account number, IFSC, rupees), mark paid (payees notified). Payees without usable bank details stay owed. The old Razorpay Route path (0024) is untouched and stays behind `in_app_payouts`.
- **Reminder:** designer due = SLA due − 60 min; the sweep notifies the designer once, 60 minutes before.
- **Push:** wording added for every notification kind the database sends (QC, SLA, CREDIT, REVISION, APPROVED, CHANGE_ORDER, DUE_SOON); the test now reads all migrations.
- **Removed:** the old free-split `quote_order`; test fixtures use `quote_order_v2`.
- **Known gaps:** a change order's designer gets the original's files only if they did the original (pick the same designer); file attachments in threads come with Phase 4. `DELIVERED → REVISION_REQUESTED` within 30 days stays unbuilt (C4).

---

## Phase 4 — WhatsApp/email orders + message threads

Migrations `0044_on_behalf_intake.sql`, `0045_threads.sql`.

**On-behalf orders (A10, P6)** — `create_order_on_behalf(client_id, source, received_at, service, category, screenshots[], brief?, assignee?, notify)`: admin or pod lead; ≥ 1 screenshot or rejected; `intake_mode='quick'`; visible to client as "Placed via WhatsApp by the team"; clock starts only on payment. Pod lead may create only for their pod and assign to own designers. Notify toggle: email via existing outbox (`0025`); WhatsApp delivery — Q11.

**Threads (DECISIONS §11; rebuilt from scratch — the v0 "Conversation" redesign is dropped)**
- Every order gets `client_team` (client + admin + pod lead) and `internal` (designer + pod lead + admin) on creation/assignment.
- `post_message(thread_id, body)` replaces `post_message(order_id, body)`. Designer posting to `client_team` fails in RLS **and** in the function.
- Existing client↔designer messages (0013): migrated into `internal`? No — they mix parties. Proposal: freeze as read-only legacy, visible to admin only (Q12).
- Realtime: Supabase Realtime `postgres_changes` on `thread_messages_v` filtered by `thread_id` fits — RLS applies to Realtime with the Clerk JWT bridge. Fall back to polling if the JWT bridge can't authorise Realtime (verify in this phase).
- Attachments in threads go through the same sanitization gate.

**Tests** — no screenshot = rejected; on-behalf order visible to client; clock starts only at payment; designer post to `client_team` rejected by RLS; designer cannot list `client_team` threads; aliases differ across orders; Realtime subscription for designer on a `client_team` thread receives nothing.

### Phase 4 — split and owner answers (October 2026)
- **New clients:** the team opens the client's account (email, no password; the client signs in with an emailed code) and places the order in one step. An email that already has an account is reused.
- **Q11 (notifying):** both channels. An automatic email (outbox template `ORDER_PLACED_FOR_YOU`) and a "Send on WhatsApp" button (a `wa.me` link with the message written; the team presses send). Orders come by email as often as WhatsApp, so the source is recorded as email, WhatsApp or phone.
- **Screenshots:** the client and the team only; never designers. The pod lead gives designers clean reference pictures through the brief, which the team may now write on orders it placed.
- **Q12:** unchanged (old client↔designer messages frozen, admins only).
- Split into **4a** (on-behalf orders, client accounts, screenshots, email + WhatsApp, team-written brief, staff posting in both threads, 20-second page refresh; migration `0043`, policy `0034`, runbook `docs/PHASE-4A-ROLLOUT.md`) and **4b** (attachments in threads through the sanitization gate, Supabase Realtime in place of the refresh).

### Phase 4b — as built
- Migration `0045`, policy `0035`, runbook `docs/PHASE-4B-ROLLOUT.md`.
- **Attachments:** `thread_files` + `post_thread_file` (the thread's post rules; the designer thread takes only cleanable formats, and the server cleans them), `thread_attachments`, `thread_file_for_download` (the thread's read rule), `/api/thread-files/[fileId]` (signed URL, 404 for not found and not allowed alike). Server-named per thread (`file_n.ext`).
- **Updates:** Supabase Realtime was not used. It needs the Clerk token in the browser and Realtime authorisation for the threads, which can't be verified outside the live project. Instead, `order_activity_stamp` (the newest audit entry the viewer could see the effect of) is polled every 5 s from `/api/orders/[id]/stamp`, and the page re-reads only when it moves. Realtime can replace the poll later without changing anything else.
- Closes the Phase 3b gap: a change order's designer gets the original files from the pod lead in the designer thread.

---

## Phase 5 — Portal screens from docs/design

Shared components first (design/README): button, status tag (needs/active/done/muted), category badge, timer, field, pills, table row, checklist row, upload slot, list row. Fonts: add Instrument Serif (display) next to Geist/Geist Mono. Tokens: replace the blue accent `#2F51D9` and the dark theme in `app/globals.css` with the design palette (C9). `tests/config/color-contrast.test.ts`, `surfaces.test.ts`, `type-scale.test.ts`, `controls.test.ts` updated to the new tokens.

Routes (Spec §11; route conflict C8):

| Screens | Route | Current |
| --- | --- | --- |
| S1, S2, S3 | `/login`, `/signup`, `/welcome` | `/sign-in`, `/sign-up` (keep as redirects) |
| C1 | `/home` (Q13) | `/dashboard` |
| N0, N1, N7, N2–N4 (mobile), N5, N6 | `/orders/new`, `/orders/new/review`, `/orders/[id]/sent` | `/orders/new`, `/orders/[id]/brief` (stepped wizard → mobile) |
| C3, C3b, C4, C5, C6, C7, C7b, C8 | `/orders`, `/orders/[id]`, `/orders/[id]/pay`, `/orders/[id]/review`, `/messages`, `/files` | `/orders`, `/orders/[id]` (one combined page) |
| C9, W1–W3 | `/account`, `/wallet*` (wallet pages read-only while `wallet_checkout` off) | `/account`, `/settings/payouts` |
| D1 | `/apply-designer` | exists |
| D2, D3, D4, D4b, D5, D6 | `/work`, `/work/[jobId]`, `/work/[jobId]/checklist`, `/work/messages`, `/work/earnings` | `/orders` ("My work"), `/onboarding/designer`, `/settings/payouts` |
| P1, P2, P3, P4, P5, P6 | `/qc`, `/qc/[orderId]`, `/qc/orders`, `/qc/earnings`, `/pod/board`, `/pod/orders/new` | none |
| A1, A2, A3, A10 | `/admin`, `/admin/orders`, `/admin/orders/[id]`, `/admin/orders/new` | `/admin` (queue) |
| A4, A5, A6, A7, A8, A9 | `/admin/access`, `/admin/applications`, `/admin/leads`, `/admin/account`, `/admin/billing`, `/admin/clients` | `users`, `applications`, `leads` exist |

Rules: desktop ordering is one page (N1/N7); N2–N4 mobile only; C3b/C7b mobile only; staff desktop-first, client/designer mobile-first; prices from DECISIONS, not the mockups; hide rush, plans checkout, public stats per flags. Server actions only; each screen reads through the Phase 1 views.

Tests: `tests/config/route-reachability.test.ts` extended to every route; per-role tab tests in `core/nav/tabs.test.ts`; N1 submit blocked until DECISIONS §11 minimum (unit test on `core/orders/briefQuality.ts` successor).

---

## Phase 6 — Marketing website

Reuse PR #32's `(marketing)` route group, `marketing-header`, `marketing-footer`, `cta-section`, `faq-section`, `workflow-steps`, `lib/seo.ts`, sitemap/robots, contact lead capture (0017/0026).

| A8 route | Action |
| --- | --- |
| `/` | Rewrite to LANDING-COPY Home |
| `/jewelry-cad` | New; 3-field brief start → `brief_started`; creates a lead/draft, sends to signup |
| `/pricing` | New; bands + plans ("talk to us") |
| `/how-it-works` | Rewrite (5 steps) |
| `/guarantee` | New |
| `/quality` | New; 19 checks in 7 groups, certificate example. `/quality-control` → 301 |
| `/faq` | New (move `faq-section` content) |
| `/terms`, `/privacy` | Rewrite content to DECISIONS (needs legal text — Q14) |
| `/signup`, `/login` | Route to Clerk; signup stores first-touch UTMs + required "How did you hear about us?" |
| `/about`, `/security`, `/blog`, `/contact`, `/for-designers`, `/apply-designer` | Not in A8 — keep/remove per Q15 |

Copy conflicts to remove (C11): "marketplace", "connecting … with vetted designers", "double-blind", "escrow"/"funds are held until …", blog posts about marketplaces.

Tracking: `lib/analytics/utm.ts` (first-touch cookie), `marketing_attribution` table (migration `0046_attribution.sql`, RLS: write via function, read admin), events `brief_started`, `brief_submitted`, `payment_completed`, `first_look_viewed`, `approved`, `preview_link_created`, `spec_claim_opened`. Provider: Q16.

Tests: every A8 route returns 200 and carries UTMs to signup; "How did you hear" required; no TCC mention; no testimonials/logos/stats rendered while placeholders empty / `public_stats` off.

---

## Phase 7 — Certificate, fingerprinting, weight sheet, preview link, claims

Migrations `0047_certificates.sql`, `0048_deliverable_files.sql`, `0049_weight_sheet.sql`, `0050_preview_links.sql`, `0051_spec_claims.sql`, `0052_public_stats.sql`.

- **A2 Certificate** — `qc_measurements(order_id, version, min_wall_um, min_prong_um, stone_seats jsonb, ring_size, mesh_tolerance, open_edges)`, `spec_waivers`. Generated on QC pass in `lib/pdf/certificate.ts` (PDF library choice: Q17); stored immutably; designer/QC shown by ref only.
- **A3 Fingerprinting** — `deliverable_files(file_version_id, sha256, size, version, archived_at)`; read-only storage bucket (no overwrite/delete policy); hash shown on certificate and C8.
- **A4 Weight sheet** — volume entered by designer (v1); weights for 10K/14K/18K/Pt950/Ag925 from `app_settings` densities; optional metal cost labelled "estimate". `core/weights/`.
- **A5 Preview link** — `preview_links(token_hash, order_id, expires_at, revoked_at, view_count)`; public route `app/p/[token]/page.tsx` outside both route groups; jeweler logo from client profile; no TCP brand, price or order data; GLB conversion (Q18).
- **A6 Claims** — `spec_claims` with uploaded file hash, photos, spec, casting details; checks: hash match, ≤ 30 days, waiver; pod lead re-measure; upheld → free fix job + one credit (unique); > 2 per quarter → admin review.
- **A7 Stats** — weekly materialised computation; never shown while `public_stats` off.

Tests (Add. A9): PDF has 19 ticks + specs; edited file detected; densities change weights; preview link shows jeweler logo, no TCP; expired/revoked → "not available"; token can't reach another order; claim button gone after 30 days; hash mismatch blocks claim; upheld claim credits once.

---

## Phase 8 — End-to-end tests

- Add `@playwright/test` (pinned to the pre-installed Chromium via `executablePath`), `tests/e2e/`, a seeded local stack (throwaway Postgres + `next start` + Clerk test keys/mocks).
- Journeys: client portal order → quote → pay (Razorpay test mode / manual) → first look → approve → download; on-behalf WhatsApp order; designer job → checklist → slots → submit; pod lead QC pass/send-back; SLA breach → Issue credit; spec claim; preview link; website → signup with UTMs.
- **Anonymity e2e:** as a designer, crawl every reachable page and capture HTML + RSC/JSON responses; assert no client identifier (same list as 1.1) appears, and no shared token across two orders of the same client.
- Re-run every Spec §12 and Add. A9 acceptance test as an e2e assertion.
- CI: new `e2e` job (separate from the 5-minute `verify` job).

---

## Phase 9 — Payment providers (last, by owner decision)

- PayPal checkout on the Pay screen (client chooses card or PayPal), webhook-confirmed like Razorpay.
- Wise: bank details on the invoice, then automatic matching of incoming transfers by order reference (Wise Business API).
- Razorpay live keys, international cards; refunds of SLA credits decided as "refunded" sent through the provider that took the payment.
- Any other provider the owner chooses.
- Wallet / credit packs / plans checkout (flag `wallet_checkout`).

---

## 9. Conflicts and ambiguities

### Conflicts — docs vs code (DECISIONS wins unless you say otherwise)

| # | Area | Code today | Docs | Proposed resolution |
| --- | --- | --- | --- | --- |
| C1 | Messaging model | One thread per order, client ↔ **designer** direct (0013, `post_message`) | Designer never in client threads; `client_team` + `internal` (DECISIONS §11) | Rebuild in Phase 4; anonymity fix in Phase 1 |
| C2 | Identifier leak | Designer reads client Clerk ID (messages, orders, files, disputes, ledger) and revision lineage | DECISIONS §2, §7.3 | Phase 1 must-fix (1.1) |
| C3 | Price leak | Designer reads `price_total`, split, escrow HOLD amount | Designer never sees prices | Phase 1 (`my_jobs()` only) |
| C4 | Revisions | `CLIENT_PREVIEW → REVISION_REQUESTED` unlimited; Spec adds `DELIVERED → REVISION_REQUESTED` within 30 days | DECISIONS §8: 2 rounds in 14 days, then new job; §5 changes after approval = new job | Follow DECISIONS; don't build the 30-day reopen (30 days is the claim window) |
| C5 | Roles | `users.role` is one value; `ADMIN`/`SUPER_ADMIN` enum values unused; only OPS can grant roles (0032) | ADMIN = SALES + OPS + FINANCE; POD_LEAD = QC + pod | `user_roles` table (Q1) |
| C6 | Pods | No pods; QC sees every order in QC_REVIEW | Pod lead sees only own pod | Phase 1 |
| C7 | Payout money | Payouts are USD legs of the escrow that must sum to the price; released by FINANCE through Razorpay Route | INR payouts locked at quote; October = export + bank transfer; in-app payouts off | Separate `payout_obligations` in paise; escrow keeps client money only (Q2) |
| C8 | Assignment | OPS assigns a designer directly at `PAYMENT_HELD → ASSIGNED` | Admin → pod lead → designer | Phase 3 |
| C9 | Design tokens | Blue accent `#2F51D9`, full dark mode, Geist only | Black/neutral palette, Instrument Serif display, no accent, no dark mockups | Replace in Phase 5 (Q19 on dark mode) |
| C10 | Routes | Client home `/dashboard`; designer work under `/orders`; auth at `/sign-in` `/sign-up` | Spec §11 puts client home at `/`, but A8 puts the marketing home at `/` | Client home `/home`; keep `/` marketing (Q13) |
| C11 | Website | Marketplace positioning: "vetted designers", "double-blind", "escrow", blog about marketplaces; routes `/about`, `/security`, `/blog`, `/contact`, `/for-designers`, `/quality-control` | "Your CAD department", Mumbai studio, guarantees, A8 route list | Rewrite to LANDING-COPY; Q15 for extra routes |
| C12 | Upload types | `DELIVERABLE_ALLOWLIST` = PNG, JPEG, STEP; STL and 3DM rejected | STL + 3DM required slots; Spec §9 "fix the upload check" | Phase 3 |
| C13 | Brief | No ring size / circumference / length fields; `karatage`, `purpose`, `format`, `finish` NOT NULL | Minimum = product, ≥ 1 reference, size, metal, centre stone; everything else optional; quick intake all optional | Phase 1 columns + relax NOT NULLs (Q6) |
| C14 | Rush | `priority_tier` has EXPRESS / RUSH and the brief offers them | Rush flag off | Hide in UI; reject non-STANDARD in `upsert_order_spec` while flag off |
| C15 | SLA credit target | No wallet; refunds go back through Razorpay (`refund_escrow`) | Credit to the client's wallet; wallet top-ups off in October | Credit ledger now (Q4) |
| C16 | Order reference | Opaque nanoid ids; README invariant "no sequential integer anywhere" | Screens and file names use `TCP-1042` | Q3 |
| C17 | Scheduler | GitHub Actions every 5 min (Vercel Hobby only daily) | SLA sweep every minute | Q8 |
| C18 | Spec vs DECISIONS | Spec §4 auto-credit; §7 block over capacity; §5 payouts via Razorpay | DECISIONS §12: manual credit, warning only, export | DECISIONS wins; Spec behaviour behind flags |
| C19 | Older docs | `README.md`, `docs/SYSTEM.md`, `OPERATIONS.md`, `LAUNCH.md`, `BLACKBOX.md` describe the marketplace/escrow model and roles SALES/OPS/FINANCE/QC | DECISIONS | Mark superseded in Phase 1; rewrite in the phase that changes each area |
| C20 | Existing screens | Combined order page (brief, files, messages, payouts, timeline); staff queue derived from transitions; designer onboarding/agreement; push notifications; offline page | 92 new screens | Rebuild per design in Phase 5; keep the audit-driven timeline, agreement gate, push and PWA plumbing |

### Ambiguities — need your answer

| # | Question | My default if you don't decide |
| --- | --- | --- |
| Q1 | Multi-role users: add `user_roles` (admin = SALES+OPS+FINANCE) or use the unused `ADMIN` enum value as one role? | `user_roles` table; `ADMIN` enum stays unused |
| Q2 | Escrow vs INR payouts: OK to stop forcing the payout split to sum to the USD price, keep escrow for client money only, and hold staff pay in a separate INR obligations table? Platform commission then = price − (payouts converted at FX). | Yes |
| Q3 | Order reference format: sequential `TCP-1042` (leaks volume, breaks the "no sequential id" invariant) or random `TCP-7K3Q`? | Random 4–6 char base32 |
| Q4 | Where does an October SLA credit live while the wallet is off: a credit ledger applied to the next invoice/order, or a Razorpay refund? | Credit ledger, applied manually to the next order |
| Q5 | Client changes after approval: new **job** under the same order, or a new **order** (existing `based_on_order_id` lineage)? Paid separately? | New order with lineage, quoted at its own category |
| Q6 | Which brief fields stay required for a portal CAD order beyond the DECISIONS §11 minimum (karatage? purpose? output format?) | Only the §11 minimum |
| Q7 | USD→INR rate for the 40 % payout warning and commission: admin-set fixed rate or live? | Admin setting, default ₹84 = $1 |
| Q8 | SLA sweep scheduler: Supabase `pg_cron` every minute (needs the extension in prod) or Vercel Pro cron? October only flags breaches, so 5-minute GitHub Actions is a fallback. | `pg_cron` calling `sla_sweep()` directly |
| Q9 | Checklist count: Spec §8 lists 18 items + "Designer sign-off (19)" + "QC reviewed by". Is the sign-off item 19 for both columns, and is "QC reviewed by" a 20th row? | 18 items + sign-off = 19 per column; "QC reviewed by" is the QC sign-off on row 19 |
| Q10 | Who moves `DESIGNER_SUBMITTED → QC_REVIEW` — automatic on submit, or the pod lead picks it up? | Automatic on submit |
| Q11 | WhatsApp: is there a provider (Business API / Twilio / Interakt), or is "notify by WhatsApp" a pre-filled `wa.me` link the team sends by hand in October? | `wa.me` link in October |
| Q12 | Existing client↔designer messages in production (if any): freeze as admin-only legacy, or delete? | Freeze, admin-only |
| Q13 | Client portal home route: `/home`, or keep `/dashboard`? | `/home`, `/dashboard` redirects |
| Q14 | Terms and privacy text: will you supply legal copy, or should I draft from DECISIONS for lawyer review? | Draft, clearly marked for review |
| Q15 | Keep `/about`, `/security`, `/blog`, `/contact`, `/for-designers` (D1 is "Become a designer")? | Keep `/contact` and `/apply-designer` (D1); remove the others from nav, keep URLs as redirects |
| Q16 | Analytics provider for the A8 events (PostHog, GA4, Plausible, first-party table only)? | First-party table only |
| Q17 | PDF generation for certificate and weight sheet (server-side library vs headless Chromium)? | `@react-pdf/renderer` |
| Q18 | GLB for preview links: convert server-side (needs a converter service for 3DM) or ask designers to upload a GLB slot? | Optional designer-uploaded GLB slot in v1; renders-only link if missing |
| Q19 | Dark mode: designs have none. Drop it, or keep a dark variant of the new palette? | Drop for v1 |
| Q20 | Slots vs deliverables: DECISIONS promises **3** render views but requires 5 view slots (TV, PV, RV, FV, BV). Which 3 does the client get? What is slot **M**? Is the GW slot the same as the A4 weight sheet? | Client gets TV, PV, FV; M = "measurements" image; GW slot replaced by the generated A4 sheet |
| Q21 | Pod lead creates on-behalf orders "for clients" — any client, or only clients already linked to their pod? | Any client; order lands in the pod lead's pod |
| Q22 | Staff first names in "Team · {first name}" — where from (Clerk profile or a new staff field)? Same alias for a staff member across orders is linkable by the client; acceptable? | New `staff_profiles.first_name`; yes, acceptable (staff, not designers) |
| Q23 | Render-only orders (N7): no category minutes table for renders — what category/payout does a render job get? | Admin picks a category A–L at quote like CAD |
| Q24 | Design palette uses greys not in the README list (`#8E8E88`, `#B0B0AA`, `#9C9C95`, `#F2F2EF`…). Treat the HTML as canonical over the README list? | Yes, HTML is canonical |

---

## Next step

Q1–Q8 answered (8a). Q9–Q24 can be answered before the phase that needs them.
