# Phase 6 rollout — the website

What ships: the public website rewritten to LANDING-COPY, old pages redirected, and "where clients come from" tracking in your own database.

## 1. Apply the database change
In the Codespace:

```
npm run db:apply
```

It applies `0049_attribution.sql` and the policy `0038_attribution_rls.sql`. Until it is applied:
- the `/jewelry-cad` form fails;
- the welcome form fails for new clients.

## 2. Merge
Merge once the checks are green. No new settings.

## 3. What changes
- **Website pages:**
  - Home, How it works, Pricing, Guarantee, Quality (the 19 checks), FAQ;
  - `/jewelry-cad` (the page for ads);
  - Terms and Privacy as **drafts marked "pending legal review"**.
- **Old pages:** About, Security, Blog, For designers and Quality control now forward to the right new page, so old links still work.
- **Header:** How it works · Pricing · Guarantee · Quality · FAQ, **Sign in**, **Start for $49**. On phones, a **Menu** button.
- **/jewelry-cad form:**
  - piece + email (+ a note) → a lead appears in **Leads** for the team to price;
  - the visitor goes on to create an account with their email already filled in;
  - they add the sketch or photo in the brief after signing up.
- **New clients:** the welcome screen now asks **How did you hear about us?** (required).
- **Admins:** **Clients** shows **Where clients come from**:
  - how they heard;
  - where their first visit came from (e.g. `google`, an ad's `utm_source`, or a referring site);
  - briefs started, sent, paid, first looks opened and approved in the last 30 days.
- **Ad links:** tag them like `https://yoursite.com/jewelry-cad?utm_source=google&utm_campaign=bridal` and the source is kept for that visitor.

## 4. Before going live
- Have a lawyer review Terms and Privacy. Then send me the final text, or tell me what to change, and I remove the "Draft" label.
- Check the prices and wording on Pricing and FAQ.

## 5. Check it
1. Open `/`, `/pricing`, `/guarantee`, `/quality`, `/faq` on a phone and a computer.
2. Open `/about`: it lands on the home page.
3. In a private window open `/jewelry-cad?utm_source=test`, fill the form, create an account and finish the welcome screen.
4. As admin:
   - **Leads** shows the request;
   - **Clients → Where clients come from** shows `test` and your "how did you hear" answer.
