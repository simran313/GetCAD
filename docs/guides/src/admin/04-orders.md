# Running an order from start to finish {#orders-lifecycle}

Each section below is one step of the order's life, in the order it happens. For the whole picture in one table, see [Status and handoff table](#status-table).

## Intake: where orders come from {#intake}

There are two ways in:

1. **The client orders in the portal.** They choose **New order** → **CAD design** (or **Renders**), answer the three brief steps, and press **Send for a price**. The order arrives on the **Queue** as **Awaiting quote**. The client gets the "Order received" email. No one on the team is notified: the Queue is where you see it.
2. **The team places it for them** ("on behalf"), when the request came by email, WhatsApp or phone. See the next section.

A client who wrote to you before having an account can be created in the same form.

## Place an order for a client {#on-behalf}

**Who:** an Admin or a pod lead. **Before you start:** have at least one screenshot of the client's request (PNG or JPEG).

**Open:** sidebar → **Create order** (`/admin/new-order`), or **Queue** / **All orders** → **Create order**.

1. **Find the client.** Type their business, name, email, phone or client code into **Find the client…** and click **Search**. Click the right client under **1. Client**.
2. **Or a new client**, if "No client found":
   - Enter **Business name**, **Contact name**, **Email** and **WhatsApp / phone (with country code)**.
   - This opens their account. They later sign in with this email, using a code instead of a password.
   - An email that already has an account is reused, not duplicated.
3. Under **2. The order**, fill in:
   - **Came by**: Email, WhatsApp or Phone.
   - **Product**.
   - **Service**: CAD, Render, or CAD + render.
   - **Received at (optional)**.
   - **Pod**. An admin may leave **No pod yet (admin)**.
4. Under **What they asked for**, write the request. **The client sees this as the first message** in their conversation, so write it for them.
5. Under **3. Screenshots of the request**, click **Choose screenshots** and add at least one (up to 20).
   - The client and the team see them.
   - Designers never do.
6. **Email the client that the order is placed** is ticked by default: the client gets the "Order placed for you" email and an in-app notice. Untick it if you will message them yourself.
7. Click **Place order**.

> [!WARNING] Before you press Place order
> The order goes straight to **Submitted** (Awaiting quote) and appears in the client's portal. With the box ticked, the client is emailed at once. There is no undo: an unwanted order is cancelled by the client, before payment.

**What happens next.** The order page opens with an **intake panel**:

- how the order came in;
- the screenshots;
- **Send on WhatsApp**, which opens WhatsApp with a ready-written message containing the order link (you still press send there);
- **Write an email**, which opens your email app with the same message.

Fill in the brief on the order (the team may write it for on-behalf orders), then [price it](#quote). The first-look clock starts only when the order is paid and confirmed.

![Create order for a client](../assets/screens/admin-new-order.png)

## Price an order (set a quote) {#quote}

**Who:** Sales or Admin. **When:** the order is **Submitted** (Queue: **Awaiting quote**, button **Price it**).

| Category | Minutes | Tier | Default price (band) |
| --- | --- | --- | --- |
| A, B, C | 15, 30, 45 | Standard | $35 |
| D, E, F | 60, 90, 120 | Standard | $85 |
| G, H, I, J, K, L | 180–480 | Complex | from $120 (enter the price) |

1. Open the order. Read the **Brief** card and any **Master instructions**.
2. In the **Next step** card, choose the **Category** (A–L) from the table above.
3. Leave **Price $ (optional)** empty to use the band price. Or enter the price in US dollars, for example `35` or `120.50`.
4. For G–L only, enter **Deadline h (G–L)**: the hours to the first look. It is required for complex orders.
5. Click **Set quote**.

> [!WARNING] Before you press Set quote
> The price is fixed once set. The app has no re-quote: an order can be priced only while it is **Submitted**. The client is notified and emailed "Quote ready" at once. If the price is wrong, ask the client to **Decline this price** on their Pay screen (that cancels the order), then place it again. Designer pay and pod pay are worked out from the category, so they follow automatically.

**Check.** The status becomes **Quoted**. The **Order** card shows **Price**, **Designer pay** and **Pod pay**, and "Payouts are N% of the price". If that share is above the **Payout warning** setting (40% by default), the line ends "— above the 40% limit." The warning does not block anything. It is there to stop a loss-making price.

![An order waiting for a quote](../assets/screens/admin-order-quote.png)

## Record a transfer payment {#mark-paid}

**Who:** Finance or Admin. **When:** the order is **Quoted** and the money arrived outside the card checkout: a Wise transfer, a bank transfer, PayPal, or another method.

1. Open the order. The **Next step** card shows **Paid by** and **Reference**.
2. Choose **Paid by**: **Wise transfer**, **Bank transfer**, **PayPal** or **Other**.
3. Enter the transfer's **Reference** (up to 120 characters). Your bank or Wise shows it.
4. Click **Mark paid**.

> [!WARNING] Before you press Mark paid
> Only press it when the money is in your account. The order becomes **Paid**, the amount is recorded as held, and the client is emailed "Payment received". There is no "unmark": the only way back is a refund by Finance.

**Card and UPI payments** need nothing from you. The client presses **Pay & start**. Razorpay confirms the payment to the platform, and the order becomes **Paid** by itself, usually within seconds. If a client says they paid but the order still shows **Quoted**, see [troubleshooting](#ts-paid-not-showing).

![An order waiting for payment](../assets/screens/admin-order-mark-paid.png)

## Choose or change an order's pod {#choose-pod}

**Who:** Admin. **When:** the order is paid (or earlier) and has no pod, or you want it in another pod.

- **Automatic:** when an order is paid or confirmed and **exactly one pod has a lead**, it joins that pod by itself.
- **With more than one pod led:** the Queue row reads "Paid · choose a pod". Choose the pod lead in **Choose a pod…**, then click **Choose** (on the Queue row, or in the order's **Next step**).
- **To move it:** open the order → **Other actions ›** → **Move to another pod** → choose → **Move**. This is offered while the order is Submitted, Quoted, Paid or Assigned.

> [!WARNING] Moving a job that already has a designer
> Moving the pod does not move the designer. If the order is **Assigned**, first [take it back](#move-take-back), then move the pod, so the new pod lead can assign one of their own designers.

## Confirm the order (start the clock) {#confirm}

**Who:** Admin or the order's pod lead. **When:** the brief is complete and any open questions are answered. This is possible from Submitted until In progress, once per order.

1. Open the order.
2. Click **Confirm order**. It is in the **Next step** card when the order is paid and has a pod; otherwise it is under **Other actions ›**.

> [!WARNING] Before you press Confirm order
> If the order is already paid, the first-look clock starts now: 6 hours for categories A–F, or the hours set with the price for G–L. The client is notified and emailed "Order confirmed" with the due time, and the pod lead is notified. Confirmation cannot be undone.

**Check:** the **First look** column on the Queue shows a countdown, and the order says "First look due by …".


## Assign a designer (admin exception) {#admin-assign}

Assigning is the pod lead's job. The admin's page says "Paid and confirmed · the pod lead assigns a designer". Assign yourself only when the pod lead cannot: absent, or about to miss the clock.

**Before you start:**

- the order is **Paid**, confirmed, in a pod, and **has no designer**;
- the designer is in that pod and is assignable ([what that means](#exists-vs-eligible)).

1. Open the order → **Other actions ›** → **Exception: assign a designer yourself · normally the pod lead does this**.
2. Choose the **Designer**. Each option reads "DSG-reference · Name — open/shift min". Greyed options marked **(not signed up)** cannot be chosen.
3. If the job would push the designer over their shift (480 category minutes by default), enter an **Over-capacity reason (admin)**. While **Block assignment over shift capacity** is off (the default), going over only warns.
4. Click **Assign**.

**What happens:**

- The status becomes **Assigned**.
- The designer is notified "You have been assigned to an order."
- Designer pay and pod pay are reset at this designer's rate (recorded in the audit history).

An order can be assigned only once. To change designer later, [move it](#move-take-back).

## Move a job to another designer, or take it back {#move-take-back}

**Who:** the order's pod lead, or an Admin. **When:** the job is **Assigned**, **In progress** or **Revision requested**.

**Open:** the order → **Other actions ›** → **Move it to another designer, or take it back**. A pod lead also has the same controls on the **Team board**, under each job card → **Move, take back or escalate**.

- **Move:**
  1. Choose **Move to…** (only designers in the same pod are offered).
  2. Write **Why it moves**. A reason is required once work has started (status In progress or Revision requested); it is optional while the job is only Assigned.
  3. Click **Move job**.
  4. The new designer must press **Start work**.
  5. The old designer is notified "A job was moved to another designer".
- **Take back:**
  1. Write **Why it is taken back** (required once work has started).
  2. Click **Take back from the designer**.
  3. The order returns to **Paid** with no designer, and waits for a designer again.
  4. The designer is notified, and so is every admin.

> [!NOTE] Pay follows the job
> Moving a job resets designer pay to the new designer's rate. The designer's paused time is closed off, so their clock history stays correct.

![An order with a designer: Move and Take back under Other actions](../assets/screens/admin-order-with-designer.png)

## Resolve an escalation {#escalations}

A pod lead escalates a job when it needs an admin (from the Team board: **Escalate**, with "What needs an admin"). Every admin is notified "A pod lead escalated a job", and the Queue shows "N jobs escalated by a pod lead" → **Review**.

1. Click **Review**. It opens **Performance** with the **Escalated to admin** list.
2. Read the reason and do what is needed. Usually that is messaging the designer, moving the job, or answering the client.
3. Type what you did in the **What was done** box and click **Resolve**. The pod lead is notified "An admin resolved your escalation".

## Follow QC and the client's review {#qc-and-review}

Admins watch this stage; they do not perform it.

- **Designer sends to QC.** The order goes straight to **In QC review**. The pod lead is notified, and the client is told "Work has been submitted on your order."
- **Pod lead's review.** The pod lead marks five **QC manager** lines **Pass** or **Fail** and, for CAD, records the measured specification. Then:
  - **Approve · pass to client**: the order becomes **Ready to preview** and the first-look clock stops. The first look counts as on time if it happens before the deadline.
  - **Send back · revision needed**: the order becomes **Revision requested**. The failed lines become the designer's notes. A send-back does not use up the client's rounds.
- **Client's review.** The client can **Approve this design**, **Send changes** (two rounds included within 14 days of the first look), or **Raise a problem**. After the rounds are used, a change is a **new order** ("Order a change"), priced separately; it notifies the pod lead "…It needs a quote." and appears on the Queue.

> [!LIMIT] Admins cannot pass or fail QC from the screen
> The QC review page is the pod lead's. If a pod lead is absent, move the order to another pod (before assignment), or have technical support give a team member the pod-lead role for that pod.

## Deliver and close {#deliver-close}

**Who:** Ops or Admin.

1. When the client approves, the Queue row reads "Client approved · deliver the files" with **Deliver**. Open the order and click **Delivered** in **Next step**.
   - The order becomes **Delivered**.
   - The client is notified and emailed "Files delivered".
   - Their files are already unlocked: they unlock at approval.
2. When nothing more is owed to the client, open the order and click **Closed**. The Queue row says "Delivered · close the order".

> [!WARNING] Before you press Closed
> Closing finishes the order. It makes the designer's pay and the pod lead's pay **owed**, and they appear on **Payouts**. It cannot be reopened. The client's spec-claim window (30 days from delivery) is not affected.

![A delivered order, ready to close](../assets/screens/admin-order-delivered.png)

## Cancel an order or refund a client {#cancel-refund}

| Situation | Who | How |
| --- | --- | --- |
| Draft not wanted | Client | Order → **⋯** (More) → **Delete draft** |
| Sent or quoted, not paid | Client | Order → **⋯** → **Cancel order**, or **Decline this price** on the Pay screen |
| Paid, work not wanted | Finance | Order → **Other actions ›** → **Refund client** (offered while **Paid** or **Disputed**) |
| Disputed and cannot be fixed | Finance | **Dispute** panel → **Refund the client…** ([disputes](#disputes)) |

The team has no "cancel" button for an unpaid order: the client cancels it.

<!-- anchor: primary-role-buttons -->

> [!LIMIT] Refund and Release appear only for a primary Finance role
> **Refund client**, **Refund the client…** and **Release payout** are shown only when the person's *primary* role is **Finance**. A full Admin whose primary role is Ops does not see them, although the database would allow them. Have a Finance-primary team member do refunds, or ask technical support. The same rule shows **Send back for rework** only to a primary **Ops** role.

## Resolve a dispute {#disputes}

A client raises a problem from their order → **⋯** → **Raise a problem** (while the order is **In progress** or **Ready to preview**). The order becomes **Disputed** and freezes. The client sees "We're looking into a problem", and is emailed. The designer is notified. The Queue shows "N disputes open…" → **Show**, and the row's reason is the client's own words.

1. Open the order. The **Dispute** panel shows "Dispute open" and the client's reason.
2. Talk to the client in the **Client** conversation before deciding.
3. Decide:
   - **Send back for rework** (Ops). The order returns to **In progress** with the same designer. The client and designer are told it was resolved.
   - **Refund the client…** (Finance). A confirmation asks you to type `refund`.

> [!WARNING] Before you confirm Refund the client
> "The full amount goes back to the client and the order closes. This cannot be undone." The client is emailed "Order refunded".

## Decide a late first-look credit {#credits}

When a **standard** order (A–F) misses its 6-hour first look, the platform creates one pending credit for the full amount paid. It does this once, however many times the check runs. The client is emailed "Order delayed". The credit waits for you; the client sees nothing about it until you decide. Complex orders are not credited.

**Open:** **Queue** alert "First look missed…" → **Decide**, or **Billing** → **Credits** (`/admin/credits`).

1. Each row shows the order, the amount, and when it "was due".
2. Choose the **Decision**:
   - **Apply to next order**: the credit comes off their next order.
   - **Refund**.
   - **Partial credit**: enter **Amount $ (partial)** and a reason.
   - **Reject**: a reason is required.
3. Use **Reason (partial / reject)** where needed.
4. Click **Decide**.

The client is notified and emailed "Credit decided". The same credit cannot be decided twice: a second tab is refused.

> [!LIMIT] "Refund" records the decision; it does not move money
> Deciding **Refund** marks the credit refunded and tells the client. It does not send money back. Make the refund yourself in the Razorpay dashboard, or by bank transfer for transfer payments. A credit applied to the next order shows in the client's **Wallet** as **Credit**. The team takes it off the next price.

![Late-order credits](../assets/screens/admin-credits.png)

## Decide a spec claim {#spec-claims}

After delivery the client may open a spec claim, for example "Wall thinner than the certificate says". They do it from the order → **Spec guarantee** → **A file broke its spec sheet? Open a claim**, within 30 days, one at a time. They upload the file they cast from and photos. The pod lead is notified to re-measure, and the Queue shows the claim with **Review**.

1. **Review** opens the order's **Spec claims** panel. It shows whether **the file matches** the version delivered (an edited file is not covered), plus the casting details, **Their file** and **Photo**.
2. Enter the **Re-measured value** and a **Decision note**.
3. Click **Uphold · free fix + credit** or **Spec met · reject**.

Upholding creates a free fix order (the pod lead is notified to assign it, with the 6-hour clock running) and credits the CAD fee to the client's next order. Rejecting tells the client the result. The pod lead or an admin may decide.

## Write master instructions for a client {#master-instructions-admin}

A client's **Master instructions** are their factory's standing rules. The designer, the pod lead and admins see them on every order. The client normally writes them on **Account**.

To write or correct them for the client:

1. Open any of the client's orders.
2. In the **Master instructions** card (right column), click **Edit for this client**. The link reads **Add for this client** if there are none yet.
3. Change the text (up to 4,000 characters).
4. Click **Save for every order of this client**.

## Issue a missing QC certificate {#certificate}

After QC passes, the **Order** card links **Certificate**, **Weight sheet** and **Summary sheet**. If a CAD order has no certificate yet, an **Issue certificate** button appears there. Click it to make the certificate from the recorded QC.
