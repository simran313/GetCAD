# Daily operations {#daily}

## Daily operating checklist {#daily-checklist}

Work top to bottom. Most days it takes 15–20 minutes. The live-support hours are 3 PM to midnight India time, so the busiest window is the US morning.

| # | Where | Look for | Do |
| --- | --- | --- | --- |
| 1 | **Queue** → red and grey alerts above the list | "First look missed…", "…escalated by a pod lead", "…dispute open", spec claims | **Decide** / **Review** / **Show** each one ([credits](#credits), [escalations](#escalations), [disputes](#disputes), [claims](#spec-claims)) |
| 2 | **Queue** → **Awaiting quote** | New briefs (portal and team-placed) | Open each → **Set quote** ([how](#quote)) |
| 3 | **Queue** → **Awaiting payment** | Quotes not yet paid; transfers that arrived | **Mark paid** for transfers received ([how](#mark-paid)); message slow payers |
| 4 | **Queue** → **Ready to assign** | Rows saying "Paid · choose a pod" or "Paid · confirm the order…" | **Choose** the pod, then **Confirm** ([pod](#choose-pod), [confirm](#confirm)) |
| 5 | **Queue** → **Ready to assign** | Rows saying "Paid and confirmed · assign a designer" whose clock is running down | Check the pod lead is on it (**Team board** via the order's pod). Assign yourself only as an exception ([how](#admin-assign)) |
| 6 | **Queue** → **With designer** and **In QC** counters | Jobs stuck for hours; the **First look** column turning red | Open the order; message the pod lead in the designer conversation |
| 7 | **Messages** → **Needs reply** | Clients waiting on the team, especially on orders with no pod yet | Reply in the **Client ↔ Team** tab ([how](#messages-admin)) |
| 8 | **Queue** → **Ready to deliver** and **Delivered** | Approved orders not yet delivered; delivered orders not closed | **Deliver**, then **Close** ([how](#deliver-close)) |
| 9 | **Applications** and **Leads** | New designer applications and contact messages | Accept / Reject; **Mark handled** |
| 10 | **Designers** | Anyone **Waiting to sign in**, **Not in a pod**, or with **No bank details** | Chase them; place them in a pod ([how](#add-designers)) |

**Weekly:** export and pay the owed payouts ([how](#payouts)); check **Billing** against the Razorpay dashboard; look at **Performance** per pod (opens from a pod lead's view, or from an escalation alert); check that **Settings → Email previews** still shows the mode you expect.

## The Queue {#queue}

**Open:** sidebar → **Queue** (`/admin`). This is your home page.

The Queue is a to-do list for the team. It lists only the orders where the team has the next move, ranked: disputes first, then the nearest first-look deadline, then the oldest.

![The Queue: stage counters, then the orders that need a move](../assets/screens/admin-queue.png)

**Top right.**

- **Reconcile** opens **Billing**.
- **Create order** opens the form for an order placed on a client's behalf.

**Stage counters.** Each box counts the orders currently in that stage, team-wide. Click one to filter the list to that stage. Click it again, or click **Clear filter**, to go back.

| Counter | Counts orders whose status is | Team move? |
| --- | --- | --- |
| **Awaiting quote** | Submitted | Yes: price it |
| **Awaiting payment** | Quoted | No (the client pays), unless you record a transfer |
| **Ready to assign** | Paid | Yes: choose the pod, confirm, assign |
| **With designer** | Assigned, In progress, Revision requested | No: the designer's turn |
| **In QC** | Work submitted, In QC review | No: the pod lead's turn |
| **With client** | Ready to preview | No: the client's turn |
| **Ready to deliver** | Approved | Yes: deliver |
| **Delivered** | Delivered | Yes: close |
| **Ready for payout** | Closed | Yes: pay the team |
| **Dispute** | Disputed | Yes: resolve |

The counters have no date range. They show the state right now.

**Alerts** (above the list, only when something needs a decision):

| Alert | Button | Opens |
| --- | --- | --- |
| "First look missed on N orders. Credits are waiting for your decision." | **Decide** | **Credits** |
| "N jobs escalated by a pod lead." | **Review** | **Performance** (escalation list) |
| "N disputes open. The client is waiting on the team." | **Show** | The Queue filtered to **Dispute** |
| "Wall/Prong/… claim" with order, client and designer references | **Review** | The order's spec-claim panel |

**The list ("Needs a move").**

| Column | Shows |
| --- | --- |
| **Status** | The stage pill (black for **Dispute**) |
| **Order** | The job's title, the order reference (for example `TF1-RN-C-4`) and the client code |
| **Why it's here** | One sentence, for example "Paid and confirmed · assign a designer", "Set category and price", "Via WhatsApp · check the brief and price it" |
| **First look** | Time left on the clock; **Clock not started**; **Done** when the first look was on time; **Missed** |
| (action) | One button: **Price it**, **Choose** (pod), **Confirm**, **Assign**, **Deliver**, **Close**, **Release**, **Resolve**, or **Open** |

Click anywhere on a row to open the order. An empty Queue says **Queue clear**: nothing needs the team.

## All orders {#all-orders}

**Open:** sidebar → **All orders** (`/admin/orders`).

Every order, by reference.

- **Tabs** narrow the list:
  - **All**.
  - **Open**: not finished.
  - **Needs staff**: waiting on the team (Submitted, Paid, In QC review, Disputed, Approved, Delivered).
  - **Closed**: closed, payout released, cancelled or refunded.
- **Search orders** finds by order, account (client code) or designer reference.
- **Every stage** filters by the same stages as the Queue.
- **Save this view** keeps the current tab, search and stage as a named view. Saved views live in this browser only and are not shared with other admins.
- **Export CSV** downloads the orders as a spreadsheet file.
- **Create order** opens the on-behalf form.

![All orders](../assets/screens/admin-orders.png)

## The order page (team view) {#order-page}

**Open:** click any order row (Queue, All orders, Billing, a notification).

The team's order page always has the same shape:

1. **Next step** (top). The status pill, one sentence saying where the order stands, the first-look line, and the **one action** the order needs now. Every other action your role may take sits under **Other actions ›**: click it to expand.
2. **Brief.** The client's answers. **Open** shows the full brief with photos.
3. **Conversations.** One card with a tab for **Client ↔ Team** and a tab for **Team ↔ Designer**.
4. **Files**, **Revisions** and **Timeline** (every recorded event, oldest first).
5. **Order** card (right; below on a phone):
   - **Pod**, **Designer**, **Client** (code), **Category** (with tier and hours);
   - **Price**, **Designer pay**, **Pod pay**, **Held in escrow**;
   - "Payouts are N% of the price", with a warning above 40%;
   - links to the **Full brief**, **Certificate**, **Weight sheet** and **Summary sheet** once QC has passed;
   - the order ID.
6. **Latest activity**, the client's **Master instructions** and any spec claims.

![An order ready to assign, with Other actions expanded](../assets/screens/admin-order-ready-to-assign.png)

What the **Next step** card offers, in priority order:

| The order is… | The card offers | Who sees it |
| --- | --- | --- |
| Submitted | **Category**, **Price $ (optional)**, **Deadline h (G–L)**, **Set quote** | Sales, Admin |
| Quoted | **Paid by**, **Reference**, **Mark paid** | Finance, Admin |
| Paid, no pod | **Choose a pod…** and **Choose** | Admin |
| Paid, not confirmed | **Confirm order** | Admin, pod lead |
| Paid and confirmed (admin view) | The sentence "the pod lead assigns a designer"; assigning yourself is under **Other actions** | Admin |
| In QC review (pod lead) | **Open the QC review** | Pod lead |
| Approved | **Delivered** | Ops, Admin |
| Delivered | **Closed** | Ops, Admin |
| Closed | **Release payout** | Finance as primary role only ([why](#primary-role-buttons)) |
| Disputed | The **Dispute** panel replaces the card | Ops, Finance |
