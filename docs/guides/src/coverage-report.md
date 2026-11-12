---
title: The CAD Pillar | Guide Coverage and Verification Report
short: Coverage and Verification Report
eyebrow: Coverage and Verification Report
subtitle: Every role, screen and action in the platform, the guide section that covers it, and the evidence behind it.
audience: Whoever maintains the guides; the owner, for the open items
edition: 12 November 2026 · code at e14fc78 (main) · captures from Design QA run 209
tocDepth: 2
---
<!-- toc -->

# How this was verified {#method}

## Sources of evidence {#evidence}

| Evidence | What it is | How it was used |
| --- | --- | --- |
| **Code** | The repository at `e14fc78` (main, after PR #135): routes, layouts, navigation, components, server actions | Every label, condition and route in the guides was read from the source |
| **Database** | All 66 migrations and the policies, applied to a local throwaway Postgres; then the transition table, every callable function and its permission checks, triggers, settings and feature flags were queried | The permissions matrix, status table, notification and email tables |
| **Running interface: screenshots** | Design QA run 209 on commit `215871b` (main plus a capture-only test file). It builds the production app on a throwaway stack, runs the e2e journeys with fictional users, then captures every route per role (`screens.qa.ts`) and the open menus, dialogs and order states (`guide.qa.ts`) | Screenshots in the guides; confirmation that each screen and label exists as described |
| **Running interface: end-to-end tests** | The Playwright suite in `tests/e2e`, run against the production build in CI. It passed on PR #135 and again in run 209 | Actions marked **UI-test** below are clicked through by these tests |

No production data, account or setting was read or changed. All screenshots show fictional test data (titles such as "E2E halo ring", the users "Asha" and "Priya").

## Status key {#status-key}

| Mark | Meaning |
| --- | --- |
| **UI-test** | Verified in the running interface: an end-to-end test performs this action through the screen and checks the result |
| **UI-screen** | Verified in the running interface: the screen and its controls were captured on the current build. The action's effect is verified from code |
| **Code** | Verified from code and the database only |
| **Open** | Not verified; needs a person to check (see [Open items](#open-items)) |

# Account types and permission levels {#roles-found}

| Account type | Stored as | Found in | Guide coverage | Status |
| --- | --- | --- | --- | --- |
| Client | role `CLIENT` | `core/nav/tabs.ts`, policies | Platform guide → Clients | UI-test |
| Designer | role `DESIGNER` | same | Platform guide → Designers | UI-test |
| Pod lead | role `QC` + `pod_members.member_role = POD_LEAD` | same | Platform guide → Pod leads | UI-test |
| Ops | role `OPS` | `app.require_ops`, transitions | Admin manual → What makes an Admin | Code |
| Sales | role `SALES` | `quote_order_v2`, triage | same | Code |
| Finance | role `FINANCE` | escrow, payouts | same | Code |
| Admin | `SALES` + `OPS` + `FINANCE` (`app.is_admin`); e2e persona: primary OPS plus granted SALES and FINANCE | `user_roles` table | Admin manual (whole) | UI-test |
| `ADMIN`, `SUPER_ADMIN` | Present in the role enum; no policy or function grants them anything | DB enum | Not documented as usable; noted here | Code |
| Signed-out visitor | — | website, `/p/[token]` preview links | Out of scope for the portal guides, except sign-in, sign-up and apply-designer | Code |

**Account states:** `ACTIVE`, `PENDING`, `SUSPENDED` (`set_user_status`). A designer becomes `ACTIVE` on signing the current agreement (`accept_designer_agreement`). Assignability is `app.designer_is_assignable`: role DESIGNER, ACTIVE, not deleted, and signed the current agreement. Covered in Admin manual → Account status, and Exists versus can receive work. **Code**, with the "not signed" labels seen on screen (**UI-screen**).

**Custom permissions:** none beyond the stacked staff roles. The account owner has no special role in the app. No per-user permission flags exist.

# Screen inventory {#screens}

## Admin workspace (Ops, Sales, Finance, Admin) {#inv-admin}

| Screen | Route | How it is reached | What the user can do | Conditions that change it | Guide section | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Queue | `/admin` | Sidebar; home for OPS/SALES/FINANCE | Filter by stage; open orders; row actions; Reconcile; Create order | Lists only team-move stages; alerts appear only when pending | Admin → The Queue | UI-screen |
| All orders | `/admin/orders` | Sidebar | Tabs, search, stage, saved views, Export CSV | Saved views are per browser | Admin → All orders | UI-screen |
| Order (team) | `/orders/[id]` | Any row | Next step; Other actions; brief; conversations; files; timeline | Actions differ by status, role and primary role | Admin → The order page; Running an order | UI-test |
| Create order | `/admin/new-order` | Sidebar; Queue | Find or create a client; place an on-behalf order | Admin or pod lead only | Admin → Place an order for a client | UI-test |
| Messages | `/messages`, `/messages/[orderId]` | Sidebar | Read and reply; forward; mark up | Old messages tab: admins only | Admin → Messages | UI-test |
| Billing | `/admin/billing` | Sidebar | Read figures; open Payouts and Credits; Reconcile with Razorpay | Admin or Finance | Admin → Billing | UI-screen |
| Payouts | `/admin/payouts`, `/admin/payouts/[batch]` | Billing | Export a batch; download CSV; mark a batch paid | Finance or Admin; rows without bank details stay owed | Admin → Pay designers and pod leads | UI-screen (no test performs an export) |
| Credits | `/admin/credits` | Queue alert; Billing | Decide late credits | Admin only | Admin → Decide a late first-look credit | UI-test |
| Clients | `/admin/clients` | Sidebar | Recompute public numbers; search; set an account manager | Admin only | Admin → Clients | UI-screen |
| Access | `/admin/access` (`/admin/users` redirects) | Sidebar | Role; Suspend…; Reinstate; Copy account ID | OPS only; names need the identity look-up | Admin → Staff accounts and roles | UI-screen |
| Pods | `/admin/access/pods` | Access → Pods | Create their pod; change lead; add or remove designers; create a pod | Admin only | Admin → Pods | UI-screen |
| Applications | `/admin/applications` | Sidebar | Accept; Reject (note required); Reopen | OPS or SALES | Admin → Designer applications | UI-screen |
| Leads | `/admin/leads` | Sidebar | Mark handled; Reopen | OPS or SALES | Admin → Website contact leads | UI-screen |
| Designers | `/admin/designers` | Sidebar → More | Add designers; open one | Admin only | Admin → Add designers | UI-test |
| Designer | `/admin/designers/[id]` | Designers | Pod; pay rate; bank details (show in full); documents | Admin only; views logged | Admin → Add designers and subsections | UI-test (pod, bank, document); pay rate: Code |
| Settings | `/admin/settings` | Sidebar | Edit numbers; Save or Discard; switches; developer table | Read-only unless full Admin | Admin → Settings, Feature switches | UI-test (densities); others UI-screen |
| Emails | `/admin/emails` | Settings → Email previews | See mode and templates; Send all to the test inbox | Send: admins only | Admin → Check whether emails reach clients | Code (not in the capture set) |
| Performance | `/pod/performance` | Queue escalation alert | Read figures; resolve escalations | Admin sees all pods | Admin → Resolve an escalation | Code for admin; UI-test for the pod lead |
| Dashboard (older) | `/dashboard` | No link | Summary | Kept for old links | Admin → Screen reference (note) | UI-screen |
| Account | `/account`, `/account/security` | User menu | Identity, time zone, notifications, sign-in security | Sections differ by role | Both guides → Your account page | UI-screen |
| Design kit | `/account/kit` | No link | Component samples | Internal | Admin → Screen reference (note) | UI-screen |

## Pod lead workspace {#inv-pod}

| Screen | Route | Reached by | Can do | Conditions | Guide section | Status |
| --- | --- | --- | --- | --- | --- | --- |
| QC queue | `/qc` | Home for QC | Start review; Continue; Create order | Own pods only | Pod leads → The QC queue | UI-screen |
| QC review | `/qc/[id]` | QC queue | Mark lines; send back; approve; measurements; waivers | Order in own pod; In QC review | Pod leads → Run the QC review, Record measurements | UI-test (waivers: Code) |
| Team board | `/pod/board` | Sidebar | Assign; move; take back; escalate | Own pod | Pod leads → Team board, Assign, Move | UI-screen; assign UI-test; take back, move, escalate Code |
| All orders | `/qc/orders` | Sidebar | Browse pod orders | Own pods | Pod leads (sidebar table) | UI-screen |
| Order (team) | `/orders/[id]` | Rows | Confirm; assign; move; claims | No price shown | Pod leads → Assign, Confirm, Spec claims | UI-test |
| Create order | `/admin/new-order` | Sidebar | On-behalf order into own pod | — | Pod leads → Place an order for a client | UI-test |
| Performance | `/pod/performance` | Sidebar | Filters; downloads; designer pages | Own pods | Pod leads → Performance | UI-test |
| Designer (pod) | `/pod/designers/[id]` | Performance | See rate, history, activity | Own pod's designers | Pod leads → Performance | UI-test |
| Materials | `/materials` | Sidebar | Share; remove | Own pods | Pod leads → Share instructions and charts | UI-test |
| Calculators | `/tools` | Sidebar → More | Gold and diamond weight | — | Designers → Calculators | UI-test |
| Earnings | `/qc/earnings` | Sidebar | Read pod pay; Add bank details | — | Pod leads → Earnings | UI-screen |
| Messages | `/messages` | Sidebar | Both conversations; forward | Pod orders | Pod leads → Talk to the designer or the client | UI-test |

## Designer workspace {#inv-designer}

| Screen | Route | Reached by | Can do | Conditions | Guide section | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Home | `/home` | Sign-in | See Needs you, messages, pod lead, payout, bank prompt | "Finish onboarding" until the agreement is signed | Designers → Home | UI-screen |
| Become a designer | `/onboarding/designer` | Home → Continue | Sign the agreement (or apply, if no profile) | Stages: apply, sign, active, no-doc, mismatch | Designers → Get set up | UI-screen (signing: Code; e2e designers are pre-signed) |
| Open jobs | `/work` | Sidebar | Tabs; open a job | Only assigned jobs | Designers → Home | UI-screen |
| Job | `/work/[id]` | Open job | Start, Pause, Resume; uploads; From 4 views; volume; weights | Status Assigned, In progress or Revision requested | Designers → Start a job … Record the model volume | UI-test |
| Designer check | `/work/[id]/checklist` | Job → Mark the QC sheet | Pass, Fail, Clear lines | Only after Start work | Designers → Pass your designer check | UI-test |
| Final review | `/work/[id]/review` | Job | Send to QC | All requirements met | Designers → Send to QC | UI-test |
| Earnings | `/work/earnings` | Sidebar | Read pay per job | — | Designers → Earnings | UI-screen |
| Payout account | `/settings/payouts` | Account → Payout details; Earnings | Save bank details | Designer or pod lead only | Designers → Earnings and bank details | UI-screen |
| Materials | `/materials` | Sidebar | Open shared files | Own pod | Designers → Pod materials | UI-test |
| Calculators | `/tools` | Sidebar | Calculate | — | Designers → Calculators | UI-test |
| Messages | `/messages` | Sidebar | Team ↔ Designer only | Never the client conversation | Designers → Ask your pod lead | UI-test (anonymity crawl) |

## Client workspace {#inv-client}

| Screen | Route | Reached by | Can do | Conditions | Guide section | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Welcome | `/welcome` | First sign-in with no profile | Save business details; push opt-in | Self sign-ups only | Clients → Your first sign-in | UI-test (website sign-up) |
| Home | `/home` | Sign-in | See actions, draft, messages, orders, credit | — | Clients → Your first sign-in | UI-screen |
| New order | `/orders/new` | Sidebar; Home | CAD or Render; start from a past order; delete a draft | — | Clients → Order; Start again | UI-test |
| Brief | `/orders/[id]/brief` | New order | Three steps; photos; pins; certificates | Fixed once priced | Clients → Order a CAD design | UI-test |
| Review | `/orders/[id]/brief/review` | Brief → Review | Send for a price | Required answers | Clients → Review and send | UI-test |
| Sent | `/orders/[id]/sent` | After sending | — | — | Clients → Review and send | UI-test |
| Orders | `/orders` | Sidebar | Tabs; open | — | Clients → Follow an order | UI-screen |
| Order | `/orders/[id]` | Rows | Pay & start; menu; conversation; revisions; preview links; claims | By status | Clients → Follow, Problem, Cancel, Preview link | UI-test |
| Pay | `/orders/[id]/pay` | Pay & start | Card / UPI checkout; Decline this price | Quoted | Clients → Pay for an order | UI-screen (the Razorpay checkout itself: Open) |
| Review renders | `/orders/[id]/review` | Review | Approve; Send changes; Order a change | Ready to preview | Clients → Review the first look | UI-test (approve); changes: Code |
| Claim | `/orders/[id]/claim` | Spec guarantee | Send the claim | Within the window; one at a time | Clients → Open a spec claim | UI-test |
| Files | `/files` | Sidebar | Download; see locked files | Unlock rules | Clients → Download your files | UI-test |
| Messages | `/messages` | Sidebar | Chat with Your team | — | Clients → Message the team | UI-test |
| Wallet | `/wallet`, `/wallet/invoices`, `/wallet/transactions` | Sidebar | Read credit and payments | Top-ups off | Clients → Wallet | UI-screen |
| Account | `/account`, `/account/security` | User menu | Profile, master instructions, logo, email, device | — | Clients → Master instructions, Emails | UI-test (master instructions) |

## Shared shell {#inv-shell}

| Element | Where | Guide section | Status |
| --- | --- | --- | --- |
| Sidebar groups and collapse | Every role on a computer | Finding your way around | UI-screen |
| Bell, notification panel, Mark all read, toast with Open | Every role | Finding your way around; Notifications | UI-test (`live.e2e.ts`) |
| Search or jump (Ctrl/⌘ K) | Every role | Finding your way around | UI-screen |
| User menu (Account, Sign out) | Every role | Finding your way around | UI-test (sign out, `session.e2e.ts`) |
| Phone bottom bar, raised +, More sheet | Every role on a phone | On a phone | UI-screen |
| Time zone, push Notifications | Account → On this device | Your account page | UI-test (time zone); push: Open |

# Action inventory: admin {#actions}

| Action | Database function | Who may | Notifies or emails | Reversible | Guide section | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Set quote | `quote_order_v2` | SALES (Admin) | Client in-app + Quote ready email | No re-quote | Price an order | UI-test |
| Mark paid | `mark_payment_received` | FINANCE (Admin) | Payment received email | Refund only | Record a transfer payment | UI-test |
| Choose / move pod | `assign_order_pod` | Admin | — | Yes (move again) | Choose or change an order's pod | Code |
| Confirm order | `confirm_order` | Admin, pod lead | Client + pod lead in-app; Order confirmed email | No | Confirm the order | UI-test |
| Assign (exception) | `assign_designer` | Admin, OPS, pod lead | Designer in-app | Move or take back | Assign a designer | UI-test |
| Move job | `reassign_job` | Admin, pod lead | Both designers | Move again | Move a job | Code |
| Take back | `withdraw_job` | Admin, pod lead | Designer + admins | Assign again | Move a job, or take it back | UI-screen (button checked by `on-behalf.e2e.ts`); effect: Code |
| Escalate / resolve | `escalate_job` / `resolve_escalation` | Pod lead / Admin | Admins / pod lead | — | Resolve an escalation | Code |
| Deliver | `transition_order` → DELIVERED | OPS | Client + Files delivered email | No | Deliver and close | UI-test |
| Close | `transition_order` → CLOSED | OPS (or client, no button) | — | No | Deliver and close | Code |
| Refund | `refund_escrow` | FINANCE (primary role for the button) | Client + Order refunded email | No | Cancel an order or refund | Code |
| Resolve dispute | `resolve_dispute` | OPS rework / FINANCE refund | Client + designer | No | Resolve a dispute | Code |
| Decide credit | `decide_sla_credit` | Admin | Client + Credit decided email | No (once) | Decide a late credit | UI-test |
| Decide spec claim | `decide_spec_claim` | Admin, pod lead | Client; pod lead (fix) | No | Decide a spec claim | UI-test |
| Export payouts / mark batch paid | `export_payouts` / `mark_payout_batch_paid` | FINANCE (Admin) | Payees in-app | No | Pay designers and pod leads | Code |
| Release escrow | `release_escrow` | FINANCE (primary role for the button) | Designer in-app | No | Pay the team (note) | Code |
| Add designers | `register_designer` + sign-in account | Admin | **None** | Suspend | Add designers | UI-test |
| Designer pod / rate / bank / documents | `set_pod_member` / `set_designer_rate` / `set_payout_account_for` / `add_designer_document` | Admin | — | Yes | Designer subsections | UI-test (pod, bank, documents); rate: Code |
| Set role / status | `set_user_role` / `set_user_status` | OPS | — | Yes (not the last Ops) | Change role; Suspend | Code |
| Grant extra role | `grant_user_role` | OPS, **no screen** | — | `revoke_user_role` | Make someone a full Admin | Code |
| Create pod, set lead | `create_pod`, `set_pod_member` | Admin | — | Yes | Pods | UI-test (designer pod); create: Code |
| Review application | `review_designer_application` | OPS or SALES | Applicant email | Reopen | Designer applications | Code |
| Lead handled | `set_lead_status` | OPS or SALES | — | Reopen | Website contact leads | Code |
| Account manager | `set_account_manager` | Admin | — | Yes | Clients | Code |
| Settings / switches | `set_app_setting` / `set_feature_flag` | Admin | — | Yes | Settings | UI-test (densities) |
| Master instructions for a client | `set_master_instructions` | Admin | — | Yes | Write master instructions | Code |
| Issue certificate | `issueCertificateAction` | Team | — | — | Issue a missing certificate | Code |
| On-behalf order | `create_order_on_behalf`, `submit_order_on_behalf` | Admin, pod lead | Client (if ticked) | Client cancels | Place an order for a client | UI-test |
| Forward message | `forwardMessageAction` | Team | Recipient | No | Messages | UI-test |

# Hidden prerequisites traced {#prerequisites}

| Situation | What must already be true | Where the guides explain it |
| --- | --- | --- |
| A designer becomes visible to a pod lead | Placed in the pod (`pod_members`) by an Admin. Before that the pod lead sees nothing | Admin → Exists versus can receive work; walkthrough step 5 |
| A designer becomes assignable | Role DESIGNER, ACTIVE, signed the **current** agreement, in the order's pod; over capacity only if blocking is on | Same; Troubleshooting → cannot be assigned |
| A designer knows to sign in | An admin tells them. **No invitation email exists**; accepting an application only sends "we'll follow up" | Admin → Add designers (callout); Applications (callout) |
| A paid order reaches a pod lead | Exactly one led pod (automatic), otherwise an Admin chooses | Choose or change an order's pod; Pods (callout) |
| The first-look clock starts | Paid **and** confirmed | Confirm the order; Troubleshooting → clock |
| A full Admin exists | SALES + OPS + FINANCE; the extra roles need support | What makes someone an Admin; Make someone a full Admin |
| Refund and Release buttons appear | Primary role FINANCE | Known-limit callout "primary-role buttons" |
| A client receives email | `EMAIL_DELIVERY=live`; the client has not opted out (messages and reminders only) | Notifications; Email previews |
| Push notifications arrive | VAPID keys; the 5-minute dispatch job with `CRON_SECRET`; opted in on that device | Notifications |
| A pod lead is notified of a client message | The order has a pod | Notifications (callout); Daily checklist step 7 |
| A payout row exports | The payee has bank details that are not rejected | Payouts; Troubleshooting → stays owed |
| A pod lead can be paid | Bank details via Earnings → Add bank details (not on the Account page) | Payouts; Pod leads → Earnings |
| A client sees the STL / 3DM | The client approved | Files; Troubleshooting → client cannot see the file |

# Discrepancies found in the product {#discrepancies}

These are documented in the guides as they behave today. They may be worth fixing.

1. **No screen grants the second and third staff roles.** `grant_user_role` exists but nothing calls it. Making a full Admin needs support.
2. **Button gates use the primary role.** **Release payout**, **Refund client** and **Refund the client…** need primary FINANCE. **Send back for rework** needs primary OPS. The client-file download gate (`core/files/downloadGate.ts`) admits staff by primary role QC or OPS. A full Admin can never see all of them at once.
3. **Team board empty text** says "An admin adds them from Access". Designers are added on **Designers** and placed in pods on **Designers** or **Pods**.
4. **Suspended designers are labelled "not signed"** in the assign lists. The same flag (`assignable`) covers both cases.
5. **Client messages before an order has a pod notify nobody** (`app.fanout_notifications` notifies the pod lead only). Admins are never notified of client messages or new orders.
6. **Credit decision "Refund"** records the decision but moves no money.
7. **Moving an order's pod does not move its designer.** An Assigned order moved to another pod keeps a designer from the old pod.
8. **No audit-log screen.** Events are visible per order (Timeline) and per designer (Activity) only.
9. **`docs/OPERATIONS.md` is out of date.** It predates the redesign: it says there is no role screen, lists staff routes that changed, and describes per-role queues. These guides supersede it for day-to-day use.
10. **Pod leads have no "Payout details" link on Account**; bank details are reached from **Earnings**.
11. **The client cannot close a delivered order on screen**, although the database allows it.
12. **No invitation email** when designers are added (see the prerequisites above).

# Open items: need human verification {#open-items}

| # | Item | Why it could not be verified here | Suggested check |
| --- | --- | --- | --- |
| 1 | Razorpay card / UPI checkout and the automatic Paid status | The test stack has no Razorpay keys; no test pays by card | One small live or test-mode payment; watch the order turn **Paid** |
| 2 | Emails reaching real inboxes | Email is in test mode by design | **Settings → Email previews → Send all to the test inbox**; check Gmail, Outlook and Apple Mail |
| 3 | Push notifications on phones | Needs VAPID keys and real devices | Turn on **Notifications** on an iPhone (home-screen app) and an Android phone; trigger a message |
| 4 | Payout export CSV and Mark batch paid | No test exports a batch | Export a one-row batch on a test order; check the CSV columns against the bank's upload format |
| 5 | Access role change and suspend | No test drives the Access screen | Change a test account's role and suspend / reinstate it |
| 6 | Applications and Leads decisions | No test drives these screens | Accept and reject a test application; check the emails in the test inbox |
| 7 | Granting SALES / FINANCE to an Ops account | Only possible in the database | Support: confirm the procedure and who approves it |
| 8 | Multi-pod routing ("Paid · choose a pod") | e2e runs with one led pod | After a second pod gets a lead, pay a test order and choose its pod |
| 9 | Capacity blocking on | Off by default | Turn it on briefly on staging; assign over capacity as pod lead (refused) and as admin with a reason |
| 10 | Designer agreement signing on first sign-in | e2e designers are pre-signed | Add a test designer; sign in with their email; sign; check **Active** |
| 11 | Disputes, refunds and release escrow from the screen | No test drives them; the buttons need a primary Finance or Ops role | On staging, with a Finance-primary account |
| 12 | Sign-in on the live site | Production still uses a Clerk development instance | After switching to production keys, sign in once per role |
| 13 | Screens in states the test data lacks (an open dispute, pending credits, escalations) | Not present at capture time | Re-run the guide capture after creating those states on the test stack |
