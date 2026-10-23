# TCP Build Spec — Addendum A (October 2026)

Extends `TCP-BUILD-SPEC.md`. Values come from `DECISIONS.md`; if anything here disagrees with it, `DECISIONS.md` wins.

## A1. Changes to the existing spec

| Spec section | Change |
| --- | --- |
| §4 SLA | October: breach sets `sla_status = breached` and shows an **Issue credit** button to admin (manual). The automatic credit sweep ships behind flag `auto_sla_credit` (November). The client copy stays "first look within 6 hours of payment". |
| §5 Pay | Formulas unchanged. Add a quote-time check: warn admin if designer + QC payout exceeds 40% of the price. |
| §6 Intake | Desktop order is one page (screen N1; renders N7). Mobile keeps the stepped form. Add client price bands (A–C $55, D–F $85, G–L quoted) and the $49 first-design rule. |
| §8 Checklist | Unchanged; the QC certificate (A2) is generated from it. |
| §9 Deliverables | Add fingerprinting (A3), the weight sheet (A4) and the preview link (A5) to every delivery. |
| §11 Routes | Add the marketing site routes (A8). |

## A2. QC certificate + spec sheet (PDF)

- **When:** generated automatically when QC passes a version (QC_REVIEW → CLIENT_PREVIEW); regenerated for each new version.
- **Contents:**
  - Order reference, version, category, date.
  - Measured spec values (entered or confirmed by QC):
    - minimum wall (mm);
    - minimum prong (mm);
    - stone-seat sizes per stone;
    - ring size / inner diameter;
    - mesh tolerance;
    - open edges = 0.
  - The 19 checklist lines with designer ✓ and QC ✓ and timestamps.
  - Client waivers, if any — e.g. "client requested 0.6 mm wall, below the 0.8 mm minimum".
  - Designer sign-off (reference only) and "QC reviewed by" (pod lead reference only). No personal names.
- **Delivered:** attached to the first look and the final files; stored immutably.
- **Admin settings:** default minimums (wall 0.8 mm, prong 0.8 mm; editable).

## A3. File fingerprinting + archive

- On final delivery, compute a SHA-256 for every file; store the hash, size, version and timestamp in a `deliverable_files` table.
- Archive the files in read-only storage (no overwrite, no delete except by a retention policy).
- Show the fingerprint on the QC certificate and in the client's Files screen.
- Used by guarantee claims (A6): an uploaded file is matched by hash to the archived version.

## A4. Weight and metal-cost sheet

- **Input:** model volume (mm³), from the uploaded 3DM/STL. The designer enters it if automatic calculation isn't available in v1.
- **Output (PDF + on screen):**
  - estimated weight in 10K, 14K, 18K, Pt950 and Ag925;
  - stone list (position, shape, size, quantity) from the brief and checklist;
  - key dimensions.
- **Metal cost:** optional. Weight × a price per gram that admin enters in settings, labelled "estimate".
- **Default densities (g/cm³, editable by admin):** 10K 11.6 · 14K 13.1 · 18K 15.6 · Pt950 21.4 · Ag925 10.4.

## A5. Branded 3D preview link

- **Purpose:** the jeweler sends their own customer a rotatable 3D view, under the jeweler's brand.
- **Content:**
  - a web-friendly 3D model (GLB) converted from the approved STL/3DM;
  - the 3 render views.
- **Branding:**
  - the jeweler's logo and name, from their account profile;
  - no TCP branding, no prices, no order details.
- **Link:**
  - tokenised and unguessable;
  - expires after 30 days by default (client can extend);
  - client can revoke it;
  - view count shown to the client.
- **Privacy:** viewers can never reach the portal or any other order.

## A6. Spec-guarantee claim flow

1. Client opens **Raise a problem → Spec claim** on a delivered order, within 30 days.
2. **Required:** the file they used (upload), photos of the failed piece, which spec they believe was broken, and casting details (metal, printer/resin, shrinkage compensation).
3. **System checks:**
   - Uploaded file hash = archived hash? If not, the claim is "file modified — not covered" (shown with an explanation).
   - Within 30 days?
   - Any waiver on the certificate for that spec?
4. **Pod lead re-measures** the archived file on the claimed spec and records the values.
5. **Outcome:**
   - **Spec broken:** free fix within 6 hours (standard tier) + CAD fee refunded as credit; the designer's quality record is updated.
   - **Spec met:** client receives the measurements and a short note on likely casting causes; no refund.
6. **Abuse rule:** more than 2 claims a quarter from one client routes to admin review.
7. Every step is audited.

## A7. Public performance stats (flag `public_stats`, off until 30 days of data)

- **Computed weekly:**
  - on-time first-look % (standard tier);
  - first-pass approval %;
  - credits issued for late orders;
  - spec claims upheld.
- Shown on the website and in the client's account. Never edited by hand.

## A8. Public website (same app, marketing route group)

| Route | Purpose |
| --- | --- |
| `/` | Home: promise, how it works, price card, guarantee, CTA |
| `/jewelry-cad` | Landing page for outreach and ads: 6-hour promise, samples, $49 first design, 3-field brief start |
| `/pricing` | Price bands, plans, what's included |
| `/how-it-works` | Brief → price → pay → first look → approve → files |
| `/guarantee` | Both guarantees, full terms (DECISIONS §7) |
| `/quality` | 19-point checklist + certificate example |
| `/faq` | Answers from the response playbook |
| `/terms`, `/privacy` | Legal (required before go-live) |
| `/signup`, `/login` | Into the portal |

Copy is in `docs/marketing/LANDING-COPY.md`. Use the same design system as the portal (see `docs/design/README.md`).

**Tracking:**
- UTM capture on every page.
- Sign-up stores first-touch UTMs and a required "How did you hear about us?".
- Events:
  - `brief_started`, `brief_submitted`, `payment_completed`;
  - `first_look_viewed`, `approved`;
  - `preview_link_created`, `spec_claim_opened`.

## A9. Acceptance tests for this addendum

1. **QC certificate:** passing QC generates a PDF containing all 19 ticks and the measured specs.
2. **Fingerprinting:** a delivered file's hash is stored, and re-uploading an edited file is detected as a mismatch.
3. **Weight sheet:** shows 5 alloys, and the values change when admin edits the densities.
4. **Preview link:**
   - shows the jeweler's logo and no TCP branding;
   - an expired or revoked link returns "not available";
   - it can't be used to reach any other order.
5. **Spec claims:**
   - after 30 days the claim button is gone;
   - a hash mismatch blocks the claim;
   - an upheld claim creates a credit exactly once.
6. **Price bands and warnings:**
   - quoting a C job shows $55 by default;
   - a $49 first design is offered only once per account;
   - payouts above 40% of the price raise a warning.
7. **Manual SLA credit:** a missed standard order shows the Issue credit button; clicking twice credits once.
8. **Website:** every page loads with UTMs carried into sign-up; "How did you hear about us?" is required.
