# Start here {#start}

This manual is for whoever runs The CAD Pillar day to day. Read chapters 1–3 on your first day. After that, use the [task index](#admin-tasks), the [daily checklist](#daily-checklist) and the [troubleshooting table](#troubleshooting) as lookups.

## How to use this manual {#conventions}

- **Bold** words are the exact labels on screen: buttons, menu items, tabs, column headings.
- "Open **Queue** → click **Price it** → click **Set quote**" means: click each item in turn.
- Paths such as `/admin/access` are the page's web address after `thecadpillar.com`. You can type them, but the sidebar always gets you there too.
- Callouts:
  - **Before you commit** marks an action that changes records, reaches a client, or cannot be undone.
  - **Known limit** marks something the platform does not do yet, and the way round it.
- Names in examples (Northline Jewelers, DSG-0007, Rhino pod, "Asha") are fictional. Screenshots come from a throwaway test system filled with test orders (titles such as "E2E halo ring"), never from live data.

## The platform in one page {#platform-in-one-page}

The CAD Pillar sells jewelry CAD (3D models ready for casting) and renders to jewelry businesses. Three groups use one portal:

- **Clients** order, pay, review and download.
- **The team** prices, takes payment, confirms and delivers. The team is the admins, plus Sales, Ops and Finance staff.
- **Pods** do the work. A **pod lead** assigns each job to one of the pod's **designers** and checks the result (quality control, "QC") before the client sees it.

Work flows in one direction: **admin → pod lead → designer**, then back up through QC to the client.

| Stage | What happens | Who acts |
| --- | --- | --- |
| 1. Brief | The client describes the piece in three short steps and sends it for a price | Client (or the team, for an order that came by email or WhatsApp) |
| 2. Quote | The team sets the category (A–L) and the price | Sales or Admin |
| 3. Payment | The client pays by card or UPI, or the team records a bank, Wise or PayPal transfer | Client, or Finance / Admin |
| 4. Pod and confirmation | The order joins a pod; the team confirms the brief, which starts the first-look clock | Admin (pod lead may confirm) |
| 5. Assignment | The pod lead gives the job to one designer | Pod lead (Admin only as an exception) |
| 6. Design | The designer models it, uploads four files, passes their own check and sends it to QC | Designer |
| 7. QC | The pod lead checks it, then passes it to the client or sends it back | Pod lead |
| 8. First look and changes | The client approves, or asks for changes (two rounds included within 14 days) | Client |
| 9. Delivery and close | The team marks it delivered, then closed. Pay becomes owed | Ops or Admin |
| 10. Payouts | The team pays designers and pod leads by bank transfer from an export | Finance or Admin |

<!-- include: ../shared/_accounts.md -->

## Your first sign-in {#first-login}

<!-- include: ../shared/_basics.md -->

### What you see the first time {#admin-first-look}

As an admin you land on the **Queue**. The sidebar has these groups:

| Group | Item | What it opens |
| --- | --- | --- |
| Work | **Queue** | Orders that need a team move now, with stage counters ([details](#queue)) |
| Work | **All orders** | Every order, with tabs, search and **Export CSV** ([details](#all-orders)) |
| Work | **Messages** | Every order's client and designer conversations ([details](#messages-admin)) |
| Work | **Create order** | Place an order for a client who wrote by email, WhatsApp or phone ([details](#on-behalf)) |
| Money | **Billing** | Money in and out, late credits, the way to **Payouts** ([details](#billing)) |
| People | **Clients** | Every client by code, account managers, public numbers, where clients come from ([details](#clients)) |
| People | **Access** | Every account: role, status, suspend and reinstate ([details](#access)) |
| People | **Applications** | Designer applications from the website ([details](#applications)) |
| People | **Leads** | Website contact-form messages ([details](#leads)) |
| System | **Settings** | The numbers the platform runs on, and feature switches ([details](#settings)) |
| More | **Designers** | Your designers: sign-in status, pod, pay rate, bank details, documents ([details](#add-designers)) |

Four admin pages have no sidebar item. **Credits** opens from the Queue alert or **Billing**. **Payouts** opens from **Billing**. **Emails** opens from **Settings → Email previews**. **Pods** opens from **Access → Pods**.

On a phone the bottom bar shows **Queue**, **All orders**, **Messages** and **More**, with a raised **+** for **Create order**.

![Admin on a phone: the Queue with the bottom bar](../assets/screens/admin-phone-queue.png){.phone}

> [!TIP] Before your first working day
> 1. Check your roles on **Account**. A full Admin shows Ops, Sales and Finance.
> 2. Open **Settings → Email previews** and note whether email is in **Test mode** or **Live**.
> 3. Open **Access → Pods** and check every pod has a lead and designers.
> 4. Open **Designers** and look for anyone **Waiting to sign in** or **Not in a pod**.
