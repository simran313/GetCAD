## Account types at a glance {#account-types}

Every person signs in to the same portal at **thecadpillar.com/sign-in**. What they see depends on their **role** (the kind of account) and their **status** (whether the account may act). Navigation is not access control: the database checks every action again, so a person never gains an ability by finding a link.

| Account type (as shown on Access) | Workspace label | Sidebar colour | Lands on after sign-in | Main job |
| --- | --- | --- | --- | --- |
| **Client** | Client workspace | White | **Home** (`/home`) | Orders CAD designs and renders, pays, reviews, approves, downloads |
| **Designer** | Designer workspace | White | **Home** (`/home`) | Models the jobs their pod lead assigns, checks them, sends them to QC |
| **Pod lead** (stored as role `QC`) | Pod lead workspace | Black | **QC queue** (`/qc`) | Assigns jobs within their pod, runs quality control, places orders for clients |
| **Ops**, **Sales**, **Finance** | Admin workspace | Black | **Queue** (`/admin`) | Run the business; each has part of the admin powers |
| **Admin** = Ops + Sales + Finance together | Admin workspace | Black | **Queue** (`/admin`) | Everything |

### What makes someone an "Admin" {#what-makes-an-admin}

The product has no single "Admin" role. A person is a **full Admin** when their account holds all three staff roles: **Sales**, **Ops** and **Finance**. One of these is their *primary* role (chosen on the Access screen); the other two are *additional* roles. The Access screen shows additional roles as small "+ Sales" / "+ Finance" tags beside the role menu.

| A staff member who holds only… | Can | Cannot |
| --- | --- | --- |
| **Sales** | Set quotes; work **Applications** and **Leads** | Mark payments, assign, deliver, close, manage people or settings |
| **Ops** | Change roles and suspend accounts on **Access**; assign a designer as an exception; deliver and close orders; send a dispute back for rework; work **Applications** and **Leads** | Quote, record payments, refund, manage designers, pods or settings |
| **Finance** | Mark a transfer received; refund; release escrow; export and mark payouts paid | Quote, assign, deliver, manage people or settings |
| **Sales + Ops + Finance** (full Admin) | All of the above, plus **Designers**, **Pods**, **Clients**, **Settings**, **Credits**, account managers, pay rates, designer documents and bank details | — |

> [!IMPORTANT] Adding the second and third staff roles is not on any screen
> The Access screen sets a person's *primary* role only. Giving an Ops member the additional Sales and Finance roles (to make them a full Admin) needs a database change by technical support. See [Make someone a full Admin](#make-full-admin).

### Account status {#account-status}

| Status (Access screen pill) | Meaning | Can sign in | Can act |
| --- | --- | --- | --- |
| **Active** | Normal account | Yes | Yes |
| **Pending** | Account exists but is not yet active. Designers added by the team start here until they sign the designer agreement. | Yes | Only what their role allows before activation (a designer cannot be assigned work) |
| **Suspended** | Frozen by an Ops member or Admin. Nothing is deleted. | Yes, but their actions are refused | No |

There is no "delete account". Orders, files, money records and the audit history all refer to the person, so the product suspends instead.

### Two ideas used throughout

- **Pod.** A small team: one **pod lead** and the **designers** placed in it. A pod lead sees and assigns only their pod's designers and orders. An order joins a pod when it is paid or confirmed (automatically while only one pod has a lead; otherwise an Admin chooses).
- **Anonymity.** A client never sees who designed their piece; a designer never sees who the client is or what the client paid. To the client, every team member is **"Your team"**. This is enforced by the database, not by hiding buttons.
