# Phase 8b rollout — the rest of the browser tests, and a Settings screen

What ships:
- **Settings screen** (`/admin/settings`, new "Settings" tab for the team). An admin changes the numbers the platform runs on and turns features on and off, without SQL. Every change is recorded in the audit log. Pod leads see the page read-only.
- **More browser tests in the `e2e` check:** on-behalf orders, late-order credits, payouts and the 40 % warning, over-capacity assignment, the preview link, spec claims, the certificate and weight sheet, and the website through to a new jeweler's first price.
- **Two fixes the tests found:**
  - "How did you hear about us?" could be skipped by a form that bypassed the browser. The server now requires it the first time a jeweler fills in their business.
  - The customer preview page's browser tab said "The CAD Pillar" and showed our icon. It now shows only "Design preview" and the jeweler's own logo and name.

No database change; no `db:apply` this time.

## 1. Before merging
Nothing new to set up: the `E2E_CLERK_*` secrets from 8a are reused.

The website test makes one extra Clerk test user per run (`e2e-signup-…+clerk_test@getcad.dev`) and deletes it at the end. If a run is cancelled half-way, one may be left in the Clerk development instance; it is safe to delete by hand.

## 2. Merge
Merge when **both** `verify` and `e2e` are green. `e2e` runs a few minutes longer than before.

## 3. After merging — the Settings screen
1. Sign in as an admin (Sales + Ops + Finance) → **Settings**.
2. Check the values are what you expect. The ones most likely to change:
   - **Money:** USD→INR rate (paise per $1; 8400 = ₹84.00), payout warning %.
   - **Weights:** the five alloy densities (mg/cm³; 13100 = 13.1 g/cm³).
   - **Clocks and windows:** first-look hours, revision and claim windows, shift minutes.
3. Change one only when you mean it: it applies from that moment to every new quote, sheet or deadline.
4. **Feature switches:** leave as they are unless a decision says otherwise (e.g. capacity blocking, automatic late credits).

## 4. If e2e fails
Open the failed run → **Artifacts → playwright-report**: a step-by-step trace with screenshots of where it stopped.
