# Admins and staff {#admin-staff}

The team that prices, takes payment, confirms, delivers and manages people. This chapter gives the outline and the everyday tasks. The standalone **The CAD Pillar | Admin Operations Manual** covers every admin screen and control, with procedures, checks and troubleshooting.

## Who counts as an admin {#staff-roles}

A full **Admin** holds three staff roles: **Sales**, **Ops** and **Finance**. Staff who hold only one see the same **Admin workspace**, but the database refuses what their role may not do. See [What makes someone an "Admin"](#what-makes-an-admin) for the split.

## What do you need to do? {#admin-tasks-short}

- [First sign-in and the Queue](#admin-first)
- [Price an order](#admin-quote)
- [Record a transfer payment](#admin-paid)
- [Confirm an order](#admin-confirm)
- [Deliver and close](#admin-deliver)
- [Pay the team](#admin-pay)
- [Add a designer](#admin-designer)
- [Change roles or suspend](#admin-access)

## First sign-in and the Queue {#admin-first}

You land on the **Queue**: orders where the team has the next move, disputes first, then the nearest deadline.

- The counters across the top (**Awaiting quote**, **Awaiting payment**, **Ready to assign**, **With designer**, **In QC**, **With client**, **Ready to deliver**, **Delivered**, **Ready for payout**, **Dispute**) filter the list when clicked.
- Each row says **Why it's here** and offers one button: **Price it**, **Confirm**, **Deliver** and so on.
- Alerts above the list flag missed first looks, escalations, disputes and spec claims.

![The admin Queue](../assets/screens/admin-queue.png)

The sidebar groups the rest:

- **Work**: **All orders**, **Messages**, **Create order**;
- **Money**: **Billing**;
- **People**: **Clients**, **Access**, **Applications**, **Leads**;
- **System**: **Settings**;
- **More**: **Designers**.

## Price an order {#admin-quote}

1. **Queue** → **Price it**.
2. Choose the **Category** (A–L).
3. Leave **Price $ (optional)** empty for the band ($35 A–C, $85 D–F), or enter a price. G–L need a price and **Deadline h (G–L)**.
4. Click **Set quote**.

The price cannot be changed afterwards, and the client is told at once. Watch the "Payouts are N% of the price" line.

## Record a transfer payment {#admin-paid}

When a Wise, bank or PayPal payment arrives:

1. Open the order.
2. Choose **Paid by** and enter the **Reference**.
3. Click **Mark paid**.

Card payments mark themselves paid.

## Confirm an order {#admin-confirm}

1. Open the paid order.
2. Choose the pod if asked (**Choose**).
3. Click **Confirm order**. This starts the client's first-look clock, and the pod lead assigns a designer.

## Deliver and close {#admin-deliver}

1. After the client approves, open the order and click **Delivered**.
2. When finished, click **Closed**. Closing makes the team's pay owed.

## Pay the team {#admin-pay}

1. **Billing** → **Payouts** → **Export … as a batch** → **Download CSV**.
2. Pay by bank transfer.
3. Click **Mark batch paid**. Each payee is notified.

## Add a designer {#admin-designer}

1. **Designers** → **Add designers**.
2. Enter `email - Name` and click **Add designers**.
3. **Tell them to sign in.** No email is sent.
4. On their page, choose their **Pod** and click **Save**.

They can be assigned only once they have signed the agreement ([why](#exists-vs-eligible-short)).

## Change roles or suspend {#admin-access}

**Access** → find the person.

- **Role** saves at once. Choosing **Pod lead** creates their pod.
- **⋯** → **Suspend…** → type `suspend` → **Suspend account** freezes them. **Reinstate** undoes it.
- The last active Ops account cannot be demoted.

## Exists versus can receive work {#exists-vs-eligible-short}

A designer receives work only when all of these are true:

- they have an account with the **Designer** role;
- they have signed the **current** agreement;
- they are **Active**, not Suspended;
- they are in the **order's pod**.

Until then the pod lead sees them greyed out, marked "· not signed" or "(not signed up)". Check them on **Designers**: **Waiting to sign in**, **Not in a pod**.

## Make someone a full Admin {#make-full-admin}

The **Access** screen sets one role, the primary role.

1. Set the primary role to **Ops** on **Access**.
2. Ask technical support to add **Sales** and **Finance** as additional roles. This is not available on any screen.
3. Check the person's **Account** page: it should list all three roles.
