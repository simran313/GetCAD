# Settings, switches and audit history {#system}

## Settings {#settings}

**Open:** sidebar → **Settings** (`/admin/settings`). Only a full Admin can change values; other staff see "Read-only. An admin (Sales + Ops + Finance) can change these."

"The numbers the platform runs on. Changes apply from now on and are recorded in the audit log." Each section shows **Last changed by** a person and a time.

![Settings](../assets/screens/admin-settings.png)

| Section | Setting | Unit | Default | Effect |
| --- | --- | --- | --- | --- |
| First look and revisions | **First-look promise** | hours | 6 | The standard (A–F) first-look deadline, counted from payment and confirmation |
| | **Time kept for QC** | minutes | 60 | The designer's deadline is the first look minus this |
| | **Designer capacity per shift** | minutes | 480 | Category minutes one designer may hold at once before a warning |
| | **Revision rounds included** | rounds | 2 | Client change rounds included in the price |
| | **Revision window** | days | 14 | Days after the first look that included rounds stay open |
| | **Spec-claim window** | days | 30 | Days after delivery a client can open a claim |
| Money | **Designer pay** | ₹ per minute | 8.00 | The standard rate |
| | **Pod pay** | % | 50 | Share of the designer's pay that goes to the pod lead |
| | **Least pod pay** | ₹ per job | 300 | Minimum pod pay on any job |
| | **Exchange rate** | ₹ per $1 | 84.00 | Used for margins and the payout warning |
| | **Payout warning** | % | 40 | Flag a quote when team pay passes this share of the price |
| | **Metal price for estimates** | $ per gram | empty | Leave empty to show no metal estimate |
| Metal densities | **10K gold**, **14K gold**, **18K gold**, **Platinum 950**, **Sterling silver 925** | g/cm³ | 11.6, 13.1, 15.6, 21.4, 10.4 | Turn a model's volume into weights on the weight sheet |
| Spec sheet defaults | **Minimum wall**, **Minimum prong** | mm | 0.80, 0.80 | Printed on every spec sheet unless the order says otherwise |

**To change values:**

1. Edit one or more fields. A bar appears at the bottom: "N changes not saved", listing each change as before → after.
2. Click **Save changes**, or **Discard**. Invalid values are highlighted: "Fix the highlighted values first".
3. A message confirms it: "Change saved" or "N changes saved". A refused value says why.

> [!WARNING] Before you save a money or density change
> Money changes apply to jobs assigned **after** the save. Density changes alter weight sheets made from then on. Every change is logged with your name.

**Developer · raw keys and stored values** (folded at the bottom) lists every stored key, its raw value and description. It is for technical support.

## Feature switches {#feature-switches}

On **Settings** → **Features**. "A switch applies at once. The database honours it too, not just this screen."

| Switch | Off (current default) | On |
| --- | --- | --- |
| **Block assignment over shift capacity** | Over-capacity assignments only warn | Refused, except for an admin who gives a reason |
| **Automatic late-order credit** | An admin decides each missed first look | Not available to rely on yet: keep off |
| **Payouts through Razorpay** | Export the batch and pay by bank transfer | Not connected yet: keep off |
| **Wallet, credit packs and plans** | Off | Not built for clients yet: keep off |
| **One-page render brief** | (on by default) render orders use a one-page brief | — |
| **Public results page** | `/results` hidden | Turn on after 30 days of real data |
| **Rush delivery** | Off | Not defined yet: keep off |
| **Dental** | Off | A separate brand, not part of this platform |

> [!WARNING] Switches act immediately
> There is no confirmation and no Save button: a switch changes behaviour for everyone at once. Note what you changed and why.

## Audit history: who did what {#audit}

Every decision is written to the audit history with the person who made it. That covers quotes, payments, assignments, moves, QC marks and decisions, credits, payouts, role and status changes, setting changes, bank-detail views and document opens.

Where to see it on screen:

- **An order's Timeline:** every status change and event on that order.
- **A designer's page in Performance** (pod lead view): **Activity**, the last 200 events.
- **Settings:** **Last changed by** per section.

> [!LIMIT] No audit browser
> There is no screen that lists the whole audit history, for example "every role change last month". Ask technical support to query it, and give the person, the period and the kind of event.
