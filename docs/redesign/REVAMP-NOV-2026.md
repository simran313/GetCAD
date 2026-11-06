# Product-experience revamp — audit, direction, plan (6 Nov 2026)

Owner brief, 6 Nov 2026: keep black and white, but make the portal feel premium,
alive and effortless for every role, on desktop, phone and the installed app.
Fix iPhone display and scrolling first. Readers are often 45+; the chat's text
size and layout stay as they are.

This file is the plan. Each phase ships as its own PR with screenshots.
DECISIONS.md is updated as each phase lands.

---

## 1. Audit

Method: the code (tokens, shell, every fixed/sticky element), the design-qa
screenshots of every route at 390 / 768 / 1440 for client, designer, pod lead
and admin, and the pre-launch pass (every reachable page, each role, 390 px).

Severity: **S1** broken or blocks a task · **S2** slows or confuses · **S3** polish.

### 1.1 iPhone and scrolling

| # | Finding | Where | Sev |
|---|---|---|---|
| A1 | The installed app used the `black-translucent` status bar. The page drew under the status bar with **white** clock and battery, on a white app, so they were invisible. The top bar had no safe-area padding, so its buttons (WhatsApp, call, search, account) sat under the Dynamic Island, and its 90%-opaque blur smeared content behind the status bar. This is the "blurring" and "disappearing buttons" report. | `app/layout.tsx`, `components/shell/app-shell.tsx` | S1 |
| A2 | Every bar that clears another bar used its own pixel guess: `57px` ×4, `72px`, `84px`, `top-14` ×3. None included the status bar or home indicator, so they drifted on newer iPhones and in landscape. | brief wizard, brief review, client order page, save bar, toasts, connection banner | S1 |
| A3 | The staff action bar was `sticky bottom-0` under a `z-40` tab bar, so on a phone it sat **behind** the tab bar. | `components/domain/action-bar.tsx` | S1 (latent) |
| A4 | Full-screen views (final review, picture viewer, mark-up) put their close and back buttons in the status-bar area. | `work/[id]/review`, chat lightbox, `ImageMarkup` | S1 |
| A5 | The client order page's fixed action bar ("Pay & start", "Download") covered the end of the page: the reserved space was shorter than the bar. | `ClientOrderView` | S2 |
| A6 | A select wider than the screen on Pods at 390 px (long designer names). | `admin/access/pods` | S2 |
| A7 | No landscape safe areas: the top and tab bars ran into the notch in landscape. | shell | S3 |

### 1.2 Visual language

| # | Finding | Sev |
|---|---|---|
| B1 | **One surface for everything.** Every card is the same white box, 1 px hairline and near-invisible shadow. A card that holds the next thing to do looks like a card holding a footnote. Nothing leads the eye. | S2 |
| B2 | **No accent.** Colour appears only in small status pills. The only emphasis tools are size and black fill, so pages read as flat grey text. | S2 |
| B3 | **Titles said twice.** The phone top bar says "Orders" and the page heading below says "Orders" again. That is about 60 px of a 390 px screen on every page. | S2 |
| B4 | **Weak hierarchy in lists.** Order cards repeat a Service / Your PO / Date / Price grid, mostly "—". The piece name, its state and what it waits on are not the strongest things in the row. | S2 |
| B5 | **Empty and zero states shout.** "Nothing waiting for a check" boxes and 0-value stat tiles take the same space as real work (pod lead and admin homes). | S2 |
| B6 | **Reference codes everywhere in mono** at body weight (MJ1-RN-C-11) compete with names. | S3 |
| B7 | **Depth is binary** (flat or lifted dialog). There is no middle layer for sticky bars, pinned action panels or hovered rows. | S3 |

### 1.3 Feedback and liveness

| # | Finding | Sev |
|---|---|---|
| C1 | **A message or status change is silent until the page is reopened.** The live refresh (AutoRefresh, the inbox stamp) updates data, but nothing says "this changed". There is no toast, highlight or unread count in the tab bar. | S2 |
| C2 | **No notification centre.** Notifications exist in the database (`notifications`), but only as e-mails and push. There is no bell or list in the app. | S2 |
| C3 | **Pressed buttons don't always acknowledge the press.** Some server actions show a spinner; many forms only change after the round trip. There is no consistent pending → success → error pattern. | S2 |
| C4 | **Hard cuts between pages.** No transition marks where you went. On a phone the top bar title swaps with no continuity. | S3 |

### 1.4 Information hierarchy (order pages)

| # | Finding | Sev |
|---|---|---|
| D1 | **Client order page:** the "Next" card names the state ("Files ready") but holds no action. The action sits in a separate bar at the bottom. Deadline, last activity and next step are not together. | S2 |
| D2 | **Designer job page:** the clock, the one thing a designer watches, is a small inline timer among pills. "Ask pod lead" is the largest button on the page. Master instructions and references come after the deliverables on a phone. | S2 |
| D3 | **Team order page:** the "Next" card is good. Pod, checklist counts and links are a dense paragraph of small text. | S3 |
| D4 | **Timeline, files and revisions sit at the same visual level as the next action** on every role. | S2 |

### 1.5 Readability (45+)

The base is right and stays: 18 px body and 48 px controls for clients and
designers, 16 px / 44 px minimum for staff, and contrast floors tested in CI.
Gaps:
- 12 px text is used for meta in several places: status pill labels, tab bar labels and eyebrows.
- Grey-on-grey secondary text appears in dense staff tables.
- Thin 1.5 px icons sit at 16 px.

---

## 2. Design direction

**Principle:** quiet by default, loud only where it matters. Black and white
carry the brand. One accent carries **"live / needs you / selected"**. Depth
carries **"what's on top"**. Type carries **"what to read first"**.

### 2.1 Colour

- **Black stays the primary action.** One per view, as today.
- **One accent, used sparingly:** unread dots and counts, live indicators, the selected tab, progress, links inside text, focus. It is never used for a large fill or a primary button. Recommended: **Cobalt** `#2346F5`, with text-safe `#1B36C4` at 7:1 on white. It reads as precise and technical, and it does not compete with the jewellery photography in references and renders.
  - Alternative: **Champagne** `#9A7B4F` (text `#7A5F38`). Warmer and more "jewellery", but it is near the amber "SLA risk" tone and reads as decoration.
  - Owner to choose; R2 shipped with cobalt. 6 Nov 2026, owner: too abrupt. Replaced by a monochrome accent: near-black marks, a black-to-graphite rail, slate for in progress; own chat messages on light grey.
- **Status tones stay semantic:** neutral, info (now the accent hue), success, warning (SLA only), danger. Each pill gets 14 px minimum text and a 6 px dot.

### 2.2 Surfaces and depth (three levels)

| Level | Use | Treatment |
|---|---|---|
| Ground | page | `#FAFAFA` (as now) |
| Raised | cards, lists | white, hairline, `e-1` (slightly stronger: 0 1px 2px + 0 1px 1px) |
| Focus | the one card that holds the next action | white, 1 px **black** edge, `e-2`, 4 px accent rail on the left when it waits on you |
| Floating | top bar, tab bar, action bars, toasts, sheets | **glass**: 80% white + 16 px blur + saturate, hairline, `e-3` above content. Solid on reduced-transparency. |

Glass only on bars that float over moving content, never on cards. On iOS,
the top bar stays nearly opaque, so the status bar band reads clean.

### 2.3 Type and rhythm

- Page title 28/32 on phone (from 32/36), 600, −0.02em. The phone top bar shows the **section**, small and grey, so the title is said once.
- A **lead line** under titles for state ("2 orders need you · next due 4:30 PM").
- Names over codes: a reference code becomes 14 px mono grey under the name, never beside it at the same weight.
- Numbers that matter (price, time left, counts) use a display numeral style: 24–32 px, tabular.
- Spacing on a 4/8 rhythm with **section gaps of 32 px** on a phone (from 24), so groups separate without boxes.

### 2.4 Motion and feedback (lightweight, reduced-motion safe)

- **Press:** 0.98 scale and darken in 100 ms on every button and tappable row.
- **Pending:** the label stays and a spinner replaces the icon; the button keeps its width.
- **Success:** a check morphs in for 1.2 s, then a toast if it changed something elsewhere.
- **Error:** an inline message in plain words, at the control.
- **Live change:** an updated row flashes the accent tint for 1.5 s, and a toast names it ("Your team replied on MJ1-RN-C-11 · Open").
- **Page transitions:** the View Transitions API, with a 150 ms cross-fade and title slide. They are off under `prefers-reduced-motion` and in browsers without the API.
- Durations 100–250 ms, ease-out; nothing loops except live dots, which are static under reduced motion.

### 2.5 Hierarchy pattern for every order page: "Now / Next / Then"

1. **Now:** the state in words, time left or due, and the accent if it waits on *you*.
2. **Next:** the one action as a full-width button inside the same card, plus "Nothing is charged until you pay"-type reassurance.
3. **Recent:** the last 2–3 events (message, file, status), each one tap away.
4. **Then:** messages, files, brief, revisions and timeline as quiet rows that open sheets on a phone and side panels at desk width.

Role specifics:
- **Client:** price and what it covers when quoted; Download first when delivered.
- **Designer:** a large clock with pause and resume, the master instructions pinned above the brief, deliverables as a checklist.
- **Pod lead:** what's failing or waiting, then the checklist.
- **Admin:** the "Next" card (already strong), then money and pod.

---

## 3. Plan (one PR each, in order)

| Phase | Scope | Status |
|---|---|---|
| **R1 — iPhone chrome** (merged) | Status bar style; safe-area and chrome tokens (`--chrome-top`/`--chrome-bottom`); all bars on the tokens; full-screen views clear the notch; order-page spacer; Pods overflow; a CI test that forbids pixel offsets; a browser test that simulates the iPhone 15/16 Pro notch on every role's pages. Fixes A1–A7. | Merged |
| **R2 — Design system v2** | Accent tokens, 3-level surfaces + glass bars, type scale and lead line, the "focus card", status pills at 14 px, button press and pending states, title said once. `/design-preview` updated first for sign-off, then rolled out through the shared components, so every page changes at once. Fixes B1–B7 and C3. | Merged (#114; accent made monochrome in #118) |
| **R3 — Live** | In-app notification centre (bell + sheet) from the existing `notifications` table; unread counts on the Messages tab and the bell; live toasts when a message or status arrives (from the existing change stamp); row highlight on change; page transitions. Fixes C1, C2, C4. | Merged (#115). Row highlight not built. |
| **R4 — Order pages** | "Now / Next / Recent / Then" for the client order page, designer job, QC review and team order page. Fixes D1–D4. | Merged (#116) |
| **R5 — Homes and lists** | Orders list rows (name, state, what it waits on; no "—" grid), role homes (one "needs you" block, quiet empty states, stat strips that hide zeros), designer jobs list with clocks. Fixes B4, B5. | Merged (#117) |
| **R6 — QA** | Visual comparison before/after for every route and role; axe-clean; iPhone simulation green; Lighthouse and the speed budget unchanged or better. | Done: section 4 |

Guardrails for every phase:
- No business logic, permission or data change.
- No change to the chat's text size or layout.
- Anonymity rules unchanged.
- Each PR passes `npm run ci`, e2e and `[design-qa:after]`.

---

## 4. R6 — final QA (6 Nov 2026)

**Compared:** design-qa `after/` at 6e184fc (4 Nov, before R1) against 82576c3
(after R1–R5 and R2b). Every role, at 390 px, with the routes side by side.

| Check | Result |
|---|---|
| axe, every route, every role, 390 / 768 / 1440 | No serious or critical findings: client, client2, designer, pod lead, admin, marketing, preview. |
| iPhone 15/16 Pro simulation (`zw-iphone.e2e.ts`) | Green on every role: the top bar clears the island, the tab bar clears the home indicator, no bar overlaps another, and the end of every page scrolls clear. |
| Website Lighthouse (mobile) | Home 84–87 and pricing 85–86, the same as before the revamp. The goal of 90 is not met; that predates the revamp (PERFORMANCE.md item 12). |
| Portal speed: tab switches, sending a message | Unchanged: 20–55 ms to the first change; 85–95 ms for a message to be saved. |
| Portal speed: largest paint | **Regressed in R3, fixed here.** New order, messages, account and the order and chat pages went from 230–350 ms to 470–600 ms. The page entrance started at opacity 0; it is now a 4 px rise with no fade. |
| Portal speed: slowest tap in the chat (INP) | **Regressed in R3, fixed here.** It went from 40–56 ms to 112–136 ms. The live inbox re-rendered the whole shell on every 20 s look, even when nothing had changed, and again on focus. It now updates state only when the answer changes, looks once when focus and visibility arrive together, and makes its first look when the page is idle. |
| Top-bar names on a phone | **Fixed.** Payouts and Credits were called "Queue"; a team order page, the designer's payout account and onboarding were called "The CAD Pillar"; the client's bar cut "Messages" to "Messa…". The fix adds `pageTitle()` (`core/nav/tabs.ts`, with tests) and a tighter icon gap on a phone. |

Left as is:
- The admin Clients table scrolls sideways inside its card on a phone. This is a staff screen, the same as before the revamp.
- Info pills ("In progress") use slate. That is the one tint left; it is muted and blue-grey, not cobalt.
