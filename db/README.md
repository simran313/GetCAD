# db/

The database is the source of truth and the last line of defense. Everything
here is **versioned SQL in the repo**. Schema changes are applied via Supabase
**migrations**, NEVER by clicking around the Supabase dashboard — the dashboard
leaves no reviewable, replayable history.

## Layout

- `migrations/` — schema, applied in filename order:
  - `0000_roles.sql` — create Supabase-compatible roles on a bare Postgres (no-op on Supabase).
  - `0001_enums.sql` — native Postgres enums (`role`, `user_status`, `order_status`).
  - `0002_users.sql` — Clerk-synced accounts, **no identity**.
  - `0003_profiles.sql` — `client_profiles` + `designer_profiles`, identity isolated, one per side.
  - `0004_orders.sql` — orders; money as integer minor units; opaque FKs only.
  - `0005_auth_identity.sql` — `app` schema identity helpers (`app.current_clerk_id()`, `app.current_user_role()`) the policies use; the DB side of the Clerk→Supabase bridge.
  - `0006_audit_log.sql` — append-only, hash-chained `audit.audit_log` + helpers (`audit.log_event()`, `audit.verify_chain()`).
  - `0007_onboarding.sql` — `public.ensure_self()`: audited, idempotent self-signup (creates the caller's `users` row + a `USER_CREATED` audit entry).
  - `0008_order_state_machine.sql` — `order_transitions` (legal-move graph as data), `public.create_order()`, and `public.transition_order()` (role-gated, audited status changes).
  - `0009_designer_onboarding_gate.sql` — gated designer onboarding: `apply_as_designer()`, `accept_designer_agreement()` (audited), `app.designer_is_assignable()`; `transition_order`'s ASSIGNED step enforces the gate.
  - `0010_file_versions.sql` — `file_versions` (opaque keys only) + `public.add_file_version()` (audited, sets `orders.current_version_id`). Every key comes from the single sanitization gate (`core/files`).
  - `0011_legal_agreements.sql` — the real document behind the gate: `agreement_documents` (immutable, versioned, `content_sha256`-fingerprinted) + `agreement_acceptances` (immutable signatures); `app.current_agreement()`; `accept_designer_agreement()` now verifies the fingerprint and records a signature; the gate requires acceptance of the **current** version (new version ⇒ auto re-gate).
  - `0012_escrow.sql` — the money layer: append-only `escrow_ledger` (HOLD/RELEASE/REFUND) + `app.escrow_held()`; `quote_order()` (SALES, conserving split), `hold_escrow()` (client), `release_escrow()` / `refund_escrow()` (FINANCE). Money-bearing status changes live ONLY here; `transition_order` refuses `QUOTED`/`PAYMENT_HELD`/`PAYOUT_RELEASED`/`REFUNDED` so status and money can't diverge. **Money is conserved** (split sums to total; release legs sum to held; one HOLD per order).
  - `0013_messages.sql` — double-blind messaging: append-only `messages` (opaque `sender_id` + `sender_party` label, no identity columns) + `post_message()` (order's client/designer only; party derived, audited `MESSAGE_POSTED`).
  - `0014_disputes.sql` — structured disputes: `disputes` (reason + resolution) + `raise_dispute()` (client, with reason) and `resolve_dispute()` (OPS `REWORK` → IN_PROGRESS, or FINANCE `REFUND` reusing `refund_escrow`). `transition_order` refuses reaching/leaving `DISPUTED` so a reason + outcome are always captured. Audited `DISPUTE_RAISED`/`DISPUTE_RESOLVED`.
  - `0015_notifications.sql` — in-app `notifications` generated from the audit log by an AFTER INSERT trigger (`app.fanout_notifications`) — no existing function changes. Identity-free summaries to the order's parties (never the actor); best-effort (never breaks the business action). `mark_notifications_read()`.
  - `0016_order_timeline.sql` — `public.order_timeline(order_id)`: a client-safe, order-scoped window onto the audit log (whitelisted lifecycle actions only, every row stripped of `actor_id` — only `actor_role` travels). Re-derives the exact visibility of orders RLS (0003 client/designer/QC + 0006 staff-queue) since a SECURITY DEFINER function bypasses RLS. Powers the order timeline + the visible independent-QC milestone.
  - `0017_marketing_leads.sql` — `marketing_leads` (public Contact Sales inbox), deliberately isolated from the order/user domain (no FKs, no audit-log entry — a form submitter is not a platform user). Sole write path is `public.submit_marketing_lead()` (SECURITY DEFINER); the table itself carries no direct grants, matching the same "no public table grants direct writes" convention as everywhere else.
  - `0018_designer_applications.sql` — `designer_applications`: Stage 1 of designer onboarding, a public screening lead (NOT a `users`/`designer_profiles` row — conversion happens manually per-candidate after staff review). Sole write path is `public.submit_designer_application()` (SECURITY DEFINER, no direct table grants); unlike `marketing_leads` this DOES write an audited `APPLICATION_SUBMITTED` entry (actor_id/actor_role NULL — the applicant isn't a platform user), since staff need an operational record of applications. Enforces exactly one portfolio path (a URL, or 2-3 sanitized file keys) at both the table CHECK and the function.
  - `0019_rate_limits.sql` — `rate_limit_events` + `public.check_rate_limit()`: a sliding-window limiter for the PUBLIC forms. Database-backed on purpose (an in-process counter resets on every serverless cold start). Stores only a salted hash of the client address, never an IP; blocked calls record nothing, so a sustained attacker cannot inflate the table.
  - `0020_qc_identity.sql` — makes independent QC a real constraint: `orders.qc_reviewer_id` (who actually reviewed) and `escrow_ledger.payee_id` (who a payout is FOR — `created_by` only ever recorded who pushed the button). `record_qc_decision()` records the reviewer and REFUSES self-review (you cannot review work you produced, or your own order); `transition_order` refuses QC_REVIEW→CLIENT_PREVIEW/REVISION_REQUESTED so a decision always carries a reviewer, and refuses assigning an order to its own reviewer. `release_escrow` now stamps each leg with its payee and REFUSES to release a QC payout when no reviewer is recorded. Claim-on-action, not pre-assignment: QC stays a pool, but the reviewer is recorded and checked at decision time.
  - `0021_settlement_ledger.sql` — prepares the money layer for a real processor, PROCESSOR-AGNOSTIC (nothing names Stripe/Razorpay). Adds `external_ref` (reconciliation), a UNIQUE `idempotency_key` (webhooks arrive more than once), and a nullable `fx_rate`. New kinds `PROCESSOR_FEE`/`CHARGEBACK`/`REVERSAL` and a `PROCESSOR` party. `app.escrow_sign()` puts each kind's direction in ONE place — the old inline `CASE kind WHEN 'HOLD' THEN amount ELSE -amount END` silently subtracted anything new, so a REVERSAL would have removed money that actually returned. **Conservation is now a TRIGGER on the table**, not just logic inside the escrow functions, so no write path (service-role script, future webhook handler) can overdraw an order. `refund_escrow(order, amount DEFAULT NULL)` supports partial refunds — the order only reaches REFUNDED when escrow empties. `record_settlement_event()` (service_role only) records processor-driven money WITHOUT changing `order_status`, so a chargeback after PAYOUT_RELEASED is representable. `settlement_state()` derives the money truth from the ledger.
  - `0022_payment_collection.sql` — **real money in**. Until now `hold_escrow()` was a button the CLIENT pressed, with no payment behind it — fine while the money layer was a simulation, a hole the moment a processor exists. Funding moves from "the client asserts it" to "the processor confirms it": `hold_escrow` is **REVOKED from `authenticated`**, and `confirm_payment()` (service_role only, called behind a verified HMAC signature) is the new door. `payment_intents` records what we asked to collect BEFORE the client touches the processor, so a confirmation is validated against **our** amount, never the webhook's. Idempotent by intent status + ledger key, so redelivery is a no-op. Still processor-agnostic at the SQL layer.
  - `0023_payout_accounts.sql` — **real money out.** `release_escrow` would write a RELEASE leg draining escrow to zero with no record anywhere of a bank account to send it to, so the ledger said "paid" while the designer was not. `payout_accounts` (keyed on `user_id`, not designer — QC reviewers are paid through the same legs) holds validated Indian payout identity: PAN, account number, IFSC, account type, with `account_last4`/`pan_last4` as GENERATED columns. Shapes come from `core/payouts/bankAccountIn`, the same module the form and the Server Action use, so the browser cannot accept what the database rejects. **Strictest table in the schema:** zero allow policies (see `policies/0019`) — not even the owner SELECTs it; `my_payout_account()` returns last-four fragments only. `upsert_payout_account()` takes **no user_id**, so identity comes from the token and no argument can redirect someone else's money; changing the destination **resets `VERIFIED` to `PENDING_VERIFICATION`** and drops the processor handles, closing a payout-hijack path. `set_payout_account_status()` is service_role only. `release_escrow` now REFUSES a designer or QC payout whose payee has no VERIFIED account. Drops the old unstructured `designer_profiles.payout_details` free-text sink.
  - `0024_payout_execution.sql` — **real money out.** `escrow_ledger` says what we OWE (a RELEASE leg is an obligation); `payouts` says what we have SENT. Conflating the two is how a platform believes it paid someone because it wrote a row about it. **One payout per RELEASE leg, forever** — a UNIQUE constraint on `ledger_id`, not careful code, because the failure mode is paying a designer twice and every retry path eventually re-runs the same instruction. `open_payouts_for_order()` derives instructions from the legs (idempotent; PLATFORM legs get no row — that money is already ours) and re-checks the payee is still VERIFIED, since release and execution are separate doors. `claim_payouts()` is a real work queue: `FOR UPDATE SKIP LOCKED` so two executors take different rows, flipping to PROCESSING and counting the attempt in the SAME statement so a crash mid-send leaves evidence. A PROCESSING row is deliberately NOT re-claimed — a transfer may be in flight — so `stale_payouts()` surfaces it for reconciliation against the processor instead. `record_payout_result()` (service_role only) is idempotent per state; REVERSED is the money-bearing one and writes a REVERSAL leg keyed off the payout, so a redelivered reversal cannot credit escrow twice. It accepts REVERSED from PROCESSING as well as PAID, because a reversal can beat our own success webhook and refusing it would 500 forever against Razorpay's retries. `my_payouts()` gives a payee amounts and states with no processor internals; `payout_state()` derives owed-versus-sent for reconciliation.

  - `0026_triage.sql` — the STAFF side of the two public inboxes. Applications (0018) and leads (0017) could be written by the public and read by nobody through the app; reviewing meant opening the database by hand. Adds staff read + decision paths WITHOUT weakening the zero-allow posture — the tables stay grant-less and unreadable directly, and these SECURITY DEFINER functions are the only door. LEAST PRIVILEGE: `app.require_triage_staff()` admits only OPS and SALES (QC/FINANCE are staff but have no business seeing an applicant's phone number). `list_designer_applications()` / `review_designer_application()` (audited `APPLICATION_REVIEWED` with the actor; accepting records a DECISION, it does NOT mint a designer account — conversion stays manual per 0018) and `list_marketing_leads()` / `set_lead_status()` (audited `LEAD_STATUS_CHANGED` — a staff action on a lead IS a platform action, unlike the public submit). Adds `reviewed_by/at`, `review_notes` to applications and `status/handled_by/at` to leads.
  - `0027_lifecycle_emails.sql` — closes the loop the platform still left open: an applicant now hears the DECISION on their application, and a designer hears when a payout is on its way. Both reuse the outbox (0025) — `review_designer_application` (0026) enqueues an ACCEPTED/REJECTED email keyed by (application, decision) so a toggle can't spam, and reopening to PENDING_REVIEW sends nothing; `record_payout_result` (0024) enqueues `PAYOUT_SENT` on PAID only, keyed by payout id, resolving the payee's address from `designer_profiles` (a payee with no profile email, e.g. a QC reviewer, simply gets none). ANONYMITY: both are to a person about their OWN thing — no counterparty — payloads carry only the recipient's name and an opaque order ref they already see. Deliberately NOT here: a raw "payout failed" ping (usually a transient the worker retries; an action-carrying failure message is a later slice). Extends the `email_outbox` template CHECK to match.
  - `0033_roles_pods.sql` — roles a person can HOLD and the pods work lives in (DECISIONS §2). `user_roles` stacks extra staff roles on the primary `users.role`, so ADMIN = SALES + OPS + FINANCE (`app.current_roles()`, `app.has_role()`, `app.is_admin()`, `app.acting_role()`); `grant_user_role`/`revoke_user_role` are OPS-only and audited. `pods` + `pod_members` (one pod per person); `orders.pod_id`/`pod_lead_id`; `create_pod`, `set_pod_member`, `assign_order_pod` are admin-only. `staff_profiles.first_name` feeds "Team · {first name}"; `designer_profiles.designer_ref` (DSG-0001…). A DO block teaches the existing money/queue functions extra roles by rewriting each `IF v_role IS DISTINCT FROM 'X'` check to act as X when held, and refuses to finish unless every expected rewrite happened.
  - `0034_product_kinds.sql` — adds `BAND` and `NECKLACE` to `product_kind` (own file: a new enum value cannot be used in the transaction that adds it).
  - `0035_order_model.sql` — the DECISIONS v1.0 order model, schema only: `job_categories` (A–L, rates in paise), `price_bands` (BAND_* codes, because the "Complex" price band is D–F, the standard SLA tier), `feature_flags` (§12 defaults, `app.flag()`), `app_settings` (integers: FX, buffers, minimums, densities), and the new `orders` columns (category, tier, SLA clock, source, intake mode, INR payouts). Order reference `{CLIENT}-{PRODUCT}-{SERVICE}-{N}` (MJ1-RN-C-1) minted at first submit; `job_code` (RN-C-1) is the designer-facing form; client codes live in `client_accounts` (initials + counter per initials). The brief loses four required fields (owner answer Q6), gains size fields, refuses rush while the flag is off, and `brief_missing()` lists what DECISIONS §11 still needs.
  - `0036_pseudonymous_identity.sql` — **a designer can no longer identify or link a client.** Designers lose direct `orders` access and read jobs through `visible_orders()` (job code, no price, product from the brief enum) and `job_brief()` (no reference name, no lineage). `app.order_relation()` replaces every "compare a user id" check. Messages move into per-order `client_team` / `internal` threads with per-thread aliases ("Client", "Designer", "Team · Priya"); designers can neither read nor post in `client_team`; old messages are frozen in an admin-only `legacy` thread. `file_versions.uploader_party` replaces reading `uploaded_by`. `order_timeline` hides amounts from designers; notification fan-out follows the threads; `transition_order` and `record_qc_decision` become multi-role and pod-scoped. Closes two open money readers (`app.escrow_held`, `settlement_state`) that any role could call for any order.
  - `0037_ops_tables.sql` — tables Phases 2–4 write to, created now so their read rules ship and are tested with the rest: `job_assignments`, `checklist_items` (19, seeded), `order_checks`, `deliverable_slots` (seeded), `deliverables`, `order_screenshots`, `sla_events`, `client_credits` (pending until an admin decides — owner answer Q4), `payout_obligations` (INR — owner answer Q2). Plus `app.order_in_my_pods()` / `app.client_in_my_pods()` for policies that cannot read the hidden columns themselves.
  - `0038_identity_lookup.sql` — `record_identity_lookup(ids, purpose)`: the gate in front of showing an account's email on the Access screen. Admin only (not OPS alone); every lookup is an `IDENTITY_VIEWED` audit entry with `is_identity_read = true`, naming the accounts shown. Emails come from Clerk (`lib/clerk/identities.ts`), never from this database.
  - `0039_payment_methods.sql` — adds `wise`, `paypal`, `bank` to `payment_method` (own file: enum values cannot be used in the transaction that adds them).
  - `0040_quote_sla.sql` — Phase 2, DECISIONS v1.1. `quote_order_v2` (category, band price, $49 first design once per account, override, designer and QC pay locked in paise, 40 % warning at the admin FX rate), `set_order_category`, `confirm_order` (admin or pod lead), `mark_payment_received` (Wise / bank / PayPal / manual). **The clock starts when the order is both paid (a HOLD on the ledger, via a trigger) and confirmed, at whichever is later** — `app.maybe_start_sla`. A trigger on `→ CLIENT_PREVIEW` records the first look and `met`. `sla_sweep()` (pg_cron, every minute, scheduled here when the extension exists) flags misses once and creates one pending credit for standard orders; `decide_sla_credit` is the admin decision (apply next / refund / partial / reject), once only; `pending_sla_credits()` feeds `/admin/credits`. Backfills `paid_at` for orders paid before it. `visible_orders` gains `confirmed_at`, `paid_at`, `complex_deadline_hours`.
  - `0041_assignment_checklist_slots.sql` — Phase 3a. `assign_designer` (admin or the order's pod lead; designer must be in the pod and signed up; capacity = open category minutes vs the 480-minute shift: warning while `capacity_blocking` is off, admin override with a reason when on; `job_assignments` history), with `transition_order`'s ASSIGNED handed to it. `orders.work_version`: a QC send-back or client revision opens a new version with an empty checklist and slots. `tick_check` (designer column while IN_PROGRESS; QC column by the pod lead in QC_REVIEW after the designer's sign-off, never by the designer), `add_slot_file` (server names `{JOB_CODE}_{SLOT}_v{n}.{ext}`; replace within a version; slot → file kind for the download gate), `job_checklist` / `job_slots` / `pod_designers` read functions. Gates: submit needs 19 designer ticks + all 10 required slots and goes straight to QC_REVIEW; QC pass needs 19 QC ticks; send-back needs a note, which is posted to the internal thread. Designer uploads no longer notify the client.
  - `0042_revisions_payouts.sql` — Phase 3b. `revision_requests` + `request_revision` (client only, on CLIENT_PREVIEW, note required, 2 rounds within 14 days of first look from `app_settings`; opens a new work version; notifies designer and pod lead; the generic client CLIENT_PREVIEW → REVISION_REQUESTED transition row is removed), `order_revisions` (round, note, time, version; never who wrote it), `revision_allowance`. `create_change_order` (owner answer Q5: from APPROVED/DELIVERED/CLOSED, or a preview whose rounds are used — which approves it; new SUBMITTED order, same client/product/pod, brief copied with `based_on_order_id` + `change_summary`, ref minted from the brief), `order_lineage` (empty for designers). `orders_payout_on_close` trigger: CLOSED → `payout_obligations` for designer and QC at the locked INR pay, once per party. `payout_list`, `export_payouts` (owed rows with non-rejected bank details → batch `PB-…`), `payout_batch_rows` (full bank details, finance/admin, identity-read audit), `mark_payout_batch_paid` (notifies payees). `sla_sweep` adds the designer's reminder 60 minutes before designer due (`sla_events.kind` 'designer_reminder', once). Fan-out tells designer and pod lead on approval. Drops the old `quote_order`.
  - `0043_on_behalf_orders.sql` — Phase 4a. `app.is_team` (admin or pod lead), `app.team_on_order`, `app.team_writes_brief`, `app.can_see_screenshots`, `public.i_am_team`. The six brief writers (`upsert_order_spec`, `set_order_accents`, `add_reference_image`, `set_reference_pins`, `set_primary_reference`, `remove_reference_image`) also admit the team on quick-intake orders (owner checks widened in place; the quote freeze unchanged). `register_client` (team; Clerk id from the server; never overwrites an existing profile; mints the client code), `find_clients` (team; identity read, audited), `order_client_contact` (team on the order). `orders.received_at`. `create_order_on_behalf` (team; source email/whatsapp/phone; pod lead → own pod; note posted to the client thread), `add_order_screenshot`, `submit_order_on_behalf` (needs ≥ 1 screenshot; mints the ref; optional in-app + `ORDER_PLACED_FOR_YOU` email).
  - `0044_email_queue_order.sql` — Fix: `claim_emails` sends new (PENDING) emails first; a FAILED email waits 2, 4, 8 … up to 60 minutes between tries and is left alone after 8 (reset with `UPDATE email_outbox SET status='PENDING', attempts=0 WHERE status='FAILED'`). Before this, 20 old failing emails starved every new one.
  - `0045_thread_attachments.sql` — Phase 4b. `thread_files` (no grants) + `post_thread_file` (posts through `post_thread_message`'s rules; the internal thread takes only `app.cleanable_type` formats; named `file_n.ext` per thread), `thread_attachments` and `thread_file_for_download` (both apply `app.can_read_thread`), `order_activity_stamp` (newest audit seq on the order the caller could see the effect of; messages and files only in readable threads).
  - `0046_client_screens.sql` — Phase 5b. **Quotes are in US dollars:** trigger `orders_quote_in_usd` sets `currency='USD'` when an order moves to QUOTED (prices are USD cents; client drafts used to be INR, so a $55 quote would have charged ₹55); backfill sets USD on DRAFT/SUBMITTED/QUOTED orders and fails PENDING payment intents on non-USD quotes. `set_order_service` (CAD or renders; client, or the team on quick-intake orders; DRAFT/SUBMITTED). `submit_brief` (client, DRAFT only; refuses with "the brief still needs: …" until `brief_missing` is empty — size not required for renders — then `transition_order` → SUBMITTED). `my_conversations` (one row per readable thread: order, display ref — the job code for a designer — last message, alias, count; newest first; legacy threads left out).
  - `0047_work_screens.sql` — Phase 5c, read-only. `my_work` (designer's own jobs by job code: category minutes, pay, version, assigned / Start work / submitted times from the audit log via `app.last_moved_to`, designer due; never the client, price or order ref), `pod_jobs` (admin: every pod; pod lead: own pods — title, designer ref and name, client code, clock, designer and QC tick counts for the current version, price, QC pay; drafts left out), `pod_load` (pod designers with open minutes against the shift), `my_earnings` (the caller's `payout_obligations` with job code for a designer, order ref for QC).
  - `0048_admin_screens.sql` — Phase 5d. **Pod routing:** trigger `orders_auto_pod` (BEFORE UPDATE OF status, confirmed_at; no pod yet; on PAYMENT_HELD or confirmation) puts the order in the only pod that has a pod lead (`app.only_pod`; nothing when there are several), audited `ORDER_POD_ASSIGNED` with `automatic`; waiting orders routed once. `client_managers` (no grants) + `set_account_manager` (admin; manager must hold a staff role; null clears) and `admin_clients` (admin; by code, orders, spend, manager). `pods_overview` (admin). `pod_jobs` rebuilt with clock state, confirmation, payment, source, open dispute and pod lead, open to Sales/Ops/Finance too (designer names only for admins and the order's pod lead). `money_ledger` (admin or finance). `list_platform_users` gains `reference` (client code or designer ref, searchable) and `reviews`.
  - `0049_attribution.sql` — Phase 6 (owner answer Q16: own database only). `marketing_attribution` (one row per account: required "How did you hear about us?" + cleaned first-touch cookie; first answer kept; `save_attribution`, `has_attribution`). `marketing_events` (brief_started, brief_submitted, payment_completed, first_look_viewed, approved; preview_link_created and spec_claim_opened reserved for Phase 7): order-driven events by triggers on `orders` and `escrow_ledger`, app events by `record_marketing_event` (anon visitors by visitor id, no order). `start_brief_lead` (the /jewelry-cad form → a NEW lead, no email). `attribution_report` (admin).
  - `0050_certificates.sql` — Phase 7a (SPEC-ADDENDUM A2–A4). `qc_measurements` (pod lead, in QC, per version) and `job_volumes` (designer while working, or pod lead in QC); gates on `orders` (`app.spec_gates`): a CAD version cannot be submitted without its volume, nor pass QC without measurements and with open edges > 0 (render orders skip both). `spec_waivers` + `add_spec_waiver` (team). `deliverable_files` + `record_file_fingerprint` (server only; SHA-256 of the stored bytes, once) and `archive_on_delivery`. `certificates` (immutable: no update, no delete) + `record_certificate` (server only). Reads: `certificate_data` and `certificate_for_download` (client after QC, team; never the designer — `app.can_read_certificate`, NULL-safe), `weight_sheet_data` (client after QC, team, designer), `version_spec`, `order_fingerprints`.
  - `0051_preview_claims_stats.sql` — Phase 7b (SPEC-ADDENDUM A5–A7). Logo: `client_profiles.logo_object_key` + `set_client_logo` (key under `logos/<own id>/`). Preview links: `preview_links` (only the SHA-256 of the token is kept), `create_preview_link` / `update_preview_link` / `my_preview_links` (the order's client, APPROVED onward), `preview_by_token` (server only: jeweler name, logo key, piece, current STL and render keys; counts the view; NULL when expired, revoked or unknown). Claims: `spec_claims` (one open at a time per order), `claim_window` (30 days from delivery, `claim_window_days`), `open_spec_claim` (server only, with the client's id and the SHA-256 the server computed: no file match or a waived spec → not covered; 2 or more claims in 90 days → admin review), `decide_spec_claim` (pod lead on open; admin on open, admin review, or to overturn a rejection; upheld → a free fix order with no designer pay, and one `claim_credit` for the CAD fee, never twice), `order_claims`, `claims_queue`. Stats: `public_stats`, `compute_public_stats` (admin or schedule; weekly by pg_cron where present), `public_stats_latest` (anyone while the `public_stats` flag is on; admins always).
- `policies/` — Row-Level Security, applied after migrations:
  - `0001_enable_rls_default_deny.sql` — RLS on every table, **zero allow policies** (locked shut).
  - `0002_grants.sql` — anon/authenticated grants mirroring Supabase, so default-deny is proven at the RLS layer.
  - `0003_identity_allow_policies.sql` — first identity-gated **READ** policies (self-read on users/profiles; client/designer/QC reads on orders). Writes and staff identity-piercing reads stay deferred.
  - `0004_audit_log_rls.sql` — locks the audit log shut (RLS default-deny + grants: only `service_role` may read/append, never update/delete).
  - `0005_order_transitions_rls.sql` — RLS on the transition graph; authenticated users may read it (reference data), never write it.
  - `0006_staff_order_read.sql` — staff order visibility tied to the state machine (a role reads an order only when it has a legal move on it); orders carry no identity, so not an identity-piercing read.
  - `0007_file_versions_rls.sql` — you can read a file version only if you can read its order (inherits order visibility).
  - `0008_legal_agreements_rls.sql` — agreement documents readable by any authenticated user (you must read what you sign); signatures readable only by their signer; all writes go through `accept_designer_agreement()` (no direct-write policy).
  - `0009_escrow_rls.sql` — you can read an order's escrow ledger only if you can read the order (inherits order visibility); all writes go through the escrow functions (no direct-write policy).
  - `0010_messages_rls.sql` — you can read an order's messages only if you can read the order; never joins a profile, so it reveals nothing about the counterparty beyond their party label. Writes go through `post_message()` (no direct-write policy).
  - `0011_disputes_rls.sql` — you can read an order's disputes only if you can read the order; writes go through `raise_dispute()`/`resolve_dispute()` (no direct-write policy).
  - `0012_notifications_rls.sql` — you can read ONLY your own notifications; writes go through the fan-out trigger + `mark_notifications_read()` (no direct-write policy).
  - `0013_harden_base_grants.sql` — defense-in-depth: revokes `INSERT/UPDATE/DELETE` on the base tables (`users`, `orders`, `client_profiles`, `designer_profiles`) from `anon`/`authenticated`. All writes go through SECURITY DEFINER functions (which bypass grants+RLS), so direct writes are locked at the grant level — the ONLY write path is the audited functions. `SELECT` stays (RLS scopes it).
  - `0014_marketing_leads_rls.sql` — RLS enabled + forced on `marketing_leads` with **zero** allow policies (not even SELECT) — direct access is denied to every role, anon included. The only way in is `submit_marketing_lead()`, which runs as the function owner and bypasses RLS entirely.
  - `0015_designer_applications_rls.sql` — same zero-allow-policy treatment for `designer_applications`. Staff review reads the table via the service-role admin client (BYPASSRLS), never through a client-scoped policy.
  - `0016_rate_limits_rls.sql` — zero allow policies on `rate_limit_events`; `check_rate_limit()` is the only path in.
  - `0018_payment_intents_rls.sql` — zero allow policies on `payment_intents`: server-side bookkeeping only. The client learns what it needs from the checkout handoff, never by reading the table.
  - `0022_email_outbox_rls.sql` — zero allow policies on `email_outbox`: the rows hold recipient addresses and are pure server-side bookkeeping. No user reads the send queue, and a recipient address is exactly the contact detail the double-blind keeps out of reach. Written and drained only through the functions.
  - `0020_payouts_rls.sql` — zero allow policies on `payouts`: the rows carry processor transfer references and the linked-account handle money was sent to. A payee's legitimate question ("what am I owed, and did it arrive?") is answered by `my_payouts()` with a deliberately narrower column list.
  - `0019_payout_accounts_rls.sql` — zero allow policies on `payout_accounts`, deliberately stricter than the other identity tables. Everywhere else the owning user may read their own row; here that would mean a stolen session exfiltrates a full PAN and bank account number for no product benefit — the owner already knows their own bank details. `my_payout_account()` answers the only legitimate question ("which account is on file?") with fragments.
  - `0017_qc_reviewer_read.sql` — a QC reviewer keeps visibility of orders they personally reviewed (0003's QC policy only covers the live queue, so an order would otherwise vanish the instant they decided). Orders carry no identity, so this is not an identity-piercing read.

## Order state machine

An order changes status **only** via `public.transition_order(order_id, new_status, payload)`.
It is enforced end-to-end:

- **Legal moves only** — the move must exist in the `order_transitions` graph
  (`DRAFT → SUBMITTED → QUOTED → PAYMENT_HELD → ASSIGNED → IN_PROGRESS →
  DESIGNER_SUBMITTED → QC_REVIEW → CLIENT_PREVIEW → APPROVED → DELIVERED → CLOSED
  → PAYOUT_RELEASED`, plus CANCELLED/DISPUTED/REFUNDED exits).
- **Right role + right party** — the caller's role (`app.current_user_role()`)
  must match, and for CLIENT_PARTY/DESIGNER_PARTY moves they must be the order's
  client / assigned designer. Identity comes from the verified token.
- **Audited** — each move appends an `ORDER_STATUS_CHANGED` entry; `create_order`
  appends `ORDER_CREATED`. Atomic with the status change.

The transition matrix is a **first cut** (data-driven, easy to revise).

## Onboarding

- **Client** — light: `public.ensure_self()` creates a `CLIENT/ACTIVE` row on
  first login, audited (`USER_CREATED`).
- **Designer** — gated: `public.apply_as_designer()` sets role DESIGNER /
  status PENDING and creates the identity profile (audited `DESIGNER_APPLIED`).
  The designer is **not assignable** until `public.accept_designer_agreement()`
  records a signature and flips them to ACTIVE (audited `SIGNED_AGREEMENT`).
  `transition_order`'s ASSIGNED step calls `app.designer_is_assignable()` to
  enforce this — which checks for a real signature against the current version.

> The agreement **document is now wired** (`0011`): a real, versioned
> `agreement_documents` row is fingerprinted with `content_sha256`, and
> `accept_designer_agreement(expected_sha256)` verifies the caller signed the
> current text before recording an **immutable** `agreement_acceptances` row
> (version + fingerprint, audited). The gate requires acceptance of the **current**
> version, so publishing a new version auto re-gates every designer until they
> re-accept; old signatures remain as proof. Counsel-drafted text replaces the
> starter body as a new version — the seeded `v1` body is never edited in place.

## Audit log (append-only, hash-chained)

`audit.audit_log` records every state change and identity-piercing read as an
immutable entry. Enforced by the database:

- **Append-only** — an `UPDATE`/`DELETE`/`TRUNCATE` trigger raises, so history
  cannot be rewritten (even by a privileged connection).
- **Tamper-evident** — each entry's `hash` = SHA-256 over its contents + the
  previous entry's `hash` (a chain). `audit.verify_chain()` recomputes the chain
  and returns `{valid:false, broken_at:<seq>}` if any past entry was altered.
- Written only via `audit.log_event(...)`; readable only by `service_role`.
- Hashing uses Postgres built-ins (`sha256`) — identical on local PG and Supabase.

## Clerk → Supabase identity bridge

Verified Clerk JWT claims arrive in the `request.jwt.claims` setting (set by
Supabase/PostgREST). `app.current_clerk_id()` reads the `sub` from there — it is
the portable equivalent of Supabase's `auth.jwt()->>'sub'`, and equals our
`users.id`. RLS policies gate every row on it.

> **Config exception (flagged):** registering Clerk as a Supabase **Third-Party
> Auth** provider is a project setting (Supabase dashboard / Management API), not
> SQL. That one step is config — all schema and RLS stay versioned SQL here.

## Applying

```bash
# Apply everything not yet applied (safe to re-run):
DATABASE_URL=postgres://user:pass@host:5432/db npm run db:apply

# See what is applied vs pending, change nothing:
DATABASE_URL=... npm run db:status

# ONE-TIME, for a database that already has the schema but no ledger:
DATABASE_URL=... npm run db:baseline
```

`scripts/apply-migrations.mjs` applies each pending file in `migrations/` then
`policies/` in filename order, inside a transaction per file — and records it in
`public.schema_migrations` in that same transaction, so a failed file records
nothing and can be retried.

**Re-running is safe.** Applied files are skipped, not replayed. (Before this
ledger existed the script replayed everything and died on the first
`CREATE TYPE`/`CREATE TABLE` that already existed, which made it unusable
against any live database.) A database built before the ledger existed needs
`npm run db:baseline` once — that records the current files as applied without
executing them; afterwards `db:apply` only ever runs genuinely new files.

## Non-negotiables encoded here

- Opaque text IDs only — no sequential integers, no serial/identity columns.
- Money is `integer` minor units with `CHECK (>= 0)` — never floats.
- Identity is isolated in the profile tables — never on `users` or `orders`.
- All FKs are `ON DELETE RESTRICT`.
- Default-deny RLS on every table; allow policies come in a later slice.

## 0028 — order specs

The brief: what is actually being made. One row per order (`order_specs`) plus a
child table for accent stone rows (`order_spec_accents`), because a group of
stones sharing a size and setting is one row, not eighteen.

Measurements are **integers in microns**, carat weights integers in thousandths
— the same rule money follows, for the same reason: these numbers decide whether
a seat can physically be cut, and floats compare badly.

Two invariants live in the schema rather than the UI:

- **The freeze.** A brief is writable only while the order is `DRAFT` or
  `SUBMITTED`. Once it is `QUOTED` the work has been priced, and a silently
  enlarged centre stone would mean the client pays for one job and the designer
  builds another. A changed brief after that point is a new order — which is
  what `based_on_order_id` is for.
- **Coherence.** `order_specs_centre_coherent` refuses a centre stone with no
  shape or setting, and refuses stone dimensions on an order that says it has no
  centre stone. Without it, clearing the question leaves a ghost 6.5mm round in
  the brief and the designer builds a head for it.

`min_wall_um(purpose)` is derived rather than stored so it cannot drift from the
purpose it comes from.

RLS (policies/0023) asks whether the ORDER is visible rather than restating the
five conditions that decide it, so a brief follows its order's visibility
automatically — including for rules that do not exist yet.

## 0029 — reference images and pins

Pictures attached to a brief, and labelled points on them.

A client attaches three photos and writes "like this but with a thinner band".
The designer does not know which photo is the shape, which is the setting, and
which was only about the finish — so they choose, and half the time they choose
wrong. That is the most common single cause of a first version coming back
wrong, and it costs a revision cycle on both sides every time. A pin turns an
ambiguous pile of images into instructions.

**Coordinates are integer basis points (0–10000), not pixels and not floats.**
Not pixels, because a pin is a position within the *image*, not within one
rendering of it, and it has to land in the same place on a phone and on a
designer's monitor. Not floats, for the reason no measurement here is one.

`label` is `NOT NULL`: an unlabelled pin is a dot, and a dot is the ambiguity
this table exists to remove.

Exactly one picture per order is primary, enforced by a partial unique index.
The first upload becomes primary automatically, and deleting the primary
promotes the lowest-numbered survivor — an order whose references have no
stated starting point is the pile of images again.

Photographs are the richest source of identifying metadata in the system (EXIF
carries GPS, camera serials, often an owner name). Every byte goes through the
same sanitization gate as a deliverable, with metadata stripping required,
before a row here exists.
  - `0027_roles_pods_rls.sql` — orders: admin sees all, a pod lead sees every order in their pod, the old QC pool policy is gone, partial staff keep the 0006 queue rule (QC excluded). Read rules for `user_roles`, `pods`, `pod_members`, `staff_profiles`.
  - `0028_order_model_rls.sql` — categories and settings staff-only; price bands and flags readable by any signed-in user; client codes to the client, sales/ops/finance and the pod lead of their pod — never a designer.
  - `0029_identity_columns.sql` — **column privileges**: no app user can select a raw user id (`client_id`, `designer_id`, `sender_id`, `uploaded_by`, `raised_by`, `created_by`, …). Drops the designer's `orders` policy; designers reach files, reference images and accents through `app.is_assigned_designer()`. Messages and threads read through `app.can_read_thread()`; `thread_participants` has no grant at all.
  - `0030_ops_tables_rls.sql` — read rules for the 0037 tables from the Spec §1 matrix; who-acted columns are not granted; screenshots never reach a designer; a client sees a credit only once an admin has decided it.
  - `0031_quote_sla_rls.sql` — `orders.confirmed_at` joins the column grant; `confirmed_by` and `payment_reference` stay out.
  - `0032_work_version_rls.sql` — `orders.work_version` joins the column grant.
  - `0033_revisions_rls.sql` — `revision_requests`: RLS on, no grants; read through `order_revisions()` only.
  - `0034_on_behalf_rls.sql` — `orders.received_at` joins the column grant; `order_screenshots` readable by the client and the team only (`app.can_see_screenshots`).
  - `0035_thread_files_rls.sql` — `thread_files`: RLS on, no grants; read through the 0045 functions only.
  - `0036_designer_rate_card.sql` — designers read `job_categories` (their rate card, D6). Clients still cannot.
  - `0037_client_managers_rls.sql` — `client_managers`: RLS on, no grants; through the 0048 functions only.
  - `0038_attribution_rls.sql` — `marketing_attribution`, `marketing_events`: RLS on, no grants; through the 0049 functions only.
  - `0039_certificates_rls.sql` — the 0050 tables: RLS on, no grants; through their functions only.
  - `0040_preview_claims_rls.sql` — `preview_links`, `spec_claims`, `public_stats`: RLS on, no grants; through their functions only.
