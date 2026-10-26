# Redesign audit (step 0) — before

Screens: every route, signed in as each role, at 390 / 768 / 1440 px, captured
by `.github/workflows/design-qa.yml` from a real build after the e2e journeys
(so the screens show real orders). Images: branch `design-qa`, folder `before/`
(222 screenshots).

Severity: **Critical** blocks a task or shows wrong information · **High** hurts
trust or speed on a core screen · **Medium** inconsistency or friction ·
**Low** polish.

## 1. Across the whole product

| # | Severity | Issue | Where |
| --- | --- | --- | --- |
| G1 | Critical | Pages wider than the phone: content runs off the right edge at 390px. Text, pills and table columns are cut off, and on the Queue the SLA and action columns cannot be reached, so staff cannot act from a phone. | Client Home, Admin Queue, Billing table, Access emails |
| G2 | Critical | The marketing header on a phone breaks the wordmark over three lines ("The / CAD / Pillar"), pushed by Sign in + CTA + Menu. | Every marketing page @390 |
| G3 | Critical | Two entry prices: the nav and hero say "$49"; the proof bar says "From $55 a design". | Marketing home, pricing |
| G4 | High | The condensed display serif (Instrument Serif) on every title and every large number reads stretched; "$165.00" and "From $120" look squeezed. | All screens |
| G5 | High | Uppercase, letter-spaced mono is used for eyebrows, table headers, status pills, category tags and the proof bar (154 `font-mono` uses). It shouts and slows reading. | All screens |
| G6 | High | Status tags are uppercase outlined boxes with no colour difference between "In progress", "Payment held" and "Assigned", so state is read, not seen. | Every list |
| G7 | High | Browser-default file inputs ("Choose File · No file chosen") on 6+ screens; on the designer job page 10 slots × (Choose + Upload) = 20 controls, with "No file chosen" clipped. | Messages, designer job, new order, claim |
| G8 | High | Max width and alignment change from page to page: Queue/Orders left and wide; Account, Settings, Files, Pay, New order, Access centred and narrow. The content jumps as you navigate. | Portal |
| G9 | High | Sidebar 256px with a mono "ADMIN WORKSPACE" label; the user block is an avatar plus the floating words "Signed in", with no name or role. | Portal shell |
| G10 | Medium | Duplicate nav icons: Access and Settings share one icon; Clients and Account share another. | Admin sidebar |
| G11 | Medium | Rows of equal-weight stat tiles: zeros are as loud as real numbers (10 on Queue; 4 on Home, Billing, QC queue). | Queue, homes |
| G12 | Medium | Pluralisation: "1 reviews", "1 orders/jobs" patterns. | Access, lists |
| G13 | Medium | The "held / escrow" money language on client screens ("$55.00 held until you approve" on a delivered order) contradicts the website rule against escrow language (IMPLEMENTATION-PLAN C11) and is stale after delivery. | Client order, pay |
| G14 | Low | Full-page screenshots show the fixed bottom bar mid-page (a capture artefact, not a bug); noted so it is not mistaken for one. | — |

## 2. Marketing site

| Page | Severity | Issue |
| --- | --- | --- |
| Home | Critical | G2, G3. |
| Home | High | Hero: H1 orphan ("…without the / hire."); no visual on the right (half the hero is empty at 1440); the only secondary CTA is "See how it works". |
| Home | High | The proof bar is three uppercase mono sentences, not proof: no numbers, no hierarchy. |
| Home | Medium | "How it works" is five cramped cards at 1440 with 13px copy; no product shown. Nothing shows the product working (Stripe-style). |
| Home | Medium | No FAQ, pricing preview, team or contact on the page; one final CTA. No live contact anywhere. |
| Pricing | High | At 390 the band table squeezes descriptions into a 1-word-wide column (6 lines for "Bands, solitaires…"). |
| Pricing | Medium | No instant quote; the price depends on reading a table. |
| All | Medium | The footer says "Studio in Mumbai, working US business hours"; the redesign brief says "We work your hours". Needs one story (see §6). |
| Sign in | Low | The serif and the left black panel are fine, but the panel repeats the hero line; Clerk's "Development mode" ribbon shows only in development. |

## 3. Admin

| Page | Severity | Issue |
| --- | --- | --- |
| Queue | Critical | G1: at 390 the table runs off-screen; "Assign"/"Close" are unreachable. |
| Queue | High | 10 equal tiles (known issue); every row button is primary black (known); "SLA left: Not started" on rows whose clock has not started (known); the uppercase "5 H 57 MIN" pill is a timer drawn as a status. |
| Queue | Medium | Three small underlined links (Payouts · Late-order credits · Pods) under the table: orphan navigation. |
| All orders | Medium | Good bones (tabs with counts, search). Uppercase pills (G6); no saved views; row is not clickable as a whole; no detail drawer. |
| Order detail | High | 11 stacked cards; the next action is in a small "Next" card on the right; 20 file versions listed flat (v1–v20) on the left at full height; native file inputs in both composers. |
| Create order | Medium | Search is a separate form above the order form (two Submit buttons); native date and file inputs; the "Email the client" checkbox at 16px. |
| Access | High | Known: red Suspend on every row; raw `user_…` IDs shown; two-step role change (select + Set role); separate Filter button; tabs without counts; "1 reviews". At 390 each person is 4 stacked controls and emails wrap mid-word. |
| Settings | High | Known: per-row Save (17 Save buttons); the density helper text is copy-pasted ("13100 is 13.1 g/cm³" on every alloy); raw keys under every label; units in mg/cm³ and µm; "Designer due = SLA due − this" is not a sentence. No section save, no before → after, no "last changed by". |
| Billing | Medium | G1 on the movements table; 4 tiles; two plain buttons on the right card. |
| Account | High | Known: misaligned (centred 420px column, unlike every other page); raw `user_…` as "Account reference"; "Sign out" floating text, not a button; roles as a dotted string. |

## 4. Client

| Page | Severity | Issue |
| --- | --- | --- |
| Home | Critical | G1: at 390 the page is wider than the screen ("…tell you the r", pills cut). |
| Home | Medium | Four tiles lead (0 need you, 3 in progress…); "Nothing is waiting on you" is the right message but sits below the tiles. |
| Orders | Medium | Desk table is clean; "Payment held" reads like a problem to a jeweler. Mobile cards truncate names ("Mehta anniversary…"). |
| Order detail | High | 9 cards; the primary action changes position by state; at 390 the stage bar is seven unlabeled black lines; the "Order a change" textarea is always open, competing with messages; "Share a 3D preview" title wraps. |
| New order | Medium | Two equal black primaries (CAD / Renders) side by side. Fine on a phone; "Order again" is a link styled as a sentence. |
| Pay | Medium | Two cards; the black Pay button is right; escrow-style "Held until you approve" (G13). |
| Files | Medium | 20 rows of v1+v2 files with SHA-256 lines, each with its own Download; no grouping by version or "Download all". |

## 5. Designer and pod lead

| Page | Severity | Issue |
| --- | --- | --- |
| Designer · Open jobs | Medium | Clean; "Start work" primary per row is right here (one per job), but status, category and "45 MIN" are all uppercase mono. |
| Designer · Job | High | G7 (20 upload controls); at 1440 the slot grid is cramped and clips "No file chosen"; "Submit to QC" is a greyed button with the reason in small text below. |
| Pod lead · QC queue | Medium | 4 tiles where one sentence would do ("Nothing waiting for a check"). |
| Pod lead · Team board | Medium | "CAT C" tags wrap onto two lines; "Not started" pill next to a countdown pill on the same card; per-card Assign primary. |

## 6. Conflicts with written decisions (need the owner before step 4)

The redesign brief asks for a few things the source-of-truth documents (and the tests that guard them) currently rule out:

1. **"Double-blind by design"** (differentiator card 1). IMPLEMENTATION-PLAN C11 lists "double-blind" as copy to remove from the website, and `tests/config/marketing.test.ts` fails on it. Proposed: "Your designs stay yours: designers never see who you are" (same meaning, no banned term), or change C11 and the test.
2. **Numbers on the homepage** ("50+ senior CAD designers", "10+ years"). LANDING-COPY: "Never show fake stats… Stats: hidden until 30 days of real data". Team size and experience are capability claims, not performance stats, but they must be true: they stay TODO in `content/claims.ts` until confirmed.
3. **"Miss the SLA and the full amount goes back to your wallet"**. DECISIONS §6: a missed standard first look creates a credit for the full amount, which **admin decides** (automatic credit is off until November). DECISIONS §7 promises "or it's free". Proposed wording that is true today: "Miss the 6-hour first look and the full amount comes back as credit; we still finish the order."
4. **"We work your hours" / live call**. DECISIONS §1: team hours are US business hours (Eastern), so the claim holds; the footer's "Studio in Mumbai" line should follow whichever story you choose. LIVE_CALL_HOURS and the phone number are TODO.
5. **docs/design/**. CLAUDE.md says "Build UI to match docs/design/"; this redesign replaces those mockups. When approved, CLAUDE.md and docs/design/README should point at the redesign.

## 7. Known issues — confirmed

| Known issue | Confirmed | Where |
| --- | --- | --- |
| Condensed stretched display font | Yes | All titles and big numbers (G4) |
| Orphaned hero line | Yes | Home H1 "…without the / hire." |
| Empty hero visual | Yes | Home @1440, right half empty |
| $49 vs $55 conflict | Yes | Nav/hero $49 vs proof bar "From $55" (G3) |
| Overused uppercase mono | Yes | 154 uses (G5) |
| Oversized sidebar | Yes | 256px, mono workspace label (G9) |
| Double active nav state | Partly | Not in the static captures (one row is marked current). Cause in code: the hover fill is the same colour as the active fill (`bg-muted` / `bg-white/[0.12]` vs `/[0.06]`), so the row under the pointer looks selected next to the real one. |
| Duplicate Access/Settings icons | Yes | Both `board` (G10); Clients/Account both `user` |
| 10 equal-weight stat tiles | Yes | Queue |
| Every row button primary | Yes | Queue, Team board |
| "SLA left: Not started" | Yes | Queue rows |
| Red Suspend on every row | Yes | Access |
| Raw user IDs exposed | Yes | Access rows, Account page |
| "1 orders" / "1 jobs" | Yes | "1 reviews" on Access; same helper elsewhere |
| Two-step role change | Yes | Access: select + Set role |
| Per-row Save buttons | Yes | Settings (17) |
| Wrong copy-pasted density helper text | Yes | Every alloy row says "13100 is 13.1 g/cm³" |
| Account page misaligned | Yes | Centred narrow column |
| Floating Sign out text | Yes | Account |

## 8. Found beyond the known list

- G1 phone overflow (Client Home, Queue, Billing, Access) — the most serious.
- G2 marketing wordmark breaking over three lines on phones.
- G7 browser-default file inputs everywhere; 20 controls on the designer job page.
- G8 inconsistent page widths and alignment.
- G13 "held / escrow" money wording on client screens, stale after delivery.
- Pricing table unreadable at 390.
- Team board "CAT C" tags wrapping; countdown and "Not started" pills side by side.
- Order detail (admin and client): 9–11 stacked cards, primary action not fixed in place, 20 file versions listed flat.
- **Test bug:** after the e2e run the `capacity_blocking` switch was left **on** in the test database. The over-capacity test's clean-up checks for the "Turn off" button before the streamed page has rendered it. Fixed as part of step 7: wait for the button before clicking.
