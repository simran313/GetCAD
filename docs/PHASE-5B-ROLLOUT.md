# Phase 5b rollout — client screens and ordering

What ships: every client screen from the designs, a reworked brief (with a new Size step), Messages, Files and a read-only Wallet. One database change.

## 1. Apply the migration (1 file)
In the Codespace, with `DATABASE_URL` pointing at the Supabase database:

```
npm run db:apply
```

It applies `0046_client_screens.sql`. Apply it **before** merging, or right after: until it is there, sending a brief and the Messages page fail.

**Bug fixed by it:** client orders were created in rupees while quotes are in dollars, so a $55 quote would have charged ₹55. Quotes now always switch the order to US dollars, and open drafts and quotes are corrected. Any unpaid payment link on a rupee quote is cancelled; re-quote that order if one exists.

## 2. Merge
Merge once the checks are green. No new settings.

## 3. What changes for clients
- **Sign in / sign up:** black brand panel beside the form. Same addresses.
- **First visit:** a welcome page asks for business details, offers notifications and the phone app, then "Start your first order".
- **Home:** what needs them, unread messages, orders in progress with their timers, wallet credit.
- **New order:** choose CAD or renders. The brief now asks for the **size** (ring size, inner diameter or length). "Review and send" lists anything missing; the order cannot be sent until it is complete.
- **Orders:** tabs Needs you · In progress · Reopened · Completed · Cancelled; each order shows the next step, a 7-step progress bar, files, revisions, messages and history.
- **Pay:** card/UPI through Razorpay as before. For Wise, bank transfer or PayPal the page tells them to message the team (no bank details shown). They can decline a price.
- **Review renders:** approve, or ask for changes (uses a revision round).
- **Messages, Files, Wallet:** new menu items. Wallet is view-only for now: credit, money held in orders, refunds, paid orders. Adding funds and invoice PDFs come with the next payment options.
- Designers and the team see no change yet (5c, 5d).

## 4. Check it
1. As a new client: sign up → welcome page → fill business details → Start your first order.
2. Pick CAD, fill the brief but skip the size → Review and send shows "Size" missing and the send button is off. Add it → send → "Sent" page.
3. As admin, quote it. Back as the client: Home shows "Pay $…", the Pay page shows dollars.
4. Send a message from the order; it appears under **Messages**.
5. Open **Files** and **Wallet** — both load (empty is fine).
