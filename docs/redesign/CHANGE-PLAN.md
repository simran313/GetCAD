# Client order experience — change plan

Status: **plan only, nothing built.** Written 26 Oct 2026 from the code on
`claude/gracious-hopper-amum18` (after the redesign, PR #75). DECISIONS.md
wins where this plan and the brief disagree; those points are listed under
"Decisions needed".

## Bottom line

- Everything in the brief can be built by **changing existing screens and
  components**: no new tables, no new routes, no new dependencies, with
  three exceptions that need a schema change and your yes first (§9).
- Four PRs, one phase each (§10). Bugs and the brief wizard go first: they
  cause wrong orders today.
- Root causes found for 3 of the 4 bugs (§8). The Rose/Yellow one is not yet
  reproduced; I will prove it with a failing browser test before fixing.

## 1. What exists (the map)

| Area | Route / file | Notes |
| --- | --- | --- |
| New order | `app/(app)/orders/new/page.tsx` | Two cards (CAD black, Renders white), drafts (max 3) and "Order again" rows, email/WhatsApp sentence |
| Start a draft | `orders/[id]/brief/actions.ts` → `startBriefAction` | `create_order` (+ `set_order_service`) on every press: the source of empty duplicate drafts |
| Brief | `orders/[id]/brief/page.tsx` + `BriefWizard.tsx` (903 lines) + `ReferenceSection.tsx` + `ReferencePinner.tsx` | One `<form>` across steps; photos are a **sibling section rendered after the wizard's sticky bar** |
| Brief save | `saveBriefAction` → `upsert_order_spec`, `set_order_accents` | Explicit "Save draft" / "Review and send" |
| Photos | `referenceActions.ts` → `add_reference_image`, `set_reference_pins`, `set_primary_reference`, `remove_reference_image` | Sanitised server-side (metadata stripped) |
| Brief quality | `core/orders/briefQuality.ts` (`gradeBrief`) | Grades ambiguity; does **not** apply the DECISIONS §11 submit minimum |
| Review | `orders/[id]/brief/review/page.tsx` | `brief_missing` RPC (the §11 minimum), "Step 5 of 5" |
| Order (client) | `orders/[id]/page.tsx` → `ClientOrderView.tsx` | Next-step card, 7-segment unlabelled bar, revisions, `ThreadsPanel`, history, aside (documents, first look, brief, payment, cancel, dispute) |
| Next step | `core/orders/clientView.ts` (`clientNextStep`, `CLIENT_STEPS`, `clientStepsDone`) | Status-only, 7 steps |
| Orders list | `orders/(list)/page.tsx` → `ClientOrders.tsx` | `ResponsiveDataList`; inline action only for Pay |
| Home | `home/page.tsx` → `ClientHome.tsx` | "Needs you" cards + "New message from your team / Read it" cards (from `notifications.read_at IS NULL`) |
| Messages | `messages/page.tsx`, `messages/[orderId]/page.tsx`, `MessagesView.tsx`, `load.ts` | List + conversation; two-pane at desk already; `my_conversations` RPC |
| Thread | `orders/ThreadsPanel.tsx` (one component, used by client order, team order, Messages) | `order_messages`, `order_threads`, `thread_attachments`, `postThreadAction` → `post_thread_message` / `post_thread_file` |
| Live updates | `orders/AutoRefresh.tsx` | 5 s poll of `/api/orders/[id]/stamp`, then `router.refresh()`. No websocket |
| Timeline | `orders/OrderTimeline.tsx`, `order_timeline` RPC | Read-only event list |
| Push | `account/pushActions.ts`, `lib/push/send.ts`, `app/api/cron/push`, `core/notifications/push.ts` | Fixed, name-free copy per kind; per-device subscribe/unsubscribe |
| Unread | `notifications` (`kind`, `order_id`, `read_at`), `mark_notifications_read(p_id)` | Per user, per event. No per-message read receipts |
| Profile | `client_profiles` | **No country or timezone column** |
| Shared UI | `components/ui/*`: `Sheet`, `ConfirmDialog`, `StatusPill`, `ListRow`, `ResponsiveDataList`, `FilePicker`, `LiveCallButton`, `EmptyState`, `toast`; `components/stepper.tsx` | All reused below |

## 2. New order screen (§1 of the brief)

| Change | How (reuse) |
| --- | --- |
| Two equal tiles, CAD design / Renders, ≤ 6-word subtitle, whole tile tappable | Same `startBriefAction` form, one button per tile styled as a selection tile (equal weight). No new component: a `<button>` with card classes |
| Drop "Nothing is charged until…" from the top | Moves to the quote card (§4), once, small |
| **Start from a past order** row: recent orders → duplicate brief → land on review prefilled | New server action `duplicateBriefAction` in the existing `brief/actions.ts`, composed of existing RPCs only: `create_order` (+ `set_order_service`) → read the past order's `order_specs` and accents under RLS → `upsert_order_spec` + `set_order_accents` → for each reference image: copy the storage object (service role, only rows the client could read) → `add_reference_image` + `set_reference_pins`. Redirect to `/orders/<new>/brief/review`. Not `create_change_order`: that one requires an approved order and a change note, auto-submits, and does not copy photos |
| Drafts: no empty duplicates; real name, "Step 2 of 4", last edited; overflow → Delete | (a) `startBriefAction` reuses the newest *empty* draft of the same service instead of creating another (stops duplicates at the source). (b) List shows at most one empty draft. (c) Step derived from the saved brief (first step with a §11 gap), last edited from `order_specs.updated_at`. (d) Delete = existing `transition_order(DRAFT → CANCELLED)` behind `ConfirmDialog` |
| "Prefer email or WhatsApp?" | One compact `ListRow` link at the bottom |

## 3. Brief wizard (§2)

| Change | How |
| --- | --- |
| One step count | Wizard "Step n of 4" (renders "of 3"); review page header becomes "Review" (no "Step 5 of 5") |
| Step 1: no intro paragraph, no helper text under "Name this job" / "What are we modelling?" | Delete the `PageHeader` description and both `hint`s |
| Job name autofilled ("Ring · 18K yellow"), editable | Placeholder-as-value computed from product/karat/metal until the client types; stored on save |
| Client defaults (metal, finish, size system) | **From the client's most recent order spec** (no new table). Applied only to a brand-new empty draft |
| Photos **inside step 1, above Next** | `ReferenceSection` moves into the wizard's first pane. The nested-form problem (the reason it was a sibling) is solved with the HTML `form` attribute: the photo inputs belong to their own `<form id>` placed outside, the controls sit inside the step |
| One "Add photos" control: camera / gallery, multi-select, thumbnails with ×, upload on select | `FilePicker` gains `multiple` + auto-submit on change; `addReferenceImageAction` accepts several files (loops `add_reference_image`). Thumbnail grid; × = existing remove action |
| "Mark what you mean" optional, small action on a thumbnail | Opens the existing `ReferencePinner` in a `Sheet` |
| Remove the two paragraphs; lock icon + "Private" (details on tap) | Copy cut; a tooltip/popover with the existing metadata sentence |
| Quality: thin meter + one chip ("1 missing: reference photo" → scrolls to it) | `QualityPanel` compressed. **Score uses the same rules as review** (bug, §8) |
| Sticky bottom bar: back icon + Next; silent autosave + "Saved" | Debounced `saveBriefAction` (no redirect) on change and on step change; "Save draft" button removed; last step's primary = "Review" |
| Review: compact summary, tap a value to edit, inline "Add" for anything missing, Submit primary | Rows link to `/orders/<id>/brief?step=n#field`; missing items from `brief_missing` render as inline "Add" links; one rows builder shared with the order page (§7) |
| Edits persist (Rose/Yellow) | §8 |

## 4. Order hub (§3)

Same route `/orders/[id]`, `ClientOrderView` rearranged:

- **Header:** name, ref, `StatusPill`, one meta line (service · due date in
  local time), count chips (Messages, Files, Revisions) from data already
  loaded on the page.
- **Next step card:** `clientNextStep` extended to take the latest events
  (`order_timeline` rows already loaded) and the order's money/SLA fields.
  Deterministic. Examples per the brief: quote ready → "$85, first look
  within 6 h" + Pay & start; new version → Review; pricing → no button, ETA.
- **Four tiles:** Chat (→ `/messages/<id>`, full screen), Files & versions,
  Revisions, Timeline (each opens full screen as a `Sheet`, reusing
  `RevisionsPanel`, `OrderTimeline` and the files list; no new routes).
- **Brief** and **Payment**: compact collapsible rows below.
- **Cancel** → overflow menu → `ConfirmDialog` → existing `transitionAction`.
  "Raise a problem" goes to the same overflow (kept, not deleted).
- **Stepper:** the unlabelled 7-segment bar becomes a labelled 5-stage
  stepper (Brief → Quote → Design → Review → Delivered), reusing
  `components/stepper.tsx`. `CLIENT_STEPS` / `clientStepsDone` change;
  their unit tests change with them.
- **Quote stage:** one quote card (price, delivery promise, Pay & start,
  "Nothing is charged until you pay" small); "What's included" collapsed.
- **Orders list:** each row's single next action inline: Pay / Review / Reply
  (Reply when the order has an unread message).

## 5. Order chat (§4)

Same route `/messages/[orderId]`, same `ThreadsPanel` data and
`postThreadAction`; the panel is rebuilt as a chat surface:

- **Phone:** full screen; the bottom tab bar is hidden on this route (the
  shell already knows the path). Header: back · order name + status · live
  call (`LiveCallButton`) · overflow (Files, Timeline, Brief, Order).
- **Composer:** pinned, keyboard-aware (`100dvh` + `visualViewport` resize
  listener, safe-area padding), auto-growing textarea, attach icon → sheet
  (Camera / Gallery / File), send icon. The file-type line goes; type and
  size are checked on select (the existing `THREAD_ACCEPT` rules) with a
  toast.
- **Bubbles:** mine right, team left; day separators; local-time stamps;
  unread divider (from the oldest unread `MESSAGE` notification on this
  order, which is then marked read with the existing
  `mark_notifications_read`); scroll to latest; optimistic send with retry.
- **Read receipts: not built.** No data records when the other side read a
  message (the brief says "if data exists"; it does not).
- **Order events inline** as centred system chips, merged by time from
  `order_timeline` (already an RPC; read-only). Timeline view stays.
- **Files:** images as thumbnails → full-screen viewer (optional "Mark
  changes" reuses `ReferencePinner`'s marking UI, client side only, sent as
  an image); CAD/STL as a file card with version tag, and Approve / Request
  changes linking to the existing review actions where the state allows.
- **Reply-to-message:** needs a schema change (§9 B).
- **Live updates:** the existing 5 s `AutoRefresh` poll stays (no new
  realtime dependency). Optimistic bubbles make sending feel instant.
- **Desktop:** two-pane already exists in `MessagesView`; add a collapsible
  order-details side panel (status, next step, brief rows).
- **Designer and pod lead:** the same component; `can_post` and the
  thread kinds from `order_threads` are untouched, so permissions do not
  change.

## 6. Home and Messages (§5)

- Home top: **Needs your action** (quotes to pay, versions to review: from
  `clientTab`), then recent orders.
- The "New message / Read it" cards become an **inbox list** (one row per
  order: name, last message preview, local time, unread badge), from
  `my_conversations` + unread `notifications`. Tap → full-screen chat.
- Draft: one compact row ("Finish your brief · Step 2 of 4").
- Messages list uses the same inbox row.

## 7. Time and timezone (§6) and settings (§7)

- **Root cause (bug):** server components format dates with
  `Intl.DateTimeFormat` and **no `timeZone`**, so they render in the
  server's zone (UTC on Vercel). Nine separate formatters do this
  (`shortDate`, `OrderDetail`, `OrderTimeline`, `RevisionsPanel`, wallet,
  `lib/work/load.ts when`, admin pages, `MessagesView ago`).
- **Fix:** one module `lib/time/format.ts` (relative: "2m ago",
  "Yesterday 9:26 PM"; full for the timeline; due dates) that every screen
  uses, taking the viewer's zone. `SlaCountdown` uses the same source.
- **Where the zone comes from (no schema change, recommended):** a
  per-device cookie. Default = the browser's zone (set on first visit; an
  Indian browser reports Asia/Kolkata). Changeable in client Settings:
  India, US Eastern / Central / Mountain / Pacific / Alaska / Hawaii, or
  "This device's zone". The brief's "default from profile country" is not
  possible without a schema change: `client_profiles` has no country (§9 C).
- **Settings → Notifications:** master on/off per device = the existing
  subscribe / unsubscribe. **Per-type toggles need a schema change** (§9 A).
  Copy stays the fixed, name-free text in `core/notifications/push.ts`.
- Settings lives on the existing `/account` page (a "Notifications and
  time" section); no new route.

## 8. Bugs: root cause

| Bug | Root cause | Fix |
| --- | --- | --- |
| Photos missed, then "Still needed" at review | `ReferenceSection` renders after the wizard (and after its sticky bar) | Photos inside step 1 (§3) |
| "Excellent" score with zero photos | `gradeBrief` treats no photo as an *ambiguity* (−12) and never checks size; `brief_missing` / `submit_brief` treat both as *required*. Two rule sets | `gradeBrief` adds the §11 minimum as *blocking* gaps (photo; size where the product needs one), matching `brief_missing`. A unit test pins the two together |
| Step count | Wizard "of 4" (renders "of 3"), review "Step 5 of 5" | §3 |
| Times in UTC | §7 | §7 |
| Review Yellow · 18K, order page Rose · 18K | **Not reproduced yet.** Both screens read the same `order_specs.metal` row, so the row changed between the two views. Suspects: an older tab or the browser's back-cache re-posting the form with a stale radio | Browser test first (pick Yellow → review → send → order page), then fix what it shows. Autosave + one form submit path also removes the stale-form route |

## 9. Schema changes: your yes needed first

None of these touch the state machine, RLS rules for existing tables, audit,
payments, pricing or auth. Each would be one migration with its own RLS and
tests; I will not write them without a yes.

- **A. Per-type notification toggles.** Needs a `notification_preferences`
  table (user, kind, on/off) and the push fan-out to skip kinds turned off.
  Without it: only the per-device master switch.
- **B. Reply-to-message.** Needs a nullable `reply_to_message_id` on thread
  messages and a parameter on `post_thread_message` (checked to be in the
  same thread). Without it: no quoting.
- **C. Timezone (and country) on the profile.** Only if you want the zone to
  follow the person across devices and to default from country. Recommended:
  **no**; the cookie in §7 covers the bug.

## 10. Phasing (one phase per PR)

| PR | Scope |
| --- | --- |
| 10a | Bugs (§8) + shared time formatter + new order screen (§2) + brief wizard (§3) + reorder |
| 10b | Order hub (§4) + orders list + home / Messages inbox (§6) |
| 10c | Full-screen chat, desktop panel, team views (§5) |
| 10d | Settings: timezone + notifications (§7; per-type only with 9 A) |

Phase 9 (PayPal, refunds) follows unless you want it first.

## 11. Duplicates found and how they are consolidated

- Nine date formatters → `lib/time/format.ts`.
- Three copies of the brief summary rows (`review/page.tsx`,
  `orders/[id]/page.tsx` `briefLines`, `brief/page.tsx` `ReadOnlyBrief`)
  and three `pretty()` helpers → one `briefRows(spec)` in `lib/client/orders`.
- `ago()` in `MessagesView` → the shared relative formatter.
- Two progress concepts (`CLIENT_STEPS` 7-segment bar and the generic
  `Stepper`) → the `Stepper` with 5 labelled stages.
- No duplicate routes are added: chat stays `/messages/[orderId]`, the hub
  stays `/orders/[id]`, settings stays `/account`.

## 12. Copy budget

Measured, not estimated: the design-QA capture will record the visible word
count of each client screen (`innerText`) before and after, and the final
report gives the table. Target: −60 % on New order, Brief, Review, Order,
Messages and Home, every action still obvious.

## 13. Tests

- Unit: `gradeBrief` (new blocking gaps), `clientNextStep` / stepper
  stages, time formatter (zones, relative), draft step derivation.
- Browser tests whose controls change (approval asked per change, as
  before): "Save draft" (removed: autosave), "Add picture" / "Add a picture"
  (→ "Add photos"), "Review and send" (→ "Review"), "Still needed before we
  can price it" (→ inline "Add"), "Name this job" (kept), "Start a CAD
  brief" (→ the CAD tile). New tests: reorder path, photo upload in step 1,
  metal persists to the order page, chat send and the unread divider.
- Design QA at 390×844 and 1440×900, before and after, every step of: new
  order → brief → photos → review → send → quote → pay → chat → version
  review → delivered, plus reorder. Screenshots to the `design-qa` branch.

## Decisions (owner, 26 Oct 2026: "go with your recommendations")

1. Clients see **"Your team"**, not "Team · first name" (the brief). DECISIONS
   §11 is updated with the chat PR (10c).
2. **9 A** (notification types) and 3. **9 B** (reply-to): not decided yet;
   asked again, with a recommendation, before 10d and 10c. 10a and 10b do
   not depend on them.
4. Timezone: **cookie per device**, defaulting to the device's zone. No
   schema change (9 C not built).
5. Phasing as in §10, before Phase 9.

## 10b as built

- Counts sit on the hub tiles (Chat unread, Files, Revisions used, latest event) rather than as separate header chips: one place, fewer words.
- Next step: `clientNextStep(id, status, ctx)` takes the price, tier, revision rounds and the first-look time; no extra query.
- Near-duplicates consolidated: `DraftMenu` → `OrderMenu` (draft delete, order cancel, raise a problem); the files list → `files/OrderFiles` (Files page and the order's Files sheet); conversation rows → `messages/InboxRow` (Home and Messages); draft step labels → `draftProgress`; pay-page "what you get" → `whatYouGet`; the home page's own `timeAgo` → `formatRelative`.
