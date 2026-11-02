# The CAD Pillar: Business & Product Marketing Knowledge Base

**What this document is.** A factual inventory of the business, the platform and the brand, extracted from the code, the database rules and the internal decision records of The CAD Pillar. It is written for Claude Chat (go-to-market and marketing content) and Claude Design (brand and marketing creatives). Neither needs to see the codebase.

**What it is not.** It contains no campaigns, posts, newsletters or designs. It adds no promises, statistics, testimonials or competitive claims beyond what the business has stated and the system supports.

**Prepared:** 2 November 2026, from the `main` branch after the latest release (the final review page with reference zoom).

**Updated:** 2 November 2026 with the owner's answers:

- **$35 is the real price.** The Terms page has been updated to match.
- **The logo and favicon are black pillars on a white background.** This now applies everywhere.

**Ranking of sources.** The governing source is `docs/DECISIONS.md`, the owner's record of business rules, version 1.7. Where documents disagree, that record wins. Section 11 lists every disagreement found.

---

## How to read this document

### Status labels

| Label | Meaning |
| --- | --- |
| **LIVE** | Built, merged and switched on in the deployed application. |
| **BUILT – NEEDS ACTIVATION** | Built and tested, but it reaches customers only after an owner action: a setting, an API key or an approval. Its production status could not be verified from the code. |
| **OFF (flag)** | Built or partly built behind a feature switch that is off by default. Not available to customers. |
| **PLANNED** | Decided or documented, not built. |
| **INTERNAL** | Staff-only. Not a customer feature. It can be described as "how we work behind the scenes", never as something the customer uses. |

### Evidence labels

| Label | Meaning |
| --- | --- |
| **[VERIFIED]** | Confirmed in the code, the database rules or automated tests. |
| **[OWNER CLAIM]** | A business statement the owner confirmed for public use (recorded in `content/claims.ts` and the decisions file). The system does not measure it. |
| **[ASSUMPTION]** | My interpretation, labelled so it can be checked. |
| **[UNKNOWN]** | Information that is missing and must be supplied by the owner. |

### Left out on purpose

- Credentials and keys.
- Private customer data.
- Internal pay rates and margins.
- Database and security implementation details.
- Personal names of staff.

---

## 1. Business Overview

### 1.1 What the business does

The CAD Pillar (short form **TCP**; logo: three black pillars) is a **trade-only jewelry CAD studio and production platform**. Jewelry businesses send a design brief (a sketch, photo or reference plus size, metal and stones) and receive production files:

- 3D files ready for printing and casting;
- render images;
- a technical sheet;
- signed quality documents.

All of this runs through a client web portal. [VERIFIED]

- **Positioning statement used on the website:** "The AI-native jewelry CAD studio" and "AI-native jewelry CAD. Checked by experts." [VERIFIED: website code; OWNER CLAIM]
- **Homepage headline:** "Factory-ready jewelry CAD, in hours." [VERIFIED]
- **How the owner describes the model:** "Our AI models each piece; senior designers check and finish every file and a master craftsman signs it off." [OWNER CLAIM, DECISIONS §1]
- **Description in the installed app's manifest:** "The operational infrastructure for jewelry CAD production." [VERIFIED: `app/manifest.ts`]

### 1.2 Who it serves

| Item | Fact | Evidence |
| --- | --- | --- |
| Customer type | **Trade only**: jewelry businesses. No consumer orders. | [VERIFIED] DECISIONS §1; website FAQ "Do you work with consumers? No." |
| Service model | **White-label.** The jeweler presents the work as their own. | [VERIFIED] |
| Markets | **USA first**; UK, Australia and Canada accepted. | [VERIFIED] DECISIONS §1 |
| Currency | Clients pay in **USD**. | [VERIFIED] |
| Named audiences (website) | 1) Custom and bridal jewelers who want to show customers a CAD the same day. 2) Manufacturers and trade shops with more CAD work than designers. 3) Brands and wholesalers launching new collections. | [VERIFIED] `components/marketing/content.ts` (AUDIENCES) |
| Studio location | **Mumbai, India.** The portal is open 24/7; a person answers calls and WhatsApp every day from 3 PM to midnight India time. That is 5:30 AM – 2:30 PM ET in US summer and 4:30 AM – 1:30 PM ET in US winter, adjusted automatically. | [VERIFIED] DECISIONS §1, website FAQ, live status widget |

### 1.3 Services

| Service | Status | Notes |
| --- | --- | --- |
| **Jewelry CAD** (3D model from a brief) | LIVE | The core service. Products: ring, band, pendant, earrings, bracelet, bangle, necklace, brooch, other. |
| **Renders** (render-only orders) | LIVE | A separate choice when starting an order (one-page render brief). Price is quoted individually. |
| **Branded 3D preview link** for the jeweler's own customer | LIVE | See §2. |
| **Dental CAD** | PLANNED (OFF) | A separate brand from January 2027. **Out of scope; do not market.** |
| **Rush delivery** | OFF (flag) | Not defined yet. Do not market. |

### 1.4 Business model and pricing facts

**Public price.** "**From $35 a design**", with **retainers** for regular clients. **The owner confirmed on 2 Nov 2026 that $35 is the real price.** [VERIFIED: website, Terms page; OWNER CONFIRMED]

**How a price is set.** Every order gets a **fixed price (quote) before payment**. The client pays only after accepting it. [VERIFIED]

**Internal quote defaults** (DECISIONS §4). These are used inside the portal when the team prepares a quote. **Never publish them.** As of 2 Nov 2026 the Terms page no longer lists them; it says "Prices start from $35 a design".

| Band | Typical pieces | Default quote |
| --- | --- | --- |
| Standard | Bands, solitaires, simple pendants and earrings | $55 |
| Complex | Halo, pavé, multi-part, bracelets | $85 |
| Sculpted / figurative | Signets with figures, sculpted, large multi-part | From $120, quoted |
| First design (new account, once) | Standard pieces | $49 |

- **How $35 is set today.** The team enters $35 on the quote. The portal's automatic default for a standard piece is still $55. This is an internal setting and is never shown to clients (see §11). [VERIFIED]
- **Plans for regular clients.** The documented structures are volume credit packs, a monthly partner plan and a dedicated designer. They are **behind a switch that is off (wallet checkout)** and are **sold manually**. The website mentions only "retainers": "A monthly rate for a steady flow of designs · A named account manager · Priority in the queue, bulk orders included". [VERIFIED] Exact plan prices are internal defaults and must be confirmed by the owner before any marketing use. [UNKNOWN]
- **Payment methods:**
  - **Card checkout through Razorpay** in the portal. BUILT – NEEDS ACTIVATION: live keys are an owner setting.
  - **Wise, bank transfer or PayPal by arrangement:** the client messages the team, and the team marks the order paid when the money arrives. LIVE as a manual process.
  - Automatic PayPal or Wise matching is PLANNED as the last build phase. [VERIFIED]
- **Wallet** (credits balance, transactions, invoices): LIVE, **read-only**. It shows credits, for example a late-delivery credit. Top-ups and credit-pack purchases are OFF. [VERIFIED]

### 1.5 Problems the business solves (as stated on the website)

- **Speed.** A first look in hours, not days: "first look within 6 hours of order confirmation, bulk orders included". [VERIFIED copy; OWNER CLAIM]
- **Files that fail at the bench.** Castable files with a signed spec sheet and a free fix plus refund if a file breaks its own spec. [VERIFIED]
- **Remakes and rework.** Two-stage quality control on every file. [VERIFIED]
- **Chasing and status calls.** An order tracker, a timeline, live chat, notifications and a live support line. [VERIFIED]
- **Confidentiality.** White-label, an NDA by default, the client owns the files once paid, and designers never see who the client or their customer is. [VERIFIED: enforced in the database]
- **Overhead cost.** The website's illustrative comparison: "AI handles intake, routing, scheduling, checklists and tracking, so you pay for design time, not overhead." [VERIFIED copy; the comparison is marked "Illustrative" on the site]

---

## 2. Complete Feature Inventory

Features are grouped by who uses them. **Only Part A is customer-facing.** Parts B to D are internal operations: they make the customer promises possible but are not features the customer uses.

### Part A: Customer-facing features (jewelry businesses)

| # | Feature | Status | What it is and how it works | Benefit to the customer |
| --- | --- | --- | --- | --- |
| A1 | **Sign-up and sign-in** | LIVE | Email account with password, two-step sign-in and session management (provided by Clerk). A welcome step records the business and asks "How did you hear about us?" (a required question). | Secure access; quick start. |
| A2 | **Client home / inbox** | LIVE | One screen showing what needs the client now (a quote to pay, a design to review, files ready) and recent activity. | Nothing gets missed; no hunting through email. |
| A3 | **New order: choose a service** | LIVE | Two equal choices, **CAD design** or **Renders**. Below them: **start from a past order** (copies a previous brief into a new one, ready to send) and **drafts** to finish. | Fast repeat ordering; nothing lost. |
| A4 | **Brief form (the order brief)** | LIVE | Fields cover: product type; reference pictures with **numbered pins** pointing at details; size (ring size, or inner diameter or circumference; bangle/bracelet inner size or length); metal and colour (yellow, white, rose, two-tone, tri-colour, platinum, silver) and karat; centre stone (shape, size, certified or not); accent stones; setting (4- or 6-prong, bezel, halo, pavé, channel, tension, flush); who supplies the stones; finish; purpose (casting, direct print or render only); special instructions; a job name. One page on desktop, stepped on a phone. **Autosaves** as a draft. A live **"Brief quality"** panel grades how buildable the brief is as you type, not just whether every box is filled. | A clear brief in about two minutes from a phone; fewer back-and-forth questions; fewer wrong first versions. |
| A5 | **Minimum brief rules** | LIVE | A brief needs: product type, at least one reference image, size, metal, and centre stone yes/no (with shape and size if yes). | Prevents briefs that can't be built. |
| A6 | **Quote and payment** | LIVE (card checkout BUILT – NEEDS ACTIVATION) | The team sends a fixed price. The pay page shows the price, what it includes and the 6-hour promise. Card checkout runs through Razorpay; Wise, bank transfer and PayPal are handled by message. | Price known before paying; no surprises. |
| A7 | **Order page with progress tracker** | LIVE | A stepper (**Brief → Quote → Design → Review → Delivered**) and a "next step" card (for example "Files ready – Download"). Tiles for **Chat**, **Files**, **Revisions** ("0 of 2 used") and **Timeline**. Collapsible **Brief** and **Payment** sections. | One place for everything about an order. |
| A8 | **Live first-look countdown** | LIVE | Once the order is paid **and** confirmed, the client sees the due time for the first look. | Visible commitment; no guessing. |
| A9 | **Review and approve the design** | LIVE | The client sees the current version: render views, technical sheet, diamond details and gold weight. They can **Approve** or **Ask for changes**, with a note, within the included rounds. | Approval in one click; changes tracked. |
| A10 | **Revisions** | LIVE | **Two revision rounds included within 14 days of the first look.** After that, changes become a new order. QC send-backs don't count against the client. | Clear, fair change policy. |
| A11 | **Chat with "Your team"** | LIVE | A real-time conversation per order with the studio team. Supports photos, files and **voice messages**, plus **marking up a photo** (draw on it) and sending it. To the client, every staff member appears as **"Your team"**. Read status is tracked. | Fast answers; show exactly what to change. |
| A12 | **Talk to us live** | LIVE | A call button and WhatsApp click-to-chat in the portal and on the website. A live indicator shows "Live support online/offline" with today's hours in ET. | A real person, no ticket queue. |
| A13 | **Files library** | LIVE | All orders' files in one place. After approval the client gets the release set (3DM, STL, summary sheet and documents). For orders in progress, it shows what will unlock and when. | No lost attachments. |
| A14 | **Deliverables per CAD order** | LIVE | 3DM and STL files; one render image with four views; one technical sheet (four views with measurements, diamond details and gold weight, with a weights panel added automatically, see C6); a summary sheet PDF; a QC certificate / spec sheet PDF; a weight sheet PDF; a branded 3D preview link. | Everything a caster and a sales counter need. |
| A15 | **Summary sheet (PDF)** | LIVE | Made by the platform, not uploaded. One PDF with the order, both images, stones, gold weight per metal, time taken and a timeline. | A ready-to-file record of the piece. |
| A16 | **QC certificate / spec sheet (PDF)** | LIVE | Generated when QC passes a version. It lists the measured specification (minimum wall, prong, stone seats, ring size, inner diameter, mesh tolerance, open edges = 0), any client waivers, both QC stages line by line with their times, and **SHA-256 fingerprints of the delivered files**. | Proof the file was checked; the basis of the spec guarantee. |
| A17 | **Weight sheet (PDF)** | LIVE | Estimated grams in **10K, 14K, 18K, platinum (Pt950) and silver (Ag925)** from the model volume. No metal cost. | Quote the customer and plan metal before casting. |
| A18 | **Branded 3D preview link** | LIVE | The client creates a private link to send **their own customer**. It shows a rotatable 3D model and the renders, with **the jeweler's logo and name** and **nothing of The CAD Pillar**: no prices, no order details. Links expire after 30 days by default; the client can extend (+30 days) or turn a link off and sees the view count. Expired or revoked links read "not available". | Sell the piece before it's cast, under your own brand. |
| A19 | **Spec guarantee claims** | LIVE | From the order, "A file broke its spec sheet? Open a claim" (within 30 days). The client uploads the file they cast from, photos and casting details. The system matches the file against the fingerprints of what was delivered; the team re-measures the archived file and shares the numbers. Possible outcomes: **Upheld** (free fix, CAD fee credited) or **Not covered** (for example, an edited file). | A written, checkable guarantee. |
| A20 | **On-time guarantee (late credit)** | LIVE (decision manual; automatic credit OFF) | If a standard piece misses its first-look time, a credit for the full amount is created (once) and the order is still finished. Today an admin decides each credit: apply to the next order, refund, partial or reject (with a reason). Automatic credit is OFF until switched on. | Risk-free speed promise. |
| A21 | **Wallet** | LIVE (read-only) | Balance, transactions, invoices view. Top-ups are OFF. | See credits in one place. |
| A22 | **Notifications** | Email: BUILT – NEEDS ACTIVATION. Push: BUILT – NEEDS ACTIVATION. | Emails are sent on every real step: welcome, order received, quote ready (plus a 24 h reminder), payment received, order confirmed (with due time in ET), first look ready, revision received, revised design ready, approval, files delivered, feedback request after 72 h, problem received, refund, cancellation, delay notice, credit decision, new team message (at most one per 30 min). Until the owner switches email to live, all emails go to a test inbox. Browser/phone push notifications need keys set by the owner. | Kept informed without logging in. |
| A23 | **Notification and time-zone settings** | LIVE | The client chooses their time zone (or follows the device) and turns reminder and message emails on or off. Times show in their zone. | Times that make sense to them. |
| A24 | **Installable app (PWA)** | LIVE | The portal installs on a phone or desktop like an app, with an offline page. | One tap from the home screen. |
| A25 | **Command search** | LIVE | "Search or jump to…" (⌘K) in the portal. | Quick navigation. |
| A26 | **Orders placed for the client** | LIVE | The team can create an order on a client's behalf from a WhatsApp, email or phone request (at least one screenshot required). It appears in the client's portal. | Order however you like; it still lands in one tracked place. |
| A27 | **Public results page** | OFF (flag `public_stats`) | A page of real numbers, computed weekly from recorded data: first looks on time, approved first time, late credits, upheld claims. Hidden until 30 days of real data. | Future proof point; **do not quote numbers from it yet.** |
| A28 | **Designer recruitment page** | LIVE | "Apply as a CAD Designer": a screening form for designers. | Talent pipeline (a secondary audience). |

### Part B: Designer features (INTERNAL, staff)

| Feature | Status | Summary |
| --- | --- | --- |
| Designer dashboard and open jobs | LIVE | Jobs grouped by state; clock per job; due-to-QC time. |
| Start, pause and resume with recorded times | LIVE | Every action is time-stamped; active time = start → submission minus pauses. |
| Direct file upload | LIVE | 3DM, STL, render image and technical image. Files go straight to storage (up to 50 MB), then are checked and cleaned. Rhino blocks are exploded automatically, files are renamed to a standard pattern and metadata is stripped. |
| Gold weight and diamonds card | LIVE | The calculators built into the job; the saved weights are **added as a panel under the technical image automatically**. |
| Calculators (`/tools`) | LIVE | Gold casting weight per metal (22K, 18K, 14K, 10K, 9K, silver, platinum; plain and with post) and diamond weight (side/melee size chart for 10 shapes, plus a centre-stone chart; totals in ct and grams). |
| Designer QC sheet (9 lines) | LIVE | Pass/Fail per line with a finding and a remark. |
| Final review before QC | LIVE | A full-screen page: the client's references (zoomable, with pins) and the brief beside the 3D STL, render and technical sheet. The designer ticks the check there, and **Send to QC** unlocks only when every line passes. |
| Materials | LIVE | Instructions and charts shared by the pod lead. |
| Earnings and payout details | LIVE (internal pay) | Not for marketing. |

### Part C: Pod lead / QC manager features (INTERNAL)

| Feature | Status | Summary |
| --- | --- | --- |
| QC queue and QC review | LIVE | The manager checks 5 lines (Pass/Fail with a finding and remark) and records measurements. Approve, or send back; failed lines become the revision note automatically. |
| Team board | LIVE | Live workload per designer; assign, move between designers (with a reason), escalate to admins. |
| Performance | LIVE | Output, working time, turnaround, on-time rate, first-pass QC rate, QC returns and client changes by period, downloadable as Excel, CSV or PDF. |
| Alerts | LIVE | A designer is alerted 1 hour before their QC due time; the designer and pod lead are alerted when overdue. |
| Create order for a client | LIVE | Orders placed on a client's behalf. |

### Part D: Admin features (INTERNAL)

Queue, all orders, quoting and confirming, marking payments, late-credit decisions, payouts export, clients and account managers, access and roles, pods, designer applications, contact leads, settings (feature switches, densities, minimums), and email previews. All LIVE.

### Part E: Quality and trust infrastructure (behind the scenes, supports customer promises)

| Capability | Status | What it means in plain words |
| --- | --- | --- |
| **Two-stage QC** | LIVE | Every version passes a 9-line designer check, then a 5-line QC manager check by a different person (the system blocks self-review). |
| **Double anonymity** | LIVE | Designers never see the client's identity, prices or other jobs; clients never see staff names. Enforced in the database, not just hidden on screen. |
| **File fingerprints and archive** | LIVE | Every delivered file is fingerprinted and archived read-only, so a claim can be checked against exactly what was delivered. |
| **Audit trail** | LIVE | Every tick, decision, credit and payout is recorded, and the record can't be edited. |
| **Measured specs** | LIVE | Minimum wall and prong (default 0.8 mm, admin-editable), stone seats, ring size, mesh tolerance, open edges, all recorded by QC per version. |

---

## 3. Customer Experience: step-by-step journey

This is the actual flow in the system, from the client's point of view. [VERIFIED unless marked]

1. **Discover.**
   - The client lands on the website (home, how it works, pricing, quality, guarantee, FAQ, the jewelry CAD landing page).
   - Calls to action: **Start your first design** (sign-up), **WhatsApp us**, **Talk to us live**.
   - The website records campaign tags (UTM) in its own first-party cookie; there is no third-party analytics.
2. **Register.**
   - Create an account, then a welcome step records the business and the required "How did you hear about us?" answer, offers notifications and offers to install the app.
   - Each client gets a **client code**; order references look like `MJ1-RN-C-10`.
3. **Place an order.**
   - New order → **CAD design** or **Renders** (or start from a past order, or finish a draft).
   - Fill the brief with reference photos and pins, size, metal, stones, setting and notes. A live brief-quality panel guides the client.
   - Submit. An "Order received" email is sent once email is live.
   - Alternatively, the client sends the request by WhatsApp, email or phone and the team places the order in their portal.
4. **Quote.**
   - The team sets a category and a fixed price (and, for complex pieces, a firm deadline in hours).
   - The client gets "Quote ready", with a reminder after 24 h if unpaid. Website copy says the price comes "within the hour". [OWNER CLAIM: the system does not time quotes]
5. **Pay.**
   - Card checkout (Razorpay), or Wise, bank transfer or PayPal by message, after which the team marks the order paid.
6. **Confirm and start the clock.**
   - The team confirms the brief is complete. The 6-hour first-look clock for standard pieces starts when the order is **both paid and confirmed**, whichever happens last.
   - The client sees the due time and gets "Order confirmed (due time in ET)".
7. **Production (behind the scenes).**
   - AI-assisted modelling, as stated by the owner [OWNER CLAIM].
   - The designer builds the files, saves the gold weight and diamonds, and runs the designer check on the full-screen final review.
   - The QC manager runs the second check and records the measurements. A failure goes back to the designer with the failed lines as notes; this never counts as a client revision.
8. **First look.**
   - The client gets "First look ready" and opens the review: render views, technical sheet with the weights panel, diamond details and gold weight.
   - On time = the first look was shared before the deadline.
9. **Approve or ask for changes.**
   - Approve, or ask for changes with a note. Two rounds are included within 14 days.
   - Each new version triggers "Revised design ready", with a reminder if a design waits 48 h.
10. **Delivery.**
    - On approval: 3DM, STL, summary sheet, QC certificate / spec sheet and weight sheet unlock in Files.
    - The client gets "Files delivered" and creates a **branded 3D preview link** for their customer if wanted.
11. **After delivery.**
    - "Feedback request" email after 72 h.
    - Spec claims open for 30 days from the order page.
    - Late-credit decisions and refunds are communicated by email and shown in the wallet.
12. **Repeat order.**
    - From New order → "start from a past order": the old brief is copied, ready to send.
    - Regular clients can be offered a retainer (sold manually).

---

## 4. Unique Selling Points

These are points the system or the owner's confirmed statements actually support. Comparisons to "traditional alternatives" use only the website's own illustrative framing; no competitor is named, and "first" or "only" claims are banned (DECISIONS §1).

| USP | What backs it | Strength |
| --- | --- | --- |
| **First look within 6 hours of order confirmation, or it's free** (standard pieces) | A countdown on every order; misses create a full-value credit (admin-decided today); the order is still finished. | Strong: written, tracked, and backed by money. |
| **Castable files, guaranteed to spec** | A signed spec sheet with measured values, fingerprinted delivery, a 30-day claim flow, a free fix and the CAD fee refunded if a file breaks its own spec. | Strong and rare-sounding; keep the exact exclusions. |
| **Two experts / two QC stages on every file** | A 9-line designer check plus a 5-line independent QC manager check; the system blocks self-approval; each line is time-stamped. | Strong, verifiable. |
| **Your designs stay yours** | White-label, NDA by default, client owns the IP on payment, double anonymity enforced in the database. | Strong. Note: the phrase "double-blind" is banned website copy. |
| **Sell before you cast: branded 3D preview link** | A rotatable 3D model and renders under the jeweler's own logo, with expiry, extension, revocation and a view count. | Strong visual demo. |
| **Everything in one portal** | Brief, quote, pay, chat (photos, voice, markup), review, files, documents and claims on one order page. | Strong for "no chasing". |
| **A real person, live** | Call and WhatsApp; a live online/offline indicator with hours in ET. | Medium: hours are limited (3 PM–midnight IST). |
| **AI-native speed with expert checking** | Owner positioning: AI models each piece; senior designers check and finish; a master craftsman signs off. | [OWNER CLAIM]: the AI modelling process itself is not visible in the code reviewed. |
| **Production-ready extras included** | Weight sheet (5 alloys), summary sheet, technical sheet with gold and diamond panel. | Medium–strong. |
| **Fixed price before you pay; from $35** | Every order is quoted before payment. | Strong for price-sensitive buyers. Reconcile the price display (§11). |
| **Order the way you like** | Portal, or WhatsApp, email or phone with the team placing the order. | Medium. |

---

## 5. Brand & Visual Identity

### 5.1 Name and marks

| Item | Fact | File |
| --- | --- | --- |
| Brand name | **The CAD Pillar**. Short name: **CAD Pillar**. Abbreviation: **TCP**. | `app/manifest.ts`, `components/wordmark.tsx` |
| **Logo mark** | **Three vertical pillars (rounded bars), black #0A0A0A on white.** Owner decision, 2 Nov 2026. Proportions on a 78-unit square: bars 12 wide, gaps 21, full height, corner radius 2.4. The mark takes the text colour, so it turns white on a black band. | Vector: `components/brand/pillar-mark.tsx` |
| **Logo lock-up (wordmark)** | The pillar mark followed by "The CAD Pillar" in **Geist, weight 600**, tight tracking (−0.02em), never wrapping, with the mark sized to the text. Used in the website header and footer, the portal sidebar and header, sign-in pages and the offline page. | `components/wordmark.tsx`, `components/marketing/marketing-header.tsx`, `components/shell/sidebar.tsx` |
| **App icon / favicon** | **Black pillars on a white square.** Included: 512 and 192 px app icons, a padded "maskable" version for phone launchers, a 180 px Apple touch icon, and a pixel-sharp 32 px favicon. | `public/icons/pillar-512.png`, `pillar-192.png`, `pillar-maskable-512.png`, `pillar-apple-touch-180.png`, `public/pillar-favicon-32.png`, `public/pillar-favicon.svg` |
| Retired | The earlier blue-on-black icon and the "TCP" letter badge in the portal sidebar were **replaced on 2 Nov 2026**. Do not use them. | — |
| Independence rule | The brand is fully independent of "The CAD Co." No data, portfolio or branding from it may appear anywhere. | DECISIONS §1, §14 |

**The brand is monochrome.** The logo, website and portal are black on white, and colour appears only to signal status (§5.2). [UNKNOWN] There is no exported standalone SVG or PDF logo file and no brand-guidelines document beyond the design tokens. The vector component above is the master drawing to export from.

### 5.2 Colour system (from `app/globals.css`, "premium black on white, quiet utility")

| Token | Value | Use |
| --- | --- | --- |
| Foreground / primary | **#0A0A0A** | Text, primary buttons (black), one primary action per view |
| Background | **#FFFFFF** | Pages and cards |
| Muted fill | #F5F5F5 | Fills, hover |
| Subtle surface | #FAFAFA | Alternate sections, app background |
| Secondary text | #525252 | Captions, secondary copy (7.8:1 contrast) |
| Border | #E5E5E5 (strong #D4D4D4) | Hairlines, cards |
| Info (in progress) | Blue `hsl(221 72% 38%)` text on `hsl(221 85% 96.5%)` | Status pills "In design" |
| Success | Green `hsl(142 64% 24%)` on `hsl(141 60% 95%)` | "Delivered", "Pass", "Upheld", "Live support online" dot |
| Warning | Amber `hsl(26 90% 30%)` on `hsl(46 96% 92%)` | SLA risk only (under an hour left) |
| Danger | Red `hsl(0 72% 36%)` on `hsl(0 78% 96.5%)` | Errors, failed checks, destructive actions |
| Attention | Black pill, white text | "Ready for you": the client is holding it up |
| WhatsApp accent | #128C7E | WhatsApp buttons only |

**Rule from the system:** colour carries meaning only. Status is never shown by colour alone; every pill carries a label and a dot. Contrast floors are checked by automated tests: 7:1 for body text, 4.5:1 on tints, 3:1 for control edges.

### 5.3 Typography

- **Geist Sans** for everything, loaded locally. Headings use weight 600 with tight negative tracking.
- **Geist Mono** only for reference codes and IDs, for example `MJ1-RN-C-10`.
- **Type scale:** 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 56 / 72 px. Line height 1.1 for display text and 1.5 for body.
- **Marketing headings:**
  - H1: 38 → 52 → 56 px, weight 600, −0.035em, line height 1.08.
  - H2: 32 → 40 px, −0.03em.
  - Lead text: 18 px, line height 1.55, grey.
- **Eyebrows:** small uppercase labels (12 px, tracking 0.06em). This is the only place uppercase is allowed.
- **Older mockups** (`docs/design/screens/`) used Instrument Serif for display. That choice is **superseded**: the current brand is Geist only.
- **Logo rule:** the pillar mark always sits to the left of the name, vertically centred, at about the text's height.

### 5.4 Shape, depth and motion

- **Corner radius:** 4 / 6 / 8 / 10 / 14 px, and fully round for pills.
- **Shadows:** a near-invisible lift (`0 1px 2px rgba(10,10,10,.04)`) and a soft card shadow for featured cards.
- **Spacing:** on a 4/8 px grid. Section padding is 56–72 px on phones and 96–128 px on desktop. Content is max 1200 px wide.
- **Motion:** quiet, 100–250 ms, and it respects "reduce motion". The homepage checklist ticks as it scrolls into view.

### 5.5 UI patterns and reusable visual elements (all real components)

- **Status pill:** a rounded tint with a dot and label ("In design", "Ready for you", "Delivered", "Pass", "Fail", "Upheld", "Not covered").
- **Order stepper:** Brief → Quote → Design → Review → Delivered.
- **Live order card (homepage hero):** order code, "Halo engagement ring", "First look in 5h 42m 00s" countdown, a designer checklist ticking line by line, and "Then the QC manager checks it again". File: `components/marketing/home/live-order-card.tsx`.
- **Proof bar:** large numbers (50+ · 99% · 2 · 6h) with short labels.
- **"How it works" mini-screens:** a brief card, a "Ready for you" first-look card with Approve / Ask for changes, and a "Your files" list (ring_v2.3dm, ring_v2.stl, Spec sheet.pdf "Signed", Weight sheet.pdf "5 alloys").
- **Cast pipeline diagram:** "Stage 1 · Designer check" → "then" → "Stage 2 · QC manager check", with ticking lines. File: `components/marketing/home/cast-pipeline.tsx`.
- **Cost stack (illustrative):** "A traditional studio" (design time + project manager + scheduling and chasing + status emails and calls + office and idle time) beside "The CAD Pillar" (expert design check + independent QC sign-off). Labelled "Illustrative. Bars show what you pay for, not amounts."
- **Support status chip:** a green dot, "Live support online · 4:30 AM – 1:30 PM ET".
- **WhatsApp floating button** (green circle) and the WhatsApp mark.
- **Tiles:** Chat, Files, Revisions, Timeline. **Cards:** title row plus body. **Checklist rows:** Pass/Fail with a time.
- **Pillar mark:** usable alone as an icon, or with the name as the lock-up.
- **Interactive 3D viewer:** a gold-coloured metal model on a light grey panel, drag to turn.
- **Zoomable reference viewer** with numbered pins.
- **Generated documents:** summary sheet, QC certificate and weight sheet (PDFs), and the technical image with its gold/diamond panel (white panel, black tables, "GOLD WEIGHT" and "DIAMOND DETAILS" headings).
- **Live style guide:** `/design-preview` in the app (route `app/design-preview/`), which shows tokens and components.

### 5.6 Voice (from `docs/marketing/LANDING-COPY.md`)

- "Plain, confident, trade-to-trade. Short sentences, real numbers, no hype."
- Never show fake stats, client logos or testimonials.
- Never mention The CAD Co.
- Banned phrase: "double-blind".
- No "first" or "only".

---

## 6. Business Promises & Value Propositions

| Promise | Exact rule | Status | Exclusions and conditions |
| --- | --- | --- | --- |
| **First look in 6 hours, or it's free** | Standard pieces (internal categories A–F): first look shared within 6 hours of the order being **both paid and confirmed**. A miss creates a credit of the full amount paid, once, and the order is still finished. | LIVE (credit decided by admin; automatic credit OFF) | Complex/sculpted pieces get a **firm deadline set with the quote**, not 6 h; a complex miss is flagged, with no credit. There is no pause for "waiting on client"; the clock simply starts at confirmation. |
| **Castable files, guaranteed to spec** | Every delivery has a signed spec sheet. If a delivered file breaks its own spec sheet, the studio fixes it free and refunds (credits) the CAD fee. | LIVE | Not covered: casting failures where the archived file meets spec; edited files (fingerprint mismatch); client waivers recorded on the spec sheet; claims after **30 days**. Liability is capped at the CAD fee, never metal or stones. More than 2 claims a quarter from one client go to manual review. |
| **Your work stays yours** | White-label, NDA by default, client owns the IP on payment, designers never see the client's customer. | LIVE (enforced in data access) | None. |
| **Two revision rounds** | Included within 14 days of the first look. | LIVE | Further changes are a new order. QC send-backs don't count. |
| **Fixed price before you pay** | Every order is quoted and paid only on acceptance. | LIVE | "Within the hour" is a stated target, not system-enforced. |
| **Every file checked twice** | Two-stage QC: designer, then QC manager. | LIVE | None. |
| **Bulk orders included** in the 6-hour first look | Owner-confirmed statement. | [OWNER CLAIM] | Capacity is managed internally; the system tracks each order separately. |
| **99% of first looks right first time** | Owner-confirmed statement. | [OWNER CLAIM] | Not yet measured publicly. The results page is OFF. |
| **50+ senior CAD designers, 10+ years each** | Owner-confirmed statement. | [OWNER CLAIM] | — |
| **Team cards (anonymised)** | Senior CAD · 14 yrs · Bridal and halos; Senior CAD · 12 yrs · Signets and men's; Senior CAD · 11 yrs · Pavé and high jewelry; Master QC · 20+ yrs at the bench · Casting and finishing. | [OWNER CLAIM] (marked confirmed in `content/claims.ts`) | No names or photos, by policy. |
| **Live support** | Calls and WhatsApp every day, 3 PM – midnight India time (5:30 AM – 2:30 PM ET summer / 4:30 AM – 1:30 PM ET winter). The portal is open 24/7. | LIVE | Outside these hours, chat and email only. |

**Trust signals the system can show:**
- the signed spec sheet / QC certificate with measured values and per-line times;
- file fingerprints;
- the order timeline;
- visible deadlines;
- written guarantees (website `/guarantee`);
- terms and privacy pages;
- secure card checkout (Razorpay);
- two-step sign-in.

---

## 7. Features Worth Marketing

Ranked by customer value and how well they can be shown visually. Screens listed are real; screenshot files are in the `design-qa` branch (see §9.3).

| Rank | Feature | Why customers care | Real screens or workflows to show |
| --- | --- | --- | --- |
| 1 | **6-hour first look with a live countdown** | Same-day CAD to show a waiting customer; the guarantee removes risk. | Homepage live order card ("First look in 5h 42m"); the client order page with its due time; the pay page's guarantee line. |
| 2 | **Two-stage QC, signed spec sheet** | Fewer failed castings and remakes; proof of quality. | QC certificate PDF; the designer final review checklist; the QC review page (internal, but shows rigour); homepage cast-pipeline diagram. |
| 3 | **Branded 3D preview link** | Close sales before casting, under their own brand. | Client order page "Share a 3D preview" card; the public preview page `/p/[token]` (jeweler logo, rotatable model, renders). |
| 4 | **One order page for everything** | No chasing, no lost emails. | Client order page (stepper, Files ready, Chat, Files, Revisions, Timeline tiles). |
| 5 | **Chat with photo markup and voice notes; live call/WhatsApp** | Explain changes exactly; reach a real person. | Messages / order chat screens; support status chip; WhatsApp button. |
| 6 | **Spec guarantee claim flow** | A guarantee that is checkable, not a slogan. | Order page "Spec guarantee" card (Upheld / Not covered examples); claim page. |
| 7 | **Production documents included** | Saves the jeweler admin time: weight per alloy, summary sheet, technical sheet with gold/diamond panel. | Weight sheet PDF ("5 alloys"); summary sheet PDF; technical image with the panel. |
| 8 | **Fast brief from a phone** | About two minutes; photos with pins; the brief-quality guide. | New order screen; brief form with pins; "Brief quality" panel. |
| 9 | **Confidentiality / white-label** | Protects the jeweler's customer relationships and IP. | Copy-led; supported by "Your team" naming in chat and the preview link showing only the jeweler's brand. |
| 10 | **Repeat orders from a past order** | Reorder variations quickly. | New order "start from a past order". |

**Worth showing as "behind the scenes" proof (internal, never presented as customer features):**
- the designer's full-screen final review (references beside the 3D model, checklist unlocking Send to QC);
- built-in gold and diamond calculators;
- pod performance dashboards.

---

## 8. Customer Pain Points & Solutions

The pain points are **[ASSUMPTION]**: inferred from the business's own copy ("Fewer remakes. No chasing. Your designs stay yours.") and from the problems each feature solves. The solutions are **[VERIFIED]**.

| Customer frustration | How The CAD Pillar addresses it |
| --- | --- |
| CAD takes days; the customer walks out | 6-hour first look for standard pieces, guaranteed or free; a firm deadline for complex pieces stated before payment. |
| Files that don't cast (thin walls, open edges, bad mesh) | Purpose captured in the brief (casting, direct print, render); minimum wall and prong checked; open edges must be 0; mesh tolerance 0.005; two-stage QC; signed spec sheet; free fix plus refund if the file breaks its own spec. |
| Remakes because the designer misread the brief | Structured brief with a quality guide; reference pins; designer final review side-by-side with the references; independent QC check; two included revision rounds. |
| Chasing designers for status | Order stepper, countdown, timeline, notifications, live chat, live support hours. |
| Unclear or changing prices | Fixed quote before payment; from $35; revisions included; no retainer required. |
| Worry about designs or customers being exposed | White-label, NDA by default, client owns the IP on payment, designers never see the client, preview link shows only the jeweler's brand. |
| Showing a customer a design before casting | Branded 3D preview link with renders, expiry and view count. |
| Estimating metal weight for pricing | Weight sheet in 5 alloys; gold weight per metal on the technical image and summary sheet. |
| Messy communication across WhatsApp, email and phone | Order anywhere; the team logs it into the portal; one chat per order with files, voice and markup. |
| No recourse when a file is wrong | Documented claim flow, fingerprint check, measured re-check, credit. |
| Time-zone gaps with offshore studios | Live hours mapped to ET; the portal is 24/7; times show in the client's zone. |

---

## 9. Platform Screens & Visual References

### 9.1 Public website (marketing). Code under `app/(marketing)/`

| Page | Route | File | Content highlights |
| --- | --- | --- | --- |
| Home | `/` | `app/(marketing)/page.tsx` + `components/marketing/home/*` | Hero "Factory-ready jewelry CAD, in hours.", live order card, proof bar, how it works, quality pipeline, "Why it is fast, and costs less" cost stack, "Why jewelers switch" grid, work gallery (empty until real work is cleared), pricing ("From $35 a design."), team strip, FAQ, final CTA ("Send one design. See the difference in 6 hours."), sticky mobile CTA |
| How it works | `/how-it-works` | `app/(marketing)/how-it-works/page.tsx` | "From brief to castable file." 5 steps |
| Pricing | `/pricing` | `app/(marketing)/pricing/page.tsx` | From $35; retainers; WhatsApp CTA |
| Quality | `/quality` | `app/(marketing)/quality/page.tsx` | Two-stage QC with all 14 checks listed |
| Guarantee | `/guarantee` | `app/(marketing)/guarantee/page.tsx` | "Two promises, in writing." Claim steps and exclusions |
| FAQ | `/faq` | `app/(marketing)/faq/page.tsx` | "Questions jewelers ask us." |
| Jewelry CAD landing | `/jewelry-cad` | `app/(marketing)/jewelry-cad/page.tsx` | Campaign landing with a lead form; "Jewelry CAD, first look in 6 hours, or it's free" |
| Results | `/results` | `app/(marketing)/results/page.tsx` | OFF until real data |
| Contact | `/contact` | `app/(marketing)/contact/page.tsx` | Form for businesses and designers |
| Apply as designer | `/apply-designer` | `app/(marketing)/apply-designer/page.tsx` | Recruitment form |
| Terms / Privacy | `/terms`, `/privacy` | `app/(marketing)/terms`, `/privacy` | Legal pages. Prices "from $35 a design"; current deliverables listed |
| Branded preview (public) | `/p/[token]` | `app/p/[token]/page.tsx` | The jeweler's logo and name, 3D model, renders |
| Sign in / Sign up | `/sign-in`, `/sign-up` | `app/(auth)/…` | Clerk screens |

Shared marketing components: `components/marketing/blocks.tsx`, `components/marketing/content.ts` (copy data), `content/claims.ts` (every public number and claim).

### 9.2 Client portal (customer-facing). Code under `app/(app)/`

| Screen | Route | File |
| --- | --- | --- |
| Home / inbox | `/home` | `app/(app)/home/page.tsx` |
| Welcome | `/welcome` | `app/(app)/welcome/page.tsx` |
| Orders list | `/orders` | `app/(app)/orders/(list)/page.tsx`, `app/(app)/orders/ClientOrders.tsx` |
| New order (choose service, past orders, drafts) | `/orders/new` | `app/(app)/orders/new/page.tsx` |
| Brief form | `/orders/[id]/brief` | `app/(app)/orders/[id]/brief/BriefWizard.tsx` |
| Brief review / sent | `/orders/[id]/brief/review`, `/orders/[id]/sent` | `app/(app)/orders/[id]/brief/review/`, `app/(app)/orders/[id]/sent/` |
| Order page (hub) | `/orders/[id]` | `app/(app)/orders/[id]/page.tsx`, `app/(app)/orders/ClientOrderView.tsx` |
| Pay | `/orders/[id]/pay` | `app/(app)/orders/[id]/pay/page.tsx` |
| Review design (approve / changes) | `/orders/[id]/review` | `app/(app)/orders/[id]/review/page.tsx` |
| Spec claim | `/orders/[id]/claim` | `app/(app)/orders/[id]/claim/page.tsx` |
| Messages / chat | `/messages`, `/messages/[orderId]` | `app/(app)/messages/`, `app/(app)/orders/chat/ChatThread.tsx` |
| Files | `/files` | `app/(app)/files/page.tsx` |
| Wallet / transactions / invoices | `/wallet`, `/wallet/transactions`, `/wallet/invoices` | `app/(app)/wallet/` |
| Account / security | `/account`, `/account/security` | `app/(app)/account/` |
| Documents (downloads) | `/api/orders/[id]/certificate`, `/summary`, `/weight-sheet` | PDF makers in `lib/pdf/` (`certificate.tsx`, `summarySheet.tsx`, `weightSheet.tsx`) |
| Portal shell (sidebar, search, support chip) | — | `components/shell/app-shell.tsx`, `sidebar.tsx`, `command-palette.tsx`, `mobile-bottom-nav.tsx` |

### 9.3 Screenshot library (real renders of every page)

- **Location:** the git branch `design-qa`, folder `after/`. Generated automatically on 2 Nov 2026 after the latest release.
- **Naming:** `after/<persona>/<route with "/" as "_">@<width>.png`. Widths are **1440** (desktop), **768** (tablet) and **390** (phone). An accessibility report sits in each persona folder (`axe.md`).
- **Logo:** screenshots taken after 2 Nov 2026 show the black pillar logo. Earlier ones show the retired "TCP" badge and a text-only header.
- **Test data:** screenshots use test accounts such as "Meera Jewels" and "E2E halo ring". **Do not present these as real customers or real work.** Use them for layout reference only.

| Persona folder | Pages captured (selection) |
| --- | --- |
| `after/marketing/` | home, how-it-works, pricing, quality, guarantee, faq, jewelry-cad, contact, apply-designer, results, terms, privacy, sign-in, sign-up, a branded preview page (`p_…`) |
| `after/client/` | home, orders, orders_new, an order page, its files and timeline views, the claim page, messages and a conversation, files, wallet (+ invoices, transactions), account, account_security |
| `after/client2/` | a brief and its review, an order's pay page, wallet |
| `after/designer/` | home, work, a job, its checklist, its **final review**, tools (calculators), materials, earnings, messages |
| `after/podLead/` | qc queue, a QC review, team board (`pod_board`), performance, materials, tools, qc_orders, earnings |
| `after/admin/` | admin queue, orders, an order, new order, clients, credits, payouts, billing, settings, access, pods, applications, leads, users |
| `after/preview/` | the style guide `/design-preview` (client, portal and marketing frames) |

**Best screenshots for marketing use**, after replacing the test data:
- `after/marketing/home@1440.png`, `@390.png` (hero, proof bar, how it works);
- `after/client/orders_<id>@1440.png` (order hub with Files ready, tiles, 3D preview card, spec guarantee card);
- `after/client/orders_new@1440.png`;
- `after/client2/orders_<id>_brief@1440.png`;
- `after/marketing/p_<token>@1440.png` (branded preview);
- `after/designer/work_<id>_review@1440.png` (behind-the-scenes final review).

### 9.4 Design mockups (older, partly superseded)

`docs/design/screens/` holds 92 static HTML mockups (1440×900 desktop, 390×844 mobile) from the original design canvas. They cover client (C1–C9, N0–N7, W1–W3, S1–S3), designer (D1–D6), pod lead (P1–P6) and admin (A1–A10) screens. **The October 2026 redesign supersedes them** where they differ (for example, the mockups use Instrument Serif headings and placeholder prices). Index: `docs/design/README.md`. Before/after record of the redesign: `docs/redesign/BEFORE-AFTER.md`.

---

## 10. Marketing Knowledge Base

### 10.1 Glossary

| Term | Meaning (plain language) |
| --- | --- |
| **CAD** | Computer-aided design: the 3D model of a jewelry piece used for printing and casting. |
| **3DM** | Rhino's native 3D file (editable model). |
| **STL** | Mesh file used by 3D printers and casters. Delivered with mesh tolerance 0.005. |
| **Render** | Photo-like image of the design. Delivered as one image with four standard views. |
| **Technical sheet** | One image with four views, measurements, diamond details and gold weight, plus an automatic gold/diamond panel underneath. |
| **First look** | The first version shared with the client for review (renders/files for approval). The 6-hour promise measures this. |
| **Brief** | The client's order description: references, size, metal, stones, setting, notes. |
| **Quote** | The fixed price (and for complex pieces, the deadline) set before payment. |
| **Confirmed** | The team has checked the brief is complete; with payment, this starts the clock. |
| **Standard / Complex / Sculpted** | Internal difficulty bands. Standard pieces get the 6-hour promise; complex and sculpted pieces get a quoted deadline. |
| **Revision round** | A client-requested change to a design version. Two are included within 14 days. |
| **Two-stage QC** | Designer check (9 lines), then an independent QC manager check (5 lines). |
| **Spec sheet / QC certificate** | Signed PDF of measured specs and both QC stages, with file fingerprints. |
| **Weight sheet** | Estimated metal weight in 10K, 14K, 18K, platinum and silver. |
| **Summary sheet** | Platform-made PDF summarising the order, images, stones, gold weight, time taken and timeline. |
| **Branded 3D preview link** | Private link for the jeweler's customer, with the jeweler's logo, a 3D model and renders. |
| **Spec claim** | Request to check a delivered file against its spec sheet within 30 days. |
| **Late credit** | Full-value credit when a standard first look misses 6 hours. |
| **White-label** | The jeweler presents the work under their own brand. |
| **"Your team"** | How the studio appears to clients in chat; staff names are never shown. |
| **Pod / pod lead / QC manager** | Internal team unit and its lead, who assigns work and runs the second QC stage. |
| **Account manager** | A team member named for a client (internal capability). |
| **Client code / order reference** | Anonymous codes such as `MJ1-RN-C-10`, shown in Geist Mono. |

### 10.2 Customer segments (from the website)

1. **Custom and bridal jewelers.** Need: show customers a CAD the same day; sell with the branded preview.
2. **Manufacturers and trade shops.** Need: overflow CAD capacity with castable files.
3. **Brands and wholesalers.** Need: collections at volume; a retainer and account manager.

**Secondary audience:** CAD designers (recruitment via `/apply-designer`).

**Markets:** USA (primary); UK, Australia, Canada.

**Not served:** consumers; dental (until a separate brand launches).

### 10.3 Products, options and file facts

- **Products:** ring, band, pendant, earrings, bracelet, bangle, necklace, brooch, other.
- **Metals and colours:** yellow, white, rose, two-tone, tri-colour, platinum, silver, with karat.
- **Stone shapes:** round, oval, cushion, princess, emerald, pear, marquise, radiant, asscher, heart, trillion, baguette, other.
- **Settings:** 4-prong, 6-prong, bezel, halo, pavé, channel, tension, flush.
- **Stones supplied by:** client, designer or platform, or no stones. Stones never pass through the platform; this only sets the seat tolerance.
- **Purpose:** casting, direct print, render only.
- **Finish:** high polish, matte, brushed, hammered, mixed.
- **Upload size:** designers upload files of up to 50 MB.
- **Rhino blocks** are accepted and exploded automatically.

### 10.4 Integrations and technology (customer-relevant only)

| Integration | Purpose | Status |
| --- | --- | --- |
| Clerk | Accounts, passwords, two-step sign-in | LIVE |
| Razorpay | Card checkout (cards/UPI/international) | BUILT – NEEDS ACTIVATION |
| Wise, bank transfer, PayPal | Manual payment, marked by the team | LIVE (manual); automatic matching PLANNED |
| WhatsApp | Click-to-chat buttons (website and portal) | LIVE |
| Phone | "Talk to us live" call button | LIVE |
| Email (Resend) | Order emails | BUILT – NEEDS ACTIVATION (test mode until the owner switches it on) |
| Web push / installable app | Phone and desktop notifications; home-screen app | App LIVE; push BUILT – NEEDS ACTIVATION |
| Rhino (3DM), STL | File formats delivered | LIVE |
| First-party attribution (UTM cookie, "How did you hear about us?") | Marketing source tracking without third-party analytics | LIVE |

[UNKNOWN] Production domain and site URL. The code reads it from configuration; the live address is not in the repository.

### 10.5 Operational capabilities (safe to describe at a high level)

- The portal is available 24/7; live human support runs daily at fixed hours.
- Orders can come from the portal, WhatsApp, email or phone and are all tracked in one system.
- Every order goes through two quality stages by different people.
- Delivered files are fingerprinted and archived read-only.
- Every decision is recorded in an audit trail.
- The team works in pods with leads, workload balancing and on-time alerts.

### 10.6 Public contact details (as shown on the website)

- Phone and WhatsApp: **+91 83692 88293**.
- Email: **simran@thecadpillar.com**.
- Support hours: every day, 3 PM – midnight India time (5:30 AM – 2:30 PM ET in US summer; 4:30 AM – 1:30 PM ET in US winter).

### 10.7 FAQ (current website answers, verbatim in substance)

- **Where are you based?** Studio in Mumbai, India. The portal is open 24/7 and the AI works around the clock; a person answers calls and WhatsApp 5:30 AM – 2:30 PM ET (4:30 AM – 1:30 PM in US winter), every day.
- **How fast is it really?** A first look within 6 hours of order confirmation, bulk orders included, or it's free. AI does the modelling; experts check every file; 99% of first looks are right first time. Complex pieces get a firm deadline with the price.
- **What files do I get?** 3DM and STL, renders, a signed spec sheet, a weight sheet and a 3D preview link. (Current deliverables also include the technical sheet and the summary sheet; see §11.)
- **Who owns the design?** You do, once paid. White-label, with an NDA by default.
- **Can you work from a photo or a sketch?** Yes. Add size, metal and stones and we'll price it within the hour.
- **What if I need changes?** Two revision rounds are included within 14 days.
- **Do you work with consumers?** No. Only jewelry businesses.
- **What if the file doesn't cast?** Every file ships with a signed spec sheet. If a delivered file breaks its own spec, we fix it free and refund the CAD fee. Claims are open for 30 days.
- **Who sees my designs?** Only the team on your order. Designers never see who you are or who your customer is, and your work is never shown to anyone.
- **Do you use AI to make the CAD?** Yes. AI models each piece with methods built for jewelry CAD; a senior designer checks and finishes every file against your brief and your factory's rules; a master craftsman signs it off.
- **How do I pay?** Only after you accept the price: by card, or by Wise, bank transfer or PayPal. Pay per design, or ask about a retainer.

### 10.8 Rules for anyone writing marketing content

- **Use claims only as they appear** in `content/claims.ts`: 50+ designers · 10+ years · 99% right first time · 2 QC stages · 6 h first look · from $35 · 2 revision rounds within 14 days · 30-day claim window.
- **No fake** statistics, logos, testimonials or portfolio work. The work gallery stays empty until real work is cleared with the client in writing.
- **Banned:** "first" or "only" claims, the phrase "double-blind", and any mention of The CAD Co.
- **Always attach the conditions** to the 6-hour promise: standard pieces, from order confirmation.
- **Do not market:** dental, rush delivery, wallet top-ups and credit packs, the public results page, or automatic late credit, until they are switched on.

---

## 11. Conflicts, gaps and open questions (must be resolved by the owner)

| # | Issue | Detail | Recommendation for content |
| --- | --- | --- | --- |
| 1 | **Price** | **RESOLVED 2 Nov 2026:** $35 is the real price. The Terms page now says "Prices start from $35 a design", with no band prices. What remains: the portal's automatic quote default for a standard piece is still $55, and the team enters $35 on the quote. The older copy documents (`docs/marketing/LANDING-COPY.md`, `docs/redesign/HOMEPAGE-COPY.md`) still mention $55 and $49 and are superseded. | Use "From $35 a design". Optional for the owner: change the portal's default quote to $35. |
| 2 | **Deliverables wording** | The Terms page now lists the current deliverables (2 Nov 2026). The homepage, FAQ and /pricing still say "3 render views" or "3 renders" and omit the technical sheet and summary sheet. Since 1 Nov 2026 the delivery is one render image with four views + technical sheet + summary sheet PDF + QC certificate + weight sheet + preview link. | Use the current list (§2 A14). |
| 3 | **AI positioning history** | Older approved copy said "No, AI runs our operations; every file is modelled by a senior designer." DECISIONS v1.4 and the live site say "AI models each piece; experts check and finish." | Use the current AI-native wording; the AI modelling itself is an owner claim, not visible in this codebase. |
| 4 | **Weight figures differ by source** | The weight sheet uses one set of alloy densities (admin settings); the gold calculator/technical panel uses the owner's spreadsheet densities and allowances. Numbers for the same piece can differ. | Say "estimated weights"; don't quote exact densities or grams in marketing. |
| 5 | **Activation status unknown** | Card checkout (Razorpay live keys), client emails (test mode by default), push notifications (keys) and feature switches are owner-controlled in production. | Confirm before promising email or push updates or card checkout. |
| 6 | **"Price within the hour"** | Stated on the website; quoting is manual and not timed by the system. | Keep as stated only if the owner confirms. |
| 7 | **Retainer and plan details** | Plan structures exist in the decisions file but are not published and are sold manually. | Get the owner's approved retainer offer before marketing it. |
| 8 | **Logo** | **RESOLVED 2 Nov 2026:** black pillars on white, applied to the favicon, app icons, website header and footer, and the portal. No exported SVG/PDF logo file or brand guidelines exist yet. | Export the master mark from `components/brand/pillar-mark.tsx` for print and social use; Claude Design can build the guidelines around it. |
| 9 | **Real proof assets** | No customer testimonials, logos, case studies or cleared portfolio images exist in the project. | Collect before use; never fabricate. |
| 10 | **Production domain** | Not in the repository. | Owner to supply. |

---

*End of document. Source files consulted:*
- *`docs/DECISIONS.md` (v1.7), `docs/SPEC-ADDENDUM.md`, `docs/EMAIL.md`, `docs/marketing/LANDING-COPY.md`, `docs/redesign/HOMEPAGE-COPY.md`, `docs/design/README.md`*
- *`content/claims.ts`, `components/marketing/*`, `app/(marketing)/*`, `app/(app)/*`, `app/globals.css`, `components/wordmark.tsx`, `app/manifest.ts`, `public/icons/*`*
- *database enums in `db/migrations/0028_order_specs.sql` and `0034_product_kinds.sql`*
- *the `design-qa` screenshot branch*

*No application files were changed.*
