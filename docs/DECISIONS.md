# The CAD Pillar — DECISIONS (source of truth)

Version 1.4 · 31 October 2026 · Owner: Fazil Zaidi

Changes in 1.4: the website shows one price, "from $35", and retainers; the bands below stay internal (§4). Positioning is AI-native: AI models, experts check (§1). Live support hours and the portal's 24/7 availability (§1). Changes in 1.3: weight sheet in grams only, no metal cost (§9); preview link 3D view built from the STL (§9). Changes in 1.2: pod routing and account managers (§11). Changes in 1.1: the SLA clock starts when the order is both paid and confirmed by the team (§6); payment providers (PayPal, Wise, others) are connected last (§13); late credits are decided by admin (§6).

**Rule:** if this file disagrees with any other document, screen or chat, this file wins. If something is still unclear, stop and ask; do not guess. Update the version line on every change.

Scope of this build: **jewelry CAD + renders**, client portal + staff portal + public website. Dental is **out of scope** (separate brand, from January 2027).

---

## 1. Business basics

- **Brand:** The CAD Pillar (TCP). Fully independent of The CAD Co. (TCC): no TCC data, files, clients, portfolio or branding anywhere in code, seed data or content.
- **Customers:** trade only (jewelry businesses), white-label. No consumer orders.
- **Markets:** USA first; UK, Australia, Canada accepted.
- **Team hours:** the portal is open 24/7. Live support (calls and WhatsApp, +91 83692 88293) answers 3 PM – midnight India time every day: **5:30 AM – 2:30 PM ET** in US daylight time, **4:30 AM – 1:30 PM ET** in standard time, shown in ET and adjusted for daylight saving automatically (core/support/hours). The SLA depends on this.
- **Positioning (1.4):** AI-native jewelry CAD. Our AI models each piece; senior designers check and finish every file and a master craftsman signs it off. Public claims: first look within 6 hours, bulk orders included; 99% of first looks right first time; 50+ senior designers, 10+ years each (owner-confirmed). Never "first" or "only": they cannot be proven.
- **Currency:** USD for clients; INR for designer and QC payouts. Store money as integers (cents / paise).

## 2. Roles

| Role | Can do | Can never do |
| --- | --- | --- |
| Client | Order, pay, approve, download, message the team | See designer identity |
| Designer | Work on jobs assigned to them; message pod lead and admin | See client identity, prices or other jobs |
| Pod lead (QC) | Assign jobs in own pod, run QC, create orders for clients | See other pods |
| Admin (Sales + Ops + Finance) | Everything | — |

Visibility is enforced in the database (row-level security), not just the UI.

## 3. Categories

Every order gets one category, set by admin or pod lead before quoting.

| Cat | Minutes | Tier | Designer pay (₹500/hour) |
| --- | --- | --- | --- |
| A | 15 | Standard | ₹125 |
| B | 30 | Standard | ₹250 |
| C | 45 | Standard | ₹375 |
| D | 60 | Standard | ₹500 |
| E | 90 | Standard | ₹750 |
| F | 120 | Standard | ₹1,000 |
| G | 180 | Complex | ₹1,500 |
| H | 240 | Complex | ₹2,000 |
| I | 300 | Complex | ₹2,500 |
| J | 360 | Complex | ₹3,000 |
| K | 420 | Complex | ₹3,500 |
| L | 480 | Complex | ₹4,000 |

## 4. Client prices (jewelry CAD)

| Price band | Categories | Typical pieces | Price |
| --- | --- | --- | --- |
| Standard | A–C | Bands, solitaires, simple pendants and earrings | **$55** |
| Complex | D–F | Halo, pavé, multi-part, bracelets | **$85** |
| Sculpted / figurative | G–L | Signets with figures, sculpted, large multi-part | **From $120, quoted** |
| First design (new account) | A–C | One design | **$49** |

- **Website (1.4):** one public price, **from $35 a design**, and retainers for regular clients. The bands and categories in this table are internal quote defaults and are not shown to clients; a quote below the band default is set by admin on the quote.
- Admin can override any price on the quote; the system warns if job payouts exceed 40% of the price.
- Render-only orders: quoted by admin in v1 (no fixed card yet).
- Every price in the screen designs ($180, $240 …) is placeholder. Use this table.

### Plans

| Plan | Price | Includes |
| --- | --- | --- |
| Volume credits | 20 for $990 · 50 for $2,250 | Prepaid; valid 6 months; same guarantees; 50-pack gets priority queue |
| Monthly partner | $1,500 / month | 35 standard CADs; overage $45; named account manager; monthly report |
| Dedicated designer | $2,900–3,500 / month (test) | One named designer, ~140 h/month in US hours, second-designer QC |

Plans are **behind a feature flag** in v1 (see section 12); sell them manually until the wallet is live.

## 5. Payouts

- **Designer:** category minutes × ₹500 / 60, locked at quote. QC send-backs are not paid extra. Client-requested changes after approval = a new job at its own category.
- **QC / pod lead:** `max(₹500, round_to_nearest_50(order USD × 1000 / 60))`, locked at quote. Examples: $30 → ₹500, $55 → ₹900, $60 → ₹1,000, $85 → ₹1,400, $180 → ₹3,000.
- Paid when the order closes. In October payouts are calculated in the app and paid by bank transfer from an export.
- **When a late order is credited:** designer and QC are still paid (default; can be changed later).

## 6. SLA (speed promise)

- **Standard tier (A–F):** first look within **6 hours of order confirmation**.
- **Complex tier (G–L):** deadline set by admin with the price (hours), shown to the client before they pay.
- **Clock starts** when the order is both **paid** and **confirmed**, at whichever happens last.
  - Paid = the client paid the quoted amount (card) or admin marked a manual / Wise / PayPal payment received.
  - Confirmed = admin or the pod lead pressed "Confirm order" once the brief is complete and open questions are answered.
- **Met** = the order reaches "first look shared with client" (renders or files for approval) before the deadline.
- **Missed (standard only):** a credit for the full amount paid is created as **pending**, once, and the order is still completed. Admin decides it: apply to the next order, refund, partial credit (with a reason) or reject (with a reason). Complex misses are flagged to admin, no credit.
- **October:** the system flags misses; admin clicks **Issue credit**. **November:** automatic credit via the every-minute check, idempotent (never twice).
- No pause for "waiting on client" in v1.
- **Internal targets:** designer due time = deadline − 60 minutes (QC buffer). Designer timer = category minutes from "Start work".

## 7. Guarantees (client-facing promises)

1. **First look within 6 hours of order confirmation, or it's free** (standard tier, as in section 6).
2. **Castable files, guaranteed to spec.**
   - Every delivery includes a signed spec sheet (minimum wall, prong, stone-seat sizes, ring size, mesh tolerance, no open edges).
   - If a delivered file breaks its own spec sheet, TCP fixes it free and refunds the CAD fee.
   - **Not covered:**
     - casting failures where the archived file meets spec;
     - edited files, i.e. a fingerprint mismatch;
     - client waivers recorded on the spec sheet;
     - claims made after 30 days.
   - Liability is capped at the CAD fee, never metal or stones. More than 2 claims a quarter from one client go to manual review.
3. **White-label, NDA by default, client owns the IP on payment, designers never see the client's customer.**

## 8. Revisions

- **2 revision rounds included within 14 days of first look.**
- After that, changes are a new job at their own category.
- QC send-backs don't count as client revisions.

## 9. Deliverables (every CAD order)

- 3DM + STL (mesh max distance/edge 0.005).
- 3 render views.
- QC certificate PDF, which doubles as the spec sheet.
- Weight sheet: estimated grams in 10K, 14K, 18K, Pt950 and Ag925 from the model volume. No metal cost in v1.
- Branded 3D preview link the jeweler can send their own customer (3D view built from the STL; renders alongside).
- Required designer upload slots: 3DM, STL, TV, PV, RV, FV, BV, M, DD, GW.
- Files are auto-named `{ORDER}_{SLOT}_v{n}.{ext}`; metadata stripped; delivered files fingerprinted (SHA-256) and archived read-only.

## 10. Quality system

- **19-point checklist, two levels (designer, then QC):**
  - The designer can't submit until all 19 are ticked and signed off.
  - QC can't pass until all 19 are ticked.
  - Sending a job back requires a written note.
  - Full list: build spec section 8.
- Every tick, decision, credit and payout writes to the audit log.

## 11. Orders, assignment, messaging

- **Desktop ordering is one page (N1/N7); mobile is stepped.**
- **Minimum to submit:**
  - product type;
  - at least one reference image;
  - size (ring size or circumference; bangle/bracelet inner size or length);
  - metal;
  - centre stone yes/no (shape and size if yes).
- **On-behalf orders (WhatsApp / email / phone):**
  - Created by admin or pod lead.
  - At least one screenshot is required; other brief fields are optional.
  - Visible in the client's portal.
  - The clock starts only when the order is paid and confirmed (section 6).
- **Flow:** admin → pod lead → designer. Capacity 480 category-minutes per designer per shift; over capacity needs an admin override with a reason.
- **Pod routing:** when an order is paid or confirmed and has no pod, it joins the pod automatically if exactly one pod has a pod lead. With several pods, admin chooses the pod from the queue.
- **Account managers:** admin can name one team member as each client's account manager. There is no business check before pricing: a new client is never held back from a quote.
- **Messaging:**
  - Client ↔ team thread: to the client, everyone on the team is "Your team" (owner decision, October 2026; the client screens never show a staff name). Staff reading the thread still see "Team · first name" for each other.
  - Designer ↔ pod lead/admin internal thread.
  - Designers can never post in client threads (enforced by RLS).
  - Live chat (Phase 13): a new message or file sends an empty "this thread changed" signal on the thread's private Realtime channel; only people who may read the thread may join it (a designer never joins the client thread), and nobody sends from the browser. The chat then reads itself through the usual functions; the signal carries no text, sender or order data.

## 12. Feature flags (v1 launch)

| Feature | October | Later |
| --- | --- | --- |
| Wallet top-ups, credit packs, plans checkout | Off (manual invoicing) | November |
| Automatic SLA credit | Off (manual Issue credit) | November |
| Rush delivery | Off | When defined |
| In-app payouts | Off (export + bank transfer) | November |
| Capacity blocking | Off (warning only) | November |
| Render brief one-page (N7) | On, quoted by admin | — |
| Public stats page | Off until 30 days of real data | December |
| Dental | Off | January 2027, separate brand |

## 13. Payments

- Razorpay (cards/UPI/international) is the checkout in the portal now.
- Manual invoice, payment link, Wise bank transfer or PayPal: admin marks the order paid.
- Connecting PayPal, Wise (automatic matching) and other providers in the portal is the **last build phase**.
- Payment alone does not start the clock (section 6).

## 14. Compliance

- No TCC data, files, client lists or samples anywhere.
- Prospect data from public sources only.
- Terms and privacy pages live before go-live.
- Dental (later): HIPAA BAA before the first case.

## 15. Open decisions (defaults apply until changed)

| # | Question | Default |
| --- | --- | --- |
| 1 | Dedicated designer price | Test $2,900 vs $3,500 |
| 2 | Render-only price card | Quoted |
| 3 | SLA pause while waiting on client | Resolved in 1.1: the clock starts only once the order is confirmed |
| 4 | QC pay vs designer pay imbalance on large orders | Unchanged; review after 60 days |
