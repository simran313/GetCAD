# Money {#money}

## Prices, categories and pay {#pricing}

**Client prices** are in US dollars. The website shows one price, "from $35 a design". The bands below are the internal defaults the quote form uses when **Price $** is left empty.

| Band | Categories | Typical pieces | Price |
| --- | --- | --- | --- |
| Standard | A–C | Bands, solitaires, simple pendants and earrings | $35 |
| Complex | D–F | Halo, pavé, multi-part, bracelets | $85 |
| Sculpted / figurative | G–L | Signets with figures, sculpted, large multi-part | From $120, quoted; deadline in hours set with the price |

**Team pay** is in Indian rupees. It is set from the **category's minutes**, never from the price, so the price cannot be worked back from anyone's pay.

| | Rule | Default | Changed on |
| --- | --- | --- | --- |
| Designer pay | Category minutes × the designer's rate | ₹8 a minute (A ₹120, C ₹360, D ₹480, L ₹3,840) | **Settings → Money → Designer pay**; one designer's own rate on their page |
| Pod pay (to the pod lead who ran QC) | A share of the designer's pay on the job, with a minimum | 50%, at least ₹300 | **Settings → Money → Pod pay**, **Least pod pay** |
| Payout warning | Flags a quote when designer + pod pay exceed this share of the price | 40% | **Settings → Money → Payout warning** |
| Exchange rate | Fixed rate used for that share | ₹84 per $1 | **Settings → Money → Exchange rate** |

Pay is set at quote with the standard rate. It is set again at the assigned designer's rate when the job is assigned or moved. A rate or setting change reaches jobs assigned **after** it. QC send-backs are not paid extra. A change the client orders after approval is a new job at its own category.

## Billing {#billing}

**Who:** Admin or Finance. **Open:** sidebar → **Billing** (`/admin/billing`).

![Billing: money in, payouts owed, credits](../assets/screens/admin-billing.png)

**Figures across the top:**

| Figure | Counts |
| --- | --- |
| **paid on open orders** | Card payments and recorded transfers still held on orders not yet released or refunded (US dollars) |
| **paid in this month** | Payments recorded since the 1st of this calendar month (UTC) |
| **refunded this month** | Refunds recorded since the 1st of this calendar month |
| **late credits to decide** | Pending first-look credits |

**The rest of the page:**

- **Money movements · newest first.** Up to 200 rows: **Date**, **Order** (with the client code), **Movement** (**Paid**, **Released**, **Refunded**, **Processor fee**, **Chargeback**, **Reversal**) and **Amount** with + or −. Click a row to open the order.
- **Team payouts.** Rupees owed and not yet exported, rupees exported to the bank file, and a link to **Payouts**.
- **Late-order credits.** How much is waiting for a decision, and a link to **Credits**.
- **Reconcile with Razorpay** (top right) opens the Razorpay dashboard in a new tab.

> [!LIMIT] No invoices or wallets yet
> The platform has no numbered invoices and no client wallet top-ups. Send an invoice from your accounting tool. Record Wise, bank and PayPal payments on the order with **Mark paid**. The client's **Wallet** shows their credit and payments only.

## Pay designers and pod leads {#payouts}

**Who:** Finance or Admin. **Open:** **Billing** → **Payouts** (`/admin/payouts`).

Pay becomes **owed** when an order is **Closed**: one row for the designer and one for the pod lead who ran QC.

![Payouts: owed rows, then batches](../assets/screens/admin-payouts.png)

1. **Owed** lists each row: the payee, the order, the amount, and their bank state (**bank verified**, **bank not yet verified**, **bank rejected**).
2. Click **Export N as a batch (₹total)**. "Rows without usable bank details stay owed."
3. The batch appears below with its reference and "exported …, not yet marked paid". Click **Download CSV**.
4. Pay each line by bank transfer from the CSV.
5. Back on **Payouts**, click **Mark batch paid**.

> [!WARNING] Before you press Mark batch paid
> Every payee in the batch is notified "Your pay of ₹… for this job was sent." It shows under their **Earnings** as paid. Press it only after the transfers have gone out. A batch cannot be un-marked.

**Bank details:**

- Designers enter their own under **Account → Payout details**, or an admin records them on the designer's page.
- Pod leads enter theirs from **Earnings** → **Add bank details**.
- A payee with no bank details, or rejected ones, stays owed until fixed.

> [!NOTE] Release payout (escrow) is a separate, older step
> Closed orders also show **Ready for payout**, with **Release** on the Queue and **Release payout** on the order (Finance as primary role only). Releasing escrow records the money leaving escrow. It needs a verified payout account for both payees. It is not needed to pay people through **Payouts**.

## Exports and reports {#exports}

| What | Where | Format |
| --- | --- | --- |
| Every order | **All orders** → **Export CSV** | CSV |
| A payout batch | **Payouts** → the batch → **Download CSV** | CSV |
| A pod's performance (designers' output, working time, turnaround, quality) | **Performance** (pod lead view, also reached from an escalation) → download buttons | Excel, CSV, PDF |
| Public numbers and client sources | **Clients** (on screen) | — |
| An order's certificate, weight sheet, summary sheet | The order's **Order** card | PDF |
