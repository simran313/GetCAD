The platform tells people about events in three ways. They are separate, and only one of them proves a message reached an inbox.

| Channel | Where it appears | Who gets it | Depends on |
| --- | --- | --- | --- |
| **In-app notification** | The bell (top of the sidebar; top bar on a phone), the unread count on **Messages**, and a pop-up "toast" with **Open** while the portal is open | Clients, designers, pod leads and admins, as listed below | Nothing: always written |
| **Phone or desktop push** | The device's own notification centre | Anyone who turned on **Notifications** under **Account → On this device** on that device | Push keys configured on the server; the 5-minute dispatch job running. Text never names people or amounts |
| **Email** | The person's inbox | Clients (order emails), designer applicants, website enquirers | `EMAIL_DELIVERY=live` on the server. Until then **every** email goes to the test inbox instead |

> [!WARNING] A screen saying "sent" is not proof of delivery
> An in-app toast or a status change confirms the action was recorded. An email is queued, then sent by the dispatcher straight after the action and by a sweep every 5 minutes, retrying up to 8 times. In **test mode** no client receives anything. Check **Admin → Settings → Email previews** (`/admin/emails`): the banner says "Test mode…" or "Live…".

### In-app notifications: what triggers them {#in-app-triggers}

| Event | Who is notified | Text they see |
| --- | --- | --- |
| Client writes in the client conversation | The order's **pod lead** | "New message from the client." |
| Team writes in the client conversation | The **client** | "New message from the team." |
| Designer writes in the designer conversation | The order's **pod lead** | "New message from the designer." |
| Team writes in the designer conversation | The **designer** | "New message from the team." |
| Order quoted | Client | "Your order has been quoted." |
| Order paid **and** confirmed (clock starts) | Client; pod lead | "Your order is confirmed and paid — the first-look clock has started." / "An order in your pod is confirmed and paid — the clock is running." |
| Designer assigned | Designer | "You have been assigned to an order." |
| Job moved to another designer | Old designer; new designer (when it was waiting on changes) | "A job was moved to another designer" / "A job waiting on changes was moved to you" |
| Job taken back | Designer; every admin | "A job was taken back from you" / "A job was taken back from its designer and is waiting for a designer again" |
| Designer sends to QC | Pod lead; client | "A job in your pod is ready for QC." / "Work has been submitted on your order." |
| Due in 60 minutes / overdue to QC | Designer (both); pod lead (overdue) | "Job … is due to QC within the hour" / "Job … is past its due time to QC" / "Job … is overdue to QC" |
| Pod lead passes QC | Client | "Your order is ready to preview." |
| Client asks for changes | Designer; pod lead | "Changes requested (round n)…" / "The client asked for changes (round n)." |
| Client approves | Designer; pod lead | "The client approved this job." / "The client approved an order in your pod." |
| Order delivered | Client | "Your order has been delivered." |
| First-look deadline passed | Pod lead | "The first-look deadline on an order in your pod has passed." |
| Late credit issued | Client | "We missed the first-look deadline on your order — a credit has been issued." |
| Client raises a problem (dispute) | Designer | "A dispute was raised on your order." |
| Dispute resolved | Client; designer | "A dispute on your order was resolved." |
| Pod lead escalates a job | Every admin | "A pod lead escalated a job" |
| Admin resolves an escalation | The pod lead who raised it | "An admin resolved your escalation" |
| Client opens a spec claim | Pod lead | "A client opened a spec claim. Re-measure the archived file." |
| Spec claim decided | Client (and the pod lead, for the free fix when upheld) | Result of the claim |
| Client orders a change after approval | Pod lead | "A client ordered a change to an approved design. It needs a quote." |
| Team places an order for a client, with the email box ticked | Client | "The team placed an order for you." |
| Payout batch marked paid | Each payee | "Your pay of ₹… for this job was sent." |
| Order refunded | Client | "Your order has been refunded." |

> [!NOTE] Admins are not notified of new orders or client messages
> New orders appear on the **Queue**; nobody gets a notification for them. Client messages notify the order's **pod lead** only. An order has no pod until it is paid or confirmed, so **a message a client writes before then notifies nobody**. Check **Messages → Needs reply** every day.

### Emails {#emails}

Client emails are sent by the database event, never by a page, and each can be sent only once per event.

| Event | Email | Client can turn it off |
| --- | --- | --- |
| Client creates their own account | Welcome | No |
| Portal order sent for a price | Order received | No |
| Order quoted (each new price) | Quote ready | No |
| Quote unpaid for 24 hours | Quote reminder | Yes (Reminders) |
| Payment received | Payment received | No |
| Paid and confirmed (clock starts) | Order confirmed, with the due time in US Eastern time | No |
| First look ready / revised design ready | First look ready / Revised design ready | No |
| Changes requested | Revision received | No |
| Design waiting 48 hours | Preview reminder | Yes (Reminders) |
| Approved / delivered | Design approved / Files delivered | No |
| 72 hours after delivery | Feedback request | Yes (Reminders) |
| Problem raised, refunded, cancelled (not a draft), first look missed, late credit decided | Matching email | No |
| Team writes in the client conversation | New message (at most one per order every 30 minutes) | Yes (Messages from your team) |
| Team places an order for the client, with the email box ticked | Order placed for you | — |
| Designer application received / accepted / rejected | Matching email to the applicant | — |
| Website contact form | Acknowledgement to the sender | — |

**Not sent by email at all:** anything to designers about jobs (assignment, revisions, QC), anything to pod leads, and anything to admins. These are in-app and push only. There is no invoice email; the platform has no invoices yet.
