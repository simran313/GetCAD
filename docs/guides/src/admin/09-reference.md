# Reference {#reference}

## Permissions matrix {#permissions}

The database enforces every row of this table. **Own** means the client's own orders. **Assigned** means jobs assigned to that designer. **Pod** means orders and designers in the pod lead's own pod. **All** means everything. A dash means never.

| Item and action | Client | Designer | Pod lead | Admin |
| --- | --- | --- | --- | --- |
| **Orders:** view | Own | Assigned (no price, no client identity) | Pod (no price) | All |
| Create an order | Own (portal) | — | For a client, in their pod | For any client |
| Write or edit the brief | Own, until priced | — | On-behalf orders in the pod | On-behalf orders |
| Set the quote | — | — | — | All (Sales role) |
| Record a transfer (**Mark paid**) | — | — | — | All (Finance role) |
| Choose or move the pod | — | — | — | All |
| **Confirm order** | — | — | Pod | All |
| Assign a designer | — | — | Pod | All (exception; Ops role) |
| Move or take back a job | — | — | Pod | All |
| Escalate a job | — | — | Pod | — (admins resolve) |
| Start, pause, send to QC | — | Assigned | — | — |
| QC pass or send back | — | — | Pod | — |
| Approve, ask for changes, raise a problem | Own | — | — | — |
| Deliver, close | — | — | — | All (Ops role) |
| Refund, resolve a dispute by refund | — | — | — | All (Finance as primary role) |
| Resolve a dispute by rework | — | — | — | All (Ops as primary role) |
| Cancel or delete | Own, before payment | — | — | — (nothing is deleted) |
| **Files:** upload deliverables | — | Assigned | — | — |
| Download deliverables | Own (renders from preview; 3DM and STL from approval) | Assigned | Pod | All |
| Certificate, weight sheet | Own, after QC | — | Pod | All |
| Summary sheet | Own, after approval | — | Pod | All |
| **Messages:** client conversation | Own | — | Pod | All |
| designer conversation | — | Assigned | Pod | All |
| Forward between the two | — | — | Pod | All |
| **People:** add designers; bank details; documents | — | Own bank details | — | All |
| Place designers in pods; create pods; set pod leads | — | — | — | All |
| Set a designer's own rate | — | — | View, pod | All |
| Change roles; suspend; reinstate | — | — | — | All (Ops role) |
| Applications, leads | — | — | — | All (Sales or Ops role) |
| Account managers; client list | — | — | — | All |
| **Money:** Billing | — | — | — | All (Finance role) |
| Payouts: export, mark paid | — | — | — | All (Finance role) |
| Late credits: decide | — | — | — | All |
| Spec claims: decide | — | — | Pod | All |
| Own earnings | — | Own | Own | — |
| **System:** change Settings and switches | — | — | — | All (full Admin only) |
| Share or remove pod materials | — | View, own pod | Pod | All |
| Performance | — | — | Pod | Opens from escalations |

**Staff with one role only** have the single slice named in brackets. The [table of staff roles](#what-makes-an-admin) shows each one.

## Status and handoff table {#status-table}

<!-- include: ../shared/_statuses.md -->

## Troubleshooting by symptom {#troubleshooting}

Work through the checks in order. Stop at the first one that explains it.

### "The designer is visible but cannot be assigned" {#ts-cannot-assign}

The name shows greyed out, marked "· not signed" on the Team board or "(not signed up)" on the order page.

1. **Designers** → the designer. Is the status **Waiting to sign in** or **Pending**? They have not signed the current agreement. Send them the sign-in line from their page and ask them to sign. If they say they signed, ask whether they were asked to sign a *new* version.
2. **Access** → the designer. Is the status **Suspended**? Reinstate them if that is intended.
3. **Access** → is their role still **Designer**?
4. Is the order in the same pod as the designer? Compare the order's **Pod** with the designer's **Pod**.
5. Is the order **Paid** with no designer? An order that already has a designer is moved, not assigned ([how](#move-take-back)). The error says "this job is already with a designer…".
6. Is the error "Over capacity…"? Either **Block assignment over shift capacity** is on (an admin can override with a reason), or choose a designer with room.
7. Still stuck: technical support, with the order reference and the designer's reference.

### "The pod lead cannot see a designer at all" {#ts-designer-invisible}

1. **Designers** → the designer → **Pod**. "Not in a pod"? Place them in the pod.
2. **Pods** → is the pod led by this pod lead?
3. Was the designer added as a designer? **Access** → role **Designer**.

### "An order is missing from my Queue" {#ts-missing-queue}

1. The Queue lists only orders where **the team** moves next. An order with the designer, in QC or with the client is not listed; only the counter includes it. Use **All orders** or **Search** (<kbd>Ctrl</kbd>+<kbd>K</kbd>) with the reference.
2. Is a stage filter on? Click **Clear filter**.
3. Is it a **Draft**? Drafts are the client's private work until sent.
4. Is it **Cancelled** or **Refunded**? Look under **All orders → Closed**.

### "A job is missing from the pod lead's queue or board" {#ts-missing-pod}

1. Is the order in their pod? On the order, **Pod**. If it reads "Not chosen", [choose the pod](#choose-pod).
2. Is it paid? Orders join a pod at payment or confirmation.
3. On the board, an unassigned job without a category shows **Set a category first**.
4. The QC queue lists only **In QC review** jobs. Everything else is on **Team board** or **All orders**.

### "A job is missing from the designer's Open jobs" {#ts-missing-designer}

1. On the order, does **Designer** name them? If not, it was never assigned, or it was moved or taken back (see the **Timeline**).
2. **Access** → are they **Suspended**?
3. Once sent to QC, a job moves to the **Submitted to QC** tab of **Open jobs**.

### "The client cannot see the file" {#ts-client-file}

1. Check the order's status. Render views and the technical sheet unlock at **Ready to preview**. The 3DM, STL and summary sheet unlock at **Approved**. Before that they show **Locked** or are absent.
2. Is the client looking at the right order? Files are listed per order on **Files**.
3. Did the designer upload into the right slot? The team's **Files** panel shows each version.
4. A render-only order has no STL, 3DM, certificate or weight sheet.
5. A file sent in the **Designer** conversation is never visible to the client. Forward it ([how](#messages-admin)).
6. Still missing: technical support, with the order reference and the file name.

### "A notification did not arrive" {#ts-notification}

1. **Is it an event that notifies anyone?** Check the [trigger table](#in-app-triggers). Admins are not notified of new orders or client messages. Client messages notify only the pod lead, and only once the order has a pod.
2. **In-app.** Ask the person to open the bell. If the notification is there, the in-app part worked.
3. **Push.** Did they turn on **Notifications** under **Account → On this device**, on *that* device? On iPhone the app must first be added to the home screen. Push is sent by a job every 5 minutes.
4. **Email.** Open **Settings → Email previews**. In **Test mode**, nothing reaches clients. Did the client turn off that kind of email (**Account → Email**)? Only messages and reminders can be turned off. Did they check spam?
5. **Still nothing:** technical support. Give the order reference, the time, and the email template name; the email outbox records every attempt and its error.

### "The client paid but the order still shows Quoted" {#ts-paid-not-showing}

1. Wait a minute and reload. Card payments are confirmed by Razorpay to the platform, usually within seconds.
2. Look in the Razorpay dashboard (**Billing → Reconcile with Razorpay**). Is the payment there and captured?
3. If it is captured but the order is still **Quoted**, the confirmation did not reach the platform. Technical support can re-send it from Razorpay; doing so is safe and never double-counts.
4. For a transfer, check your bank or Wise, then [Mark paid](#mark-paid).

### "A button I expect is not there" {#ts-missing-button}

| Missing | Why | Fix |
| --- | --- | --- |
| **Set quote** | Not Submitted; or you lack the Sales role | Check the status and your roles on **Account** |
| **Mark paid** | Not Quoted; or you lack the Finance role | Same |
| **Confirm order** | Already confirmed; or the order is past In progress | — |
| **Assign** (admin) | It is under **Other actions ›**; or the order already has a designer | Use **Move it to another designer** |
| **Refund client**, **Release payout**, **Refund the client…** | Shown only to a primary Finance role | [Primary-role buttons](#primary-role-buttons) |
| **Send back for rework** | Shown only to a primary Ops role | Same |
| **Approve · pass to client** | Only the pod lead, on the QC review | [Admins cannot QC](#qc-and-review) |
| A whole page says "Not available to your role" | That screen needs a role you do not have (for example Designers, Pods and Settings changes need a full Admin) | [Make someone a full Admin](#make-full-admin) |

### "The designer cannot send to QC" {#ts-cannot-submit}

The **Final review** lists what is missing:

- every **Designer check** line must pass;
- all four files must be uploaded (Rhino 3DM, STL, Render views, Technical sheet);
- the **Model volume** must be saved;
- the **gold weight** must be saved.

The team can see progress on the order's **Order** card. One line gives the version, the designer and QC check counts, and the files uploaded.

### "The clock did not start" {#ts-clock}

The clock starts only when the order is **both paid and confirmed**. The order's line says what it is waiting for: "The 6-hour clock starts once the order is paid and confirmed — waiting for …". [Confirm](#confirm) or [record the payment](#mark-paid).

### "A payout stays owed after export" {#ts-payout-owed}

Rows without usable bank details are not exported. **Designers** → the payee → **Bank details** (or, for a pod lead, ask them to add theirs under **Earnings → Add bank details**). Then export again.

### "Access shows references instead of emails" {#ts-access-refs}

The look-up of names at the sign-in service failed, or your role may not make it. The page says "Couldn't load emails — showing account references only". Reload. If it persists, technical support.

### When to call technical support {#support}

- Granting or removing additional staff roles (making a full Admin).
- Anything needing the audit history beyond an order's timeline.
- Re-sending a payment confirmation from Razorpay.
- Email or push configuration (test mode, live mode, keys, the 5-minute job).
- Any error message that names the database ("refused", "permission denied") on an action this manual says you may do.

Give the **order reference** or **account reference** (or **Copy account ID** from Access), the time, and the exact message on screen.

## Screen-by-screen reference {#screen-reference}

| Screen | Path | How to open | Purpose | Main controls | Guide |
| --- | --- | --- | --- | --- | --- |
| Queue | `/admin` | Sidebar · home page | Orders where the team moves next | Stage counters, alerts, row actions, **Reconcile**, **Create order** | [Queue](#queue) |
| All orders | `/admin/orders` | Sidebar | Every order | Tabs, **Search orders**, **Every stage**, **Save this view**, **Export CSV** | [All orders](#all-orders) |
| Order (team) | `/orders/…` | Any order row | One order | **Next step**, **Other actions ›**, Brief, Conversations, Files, Timeline, Order card | [Order page](#order-page) |
| Create order | `/admin/new-order` | Sidebar; Queue | Order for a client who emailed or used WhatsApp | Find the client, New client, The order, Screenshots, **Place order** | [On behalf](#on-behalf) |
| Messages | `/messages` | Sidebar | Every conversation | Filters, search, tabs, forward, mark up | [Messages](#messages-admin) |
| Billing | `/admin/billing` | Sidebar | Money in and out | Figures, movements, **Payouts**, **Credits**, **Reconcile with Razorpay** | [Billing](#billing) |
| Payouts | `/admin/payouts` | Billing | Pay the team | **Export … as a batch**, **Download CSV**, **Mark batch paid** | [Payouts](#payouts) |
| Credits | `/admin/credits` | Queue alert; Billing | Late first-look credits | **Decision**, **Amount**, **Reason**, **Decide** | [Credits](#credits) |
| Clients | `/admin/clients` | Sidebar | Clients by code | **Recompute**, search, **Account manager** | [Clients](#clients) |
| Access | `/admin/access` | Sidebar | Accounts and roles | Tabs, search, **Role**, **⋯** (Copy account ID, Suspend…, Reinstate), **Pods** | [Access](#access) |
| Pods | `/admin/access/pods` | Access → Pods | Pods, leads, members | **Create their pod**, **Change pod lead…**, **Add a designer…**, **Remove**, **Create pod** | [Pods](#pods) |
| Applications | `/admin/applications` | Sidebar | Designer applications | Tabs, **Accept**, **Reject**, **Reopen** | [Applications](#applications) |
| Leads | `/admin/leads` | Sidebar | Website contact messages | Tabs, **Mark handled**, **Reopen** | [Leads](#leads) |
| Designers | `/admin/designers` | Sidebar → More | Your designers | **Add designers**, each designer's page | [Designers](#add-designers) |
| Designer | `/admin/designers/…` | Designers | One designer | Sign-in, **Pod**, **Pay rate**, **Bank details**, **Documents** | [Designers](#add-designers) |
| Settings | `/admin/settings` | Sidebar | Numbers and switches | Fields, **Save changes**, **Discard**, **Features**, **Email previews** | [Settings](#settings) |
| Emails | `/admin/emails` | Settings → Email previews | Email mode and templates | **Send all … to …** | [Email previews](#email-previews) |
| Performance | `/pod/performance` | Queue escalation alert | Escalations and pod figures | **Resolve**, filters, downloads | [Escalations](#escalations) |
| Account | `/account` | Your name → Account | Your identity and settings | Time zone, Notifications, Sign out | [Account](#account-page) |

`/admin/users` redirects to **Access**. `/dashboard` is an older summary page kept for links. `/account/kit` is the design team's component sample page; it is not used in operations.

## Glossary {#glossary}

<!-- include: ../shared/_glossary.md -->
