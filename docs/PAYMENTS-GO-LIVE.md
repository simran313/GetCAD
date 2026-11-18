# Payments go-live: readiness and steps (16 Nov 2026; updated 18 Nov 2026)

Where payments stand, what is ready, and the exact steps once the bank account is in place. This complements `docs/LAUNCH.md` (phases 1b, 4 and 5) and DECISIONS §13. Facts about Razorpay's process come from Razorpay's own documentation and blog. The exact document list appears in your Razorpay dashboard's activation form, which is the authority.

## Status today

| Area | State | Evidence |
|---|---|---|
| Checkout in the portal (card, Razorpay) | Built and tested | `e2e` money suite: signed webhook → order **Paid** → escrow held, on every pull request |
| Webhook route and signature check | Built | `/api/webhooks/razorpay`; a forged or unsigned call is refused |
| Production configuration | Keys and webhook secret are set | `https://thecadpillar.com/api/health` → `payments: true` (16 Nov 2026) |
| Test or live keys in production? | **Shown by `/api/health`** (18 Nov 2026) | `https://thecadpillar.com/api/health` → `"paymentsMode": "test"` or `"live"` |
| Manual payments (bank transfer, Wise, PayPal) | Ready | Admin → order → **Mark paid** (DECISIONS §13) |
| Policy pages payment providers check | **Added in this PR**: `/refund-policy`, `/delivery-policy`; Terms and Privacy exist | Footer → Legal |
| Terms of service | Final (16 Nov 2026): company, CIN, registered office, Indian law, courts at New Delhi. A lawyer's review is still recommended | `/terms` |
| Contact page with a business address | Done: registered office, CIN, email, phone; also in every page's footer | `/contact` |
| Invoices for clients | **Built** (0072): one per paid order, numbered `TCP/2026-27/0001` within the Indian financial year; GSTIN and LUT export wording once entered; PDF for the client and finance | Admin → Billing → Billing details; `/api/invoices/<order>` |
| Other ways to pay (bank, Wise, PayPal) | **Built** (0072): details shown on the pay page; the client presses "I've paid"; finance is notified and marks it paid | Admin → Billing → Billing details |
| Designer payouts (Razorpay Route) | Export + bank transfer for now (in-app payouts off, DECISIONS §12) | Admin → Payouts |

> **Important.** If production holds **live** keys but the Razorpay account is not activated, or international payments are not enabled, a US client's card is refused at checkout. Until both are done, quote US clients a **bank transfer, Wise or PayPal** and mark the order paid by hand.

## The shortest path to live card payments (bank account now active)

| # | Step | Where | Done when |
|---|---|---|---|
| 1 | Merge the billing PR and run `0072_billing.sql`, then `0053_billing_rls.sql`, in the Supabase SQL editor | Supabase | Admin → Billing → Billing details opens |
| 2 | Fill in **Billing details**: check legal name, CIN, address; add the SAC code your CA confirms; add Wise and/or bank details for US clients | Portal | The pay page of a quoted test order shows them |
| 3 | **Razorpay activation**: business details, policy links, settlement bank account (the current account), video KYC | Razorpay dashboard (A below) | Dashboard says "Activated" |
| 4 | **International payments**: request it, purpose code for design services | Razorpay (B below) | Approval email |
| 5 | **Live keys and webhook** in Vercel and Razorpay; redeploy | Vercel + Razorpay (D below) | `/api/health` → `"payments": true, "paymentsMode": "live"` |
| 6 | **Prove it**: pay a real small order with an international card, see it turn Paid, download its invoice, reconcile with `npm run verify:delivery`, refund it | Portal + terminal | All four done |
| 7 | **GST**: add the GSTIN and the LUT (ARN and year) under Billing details as soon as you have them | Portal | New invoices read "Tax invoice" with the LUT statement |

Until step 5 is done, card checkout uses test keys (a real card is declined): quote US clients Wise or bank transfer, which now works end to end in the portal.

## Before the bank details arrive (can be done now)

1. **Merge this PR**: the refund and delivery policy pages go live, linked from every page's footer.
2. **GST registration.** Apply now: Razorpay may ask for the GSTIN, and the LUT that keeps export invoices at 0% needs it. Add the GSTIN to `content/claims.ts` (`COMPANY`) once issued.
3. **Check which Razorpay keys production uses** (step above).
4. **Open a Wise Business account** (USD account details, so US clients can pay by ACH from their own bank) and/or a **PayPal Business** account. This is the fastest way to take a US payment while Razorpay international is pending.

## Once the bank account is open

### A. Razorpay account activation
1. Razorpay Dashboard → **Account & Settings** → **Business details**:
   - company PAN;
   - CIN;
   - GSTIN;
   - registered address;
   - website `https://thecadpillar.com`, with the policy links:
     - `/terms`;
     - `/privacy`;
     - `/refund-policy`;
     - `/delivery-policy`;
     - `/contact`.
2. Add the **settlement bank account** (the current account in the company's name).
3. Complete **video KYC** with the authorised signatory. Razorpay runs it as part of onboarding.

### B. International payments (US clients pay in USD)
1. Dashboard → **Account & Settings** → **International payments** → request activation.
2. Describe the business plainly: "Jewelry CAD design services (digital 3D files and renders) for jewelry businesses in the US, UK, Australia and Canada; delivered online; priced in USD."
3. Choose the **purpose code** that matches design or technical services. Razorpay's activation team checks it and may ask for an IEC or HS code "depending on your business"; for a services exporter that is usually not needed, but answer whatever they ask.
4. Razorpay states approval in a few business days when the website and policies are complete.

### C. Tax and export paperwork (with your CA)
- **GST and LUT.** Exports of services are zero-rated when the client is outside India and payment arrives in foreign currency. File a **Letter of Undertaking (Form GST RFD-11)** each financial year before the first export, so no IGST is paid on these invoices.
- **Proof of each receipt.** Keep an **e-FIRA, FIRC or e-BRC** from the bank or provider for every foreign payment. Gateway statements alone do not satisfy a refund officer.
- **Invoices.** The portal issues them (0072). Each export invoice carries "Supply meant for export under Letter of Undertaking without payment of integrated tax (IGST)" with the LUT ARN and year, once they are entered under Billing details, and an IGST line at 0%. Ask your CA to confirm the SAC code (998391 is pre-filled as a starting point) and the wording once.
- **Processing fees.** Fees charged by banks and gateways carry GST even when the export itself is zero-rated.

### D. Switch production to live
1. Razorpay → **Settings** → **API Keys** (Live) → generate the keys.
2. In Vercel (Production):
   - `RAZORPAY_KEY_ID` = `rzp_live_…`;
   - `RAZORPAY_KEY_SECRET`;
   - a new long random `RAZORPAY_WEBHOOK_SECRET`.
3. Razorpay → **Settings** → **Webhooks** (Live):
   - URL: `https://thecadpillar.com/api/webhooks/razorpay`;
   - the same secret;
   - the events listed in `docs/LAUNCH.md` Phase 4.
4. Redeploy. `/api/health` → `payments: true`.
5. **Prove it end to end:**
   1. Make one small real payment with an international card on a test order.
   2. Check that the order turns **Paid**.
   3. Reconcile it with `npm run verify:delivery` (LAUNCH Phase 5).
   4. Refund it from the order.

### E. Designer payouts (later)
In-app payouts (Razorpay Route) stay off (DECISIONS §12). Keep exporting payouts and paying by bank transfer. Turn on Route only after collections have run cleanly for a few weeks.

## Sources
- [Razorpay: international payments](https://razorpay.com/docs/payments/international-payments)
- [Razorpay: international payment codes (purpose, HS, IEC)](https://razorpay.com/docs/payments/dashboard/account-settings/international-payment-codes?preferred-country=IN)
- [Razorpay: video KYC for international payments](https://razorpay.com/blog/international-payments-razorpays-video-kyc/)
- [Razorpay: requirements for accepting international payments](https://razorpay.com/learn/breaking-down-the-requirements-for-accepting-international-payments-through-razorpay/)
- [Razorpay: GST on export of services](https://razorpay.com/blog/gst-export-services-india-guide/)
- [Skydo: export of services under GST (LUT, RFD-11)](https://www.skydo.com/blog/export-of-services-under-gst)
