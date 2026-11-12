# People: clients, designers, pod leads and staff {#people-chapter}

## Exists versus can receive work {#exists-vs-eligible}

A person can be on the platform for days without being able to do anything useful. Work reaches a designer only when **every** row of this table is true:

| # | Condition | Where you see it | Set by |
| --- | --- | --- | --- |
| 1 | A sign-in account exists for their email | **Access** lists them | **Designers → Add designers**, or the person signing up |
| 2 | Their role is **Designer** | **Access** → Role | **Add designers** sets it |
| 3 | They have signed in and signed the **current** designer agreement | **Designers**: status **Active** (not **Waiting to sign in**); **Pods**: no "Not signed" tag | The designer, on their first sign-in |
| 4 | Their status is **Active**, not **Suspended** | **Access** → Status | Signing the agreement makes it Active; Ops or an Admin can suspend |
| 5 | They are in a pod | **Designers**: Pod is not "Not in a pod" | An Admin, on the designer's page or on **Pods** |
| 6 | The order is in **that** pod | The order's **Pod** | Automatic, or an Admin ([choose a pod](#choose-pod)) |
| 7 | They have room in the shift (only if capacity blocking is on) | Load "270/480 min" in the assign list | **Settings → Designer capacity per shift** |

What each person sees in between:

| Moment | Admin sees | Pod lead sees | Designer sees |
| --- | --- | --- | --- |
| Added, not yet signed in | **Designers**: "Waiting to sign in"; **Access**: Pending | Nothing, until the designer is in their pod. Then the name shows greyed out: "· not signed" (Team board) / "(not signed up)" (order page) | Nothing (they have not signed in) |
| Signed in, agreement not signed | Same | Same | **Home**: "Finish onboarding · Sign the designer agreement…" → **Continue** |
| Agreement signed, no pod | **Designers**: Active, "Not in a pod"; page header warns "…not in a pod yet: their pod lead cannot see or assign them" | Nothing | **Home**: "No open jobs" |
| Active and in a pod | **Designers**: Active, pod name | The name in **Assign to…**, selectable, with their load | Jobs once assigned |
| Suspended | **Access**: Suspended | Greyed out: "not signed" / "(not signed up)" (the same tag is reused) | Their actions are refused |

> [!IMPORTANT] When the agreement text changes
> A designer must have signed the **current** version. Publishing a new version of the designer agreement makes every designer unassignable until they sign again: the onboarding page asks them to.

## Designer applications {#applications}

**Who:** Ops, Sales or Admin. **Open:** sidebar → **Applications** (`/admin/applications`).

Applications come from the website form (**apply-designer**). Each card shows:

- the applicant, their years of experience, **Email**, **Phone** and **Categories**;
- when they **Applied**;
- the **Portfolio** link and any uploaded files.

Tabs: **To review**, **Accepted**, **Rejected**, **All**.

1. Read the card and open the portfolio.
2. Optionally write a **Review note**. A note is required to reject: "Add a short note on why, so the decision is legible later."
3. Click **Accept** or **Reject**. **Reopen** puts a decided application back to **To review**.

> [!WARNING] Accepting does not create an account
> **Accept** only emails the applicant that you will "follow up… with the details and how to set up your account". It does not create a login. To bring them on, follow [Add designers](#add-designers) with the same email, then send them the sign-in instructions.

## Add designers and get them working {#add-designers}

**Who:** Admin. **Open:** sidebar → **More** → **Designers** (`/admin/designers`).

![Designers: add by list; every designer's pod, bank details and status](../assets/screens/admin-designers.png)

1. In **Add designers**, paste one designer per line as `email - Name`, for example `designer@example.com - Ravi Kumar`. A phone number on the line is kept for WhatsApp.
2. Click **Add designers**.
   - The result lists **Added**, **Already on file**, and any line it could not read.
   - Each person gets a sign-in account with role Designer and status **Pending**.
   - An email that belongs to a client or team account is refused.
3. **Tell each designer to sign in.**

   > [!WARNING] No invitation email is sent
   > Adding a designer creates the account silently. Send them the line from their page: "sign in at thecadpillar.com/sign-in with *their email*. A code arrives by email. Then sign the designer agreement."

4. Click the designer's name to open their page, then:
   - [place them in a pod](#designer-pod);
   - [record bank details](#designer-bank-docs);
   - optionally [set an own rate](#designer-rate).
5. When they sign the agreement, their status becomes **Active**. If they are in a pod, the pod lead can now assign them.

**The list** shows each designer's name and email, **Pod**, **Bank · documents** and status:

- Bank: **No bank details**, **To check ··1234**, **Verified ··1234**, **Rejected**.
- Status: **Waiting to sign in**, **Active**, **Pending**, **Suspended**.

![A designer's page: sign-in status, pod, pay rate, bank details and documents](../assets/screens/admin-designer-detail.png)

### Place a designer in a pod, or remove them {#designer-pod}

On the designer's page → **Pod** → choose **Pod lead who sees and assigns this designer** → **Save**. Choose **Not in a pod** to take them out. You can also do this on **Pods** ([below](#pods)). A designer is in one pod at a time.

> [!NOTE] What the pod lead gains
> Placing a designer in a pod is what makes the pod lead able to see them, assign them, and see their pay rate. Nothing else does.

### Set a designer's own pay rate {#designer-rate}

On the designer's page → **Pay rate**:

1. Enter **Rupees a minute** (for example `9.50`).
2. Click **Save rate**.
3. To go back to the standard rate, click **Back to standard (₹8.00)**. It appears only while an own rate is set. The card's pill reads **Own rate** or **Standard**.

The new rate reaches jobs assigned **after** the change; jobs already assigned keep their pay. The pod lead sees the rate but cannot change it. The designer never sees a rate, only what each job pays. The standard rate (₹8 a minute) is in [Settings](#settings).

### Record bank details and identity documents {#designer-bank-docs}

Only admins see these, and every full view and document open is logged.

- **Bank details**, on the designer's page:
  1. Enter **Name at the bank**, **PAN** (format `ABCDE1234F`), **Account number**, **IFSC** (format `SBIN0001234`) and **Account type** (Savings or Current).
  2. Tick **Checked against the bank proof and PAN card** once you have verified them.
  3. Click **Save bank details** (**Replace bank details** if some exist).
  4. Saved details show masked. **Show in full** reveals them once ("Each view is recorded in the audit log."); **Hide** masks them again.
- **Documents:**
  1. Under **What it is**, choose **PAN card**, **Aadhaar (masked copy)**, **Bank proof (cheque or passbook)**, **Photo** or **Other**.
  2. Choose the **Files** (JPG, PNG, WebP or PDF, up to 10 MB each).
  3. Click **Upload**.
  4. Each document has **Open** and **Remove**. Removing deletes the file.
  5. Keep only the masked Aadhaar: the last 4 digits showing.

A designer can also enter their own bank details under **Account → Payout details**. Saving new details sends them for checking again.

## Pod leads and pods {#pods-chapter}

### Make someone a pod lead {#pod-leads}

1. The person signs in once, which creates their account.
2. **Access** → find them → set **Role** to **Pod lead**.
3. The platform creates their pod straight away, named after their first name, for example "Masud's pod".
4. If a pod lead somehow has no pod, **Access → Pods** lists them under **Pod leads without a pod** with **Create their pod**.

A pod lead without a pod can receive no orders and has no designers.

### Create a pod, change its lead, add or remove designers {#pods}

**Open:** **Access** → **Pods** (`/admin/access/pods`). Admin only.

![Pods: each pod's lead and designers; new pods at the bottom](../assets/screens/admin-pods.png)

- The header says how routing works now:
  - "One pod has a lead, so paid orders join it automatically."
  - Or: "With more than one pod, each paid order waits in the Queue until you choose its pod."
- Each pod shows its **designer** and **open order** counts and its **Pod lead**.
  - To change the lead: **Change pod lead…** → **Set**.
  - Designers who have not signed the agreement carry **Not signed**.
  - **Remove** takes a designer out of the pod.
  - **Add a designer…** → **Add** puts one in.
- **New pod:** type the name (for example "Rhino pod") → **Create pod**. Then set its lead and add designers.

> [!WARNING] Before you add a second led pod
> While exactly one pod has a lead, paid orders route to it by themselves. The moment a second pod has a lead, every paid order waits on the Queue ("Paid · choose a pod") until an admin chooses.

## Staff accounts and roles (Access) {#access}

**Who:** Ops or Admin. **Open:** sidebar → **Access** (`/admin/access`).

![Access: every account with its role and status](../assets/screens/admin-access.png)

- **Tabs:** **All**, **Clients**, **Designers**, **Pod leads**, **Admins** (Ops, Sales and Finance).
- **Search accounts** by email, name or reference (ACC… for clients, DSG… for designers).
- **Each row:**
  - the person, with **You** on your own row;
  - their reference;
  - the **Role** menu, with any additional roles as "+ Sales" tags;
  - the status pill;
  - **⋯** (More).
- **Pods** (top) opens the pod screen.

Emails and names come from the sign-in service, and each look-up is logged. If that fails, the page says "Couldn't load emails — showing account references only".

### Change someone's role {#change-role}

1. Find the person. They must have signed in at least once.
2. Choose the new **Role**: **Client**, **Designer**, **Pod lead**, **Ops**, **Sales** or **Finance**.
3. The change saves at once (a message confirms it) and applies on their next page load.

> [!WARNING] Before you change a role
> The change is logged with your account. The **last active Ops account cannot be demoted or suspended**: promote someone else first. Changing a designer to another role makes them unassignable. Making someone **Pod lead** creates a pod for them.

### Make someone a full Admin {#make-full-admin}

A full Admin needs Sales, Ops and Finance. The Access screen sets only one, the primary role.

1. Set their primary role on **Access**. Choose **Ops**: refunds and releases then need a Finance-primary person; see [why](#primary-role-buttons).
2. Ask technical support to add the other two roles as additional roles.
3. Check: the person's **Account** page lists all three, and **Access** shows "+ Sales" "+ Finance" tags.

> [!LIMIT] Not on any screen
> Additional roles cannot be granted or removed from the portal. Treat the request as a support ticket, and say who approved it.

### Suspend or reinstate an account {#suspend}

1. **Access** → the person's row → **⋯** (More) → **Suspend…**.
2. Read the dialog: "Suspend, never delete: their orders, files and history stay as they are. You can reinstate them from the same menu."
3. Click **Suspend account**.
4. To undo it: **⋯** → **Reinstate**.

![The row menu: Copy account ID, Suspend…](../assets/screens/admin-access-row-menu.png){.narrow}

![Suspending asks first; nothing is deleted](../assets/screens/admin-access-suspend-dialog.png){.narrow}

**⋯** → **Copy account ID** copies the internal ID, which technical support asks for.

A suspended designer cannot be assigned. Jobs they already hold stay with them until you [move or take them back](#move-take-back).

## Clients {#clients}

**Open:** sidebar → **Clients** (`/admin/clients`). Admin only.

![Clients](../assets/screens/admin-clients.png)

- **Public numbers · last 30 days.** These are the figures the public **Results** page would show:
  - first looks on time, approved first time, late credits, claims upheld, designs delivered.
  - They are computed every Monday; **Recompute** updates them now.
  - They stay hidden from the website until the **Public results page** switch is on ([Settings](#feature-switches)).
- **Where clients come from:**
  - **How they heard** (asked at sign-up);
  - **First visit from** (the first web link or campaign);
  - **Last 30 days**: Briefs started, Briefs sent, Payments, First looks opened, Approved.
- **Search by client code.**
- **The table:**
  - **Client** (code and join date);
  - **Orders** (and how many open);
  - **Paid** (US dollars);
  - **Last order**;
  - **Account manager**.

**Name an account manager.** Choose a team member in the client's **Account manager** menu. It saves at once ("NJ1 is now looked after by …"). Choose **Unassigned** to clear it. The header counts clients without one.

**Client names** are not on this page; clients are listed by code. To find a client by name, email or phone, use the search on **Create order**.

## Website contact leads {#leads}

**Who:** Ops, Sales or Admin. **Open:** sidebar → **Leads** (`/admin/leads`).

Messages from the website contact form, with name, email, what they are ("Jewelry business", "CAD designer", "Other") and the message. Tabs: **New**, **Handled**, **All**.

1. Reply from your own email.
2. Click **Mark handled**. **Reopen** brings it back to **New**.
