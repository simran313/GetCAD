# Phase 3b rollout — revisions, change orders, payouts

What ships: migration `0042`, policy `0033` (2 files); the Revisions panel on the order page; `/admin/payouts` with CSV download; the designer's 60-minute reminder; push wording for every notification.

## 1. Apply and merge
```bash
git fetch origin
git checkout claude/gracious-hopper-amum18
git reset --hard origin/claude/gracious-hopper-amum18
DATABASE_URL="postgresql://...your address..." npm run db:status    # 2 pending
DATABASE_URL="postgresql://...your address..." npm run db:apply     # applied 2 file(s)
```
Then merge the pull request straight away (the new screens need these 2 files).

## 2. How it now works
| Situation | Who | What happens |
| --- | --- | --- |
| Client wants changes on a preview | Client | **Revisions** panel → write the note → **Ask for changes (round 1 of 2)**. Order goes back to the designer as a new version. Designer and pod lead are notified. |
| 3rd change, or more than 14 days after first look | Client | **Order a change (new order)**. A new order opens with the same brief plus the change, in the same pod, waiting for a quote. If the old one was still a preview, it is approved. |
| Change after approval | Client | Same button, from an approved / delivered / closed order. |
| Change order arrives | Admin | Quote it like any order (its own category), then confirm, assign. **Assign the designer who did the original**: only they can see its files. |
| Order closes | System | Designer pay and QC pay become **owed** at the amounts locked at quote. A QC send-back never doubles it. |
| Paying people | Admin / finance | **Staff console → Payouts →** **Export** → **Download CSV** → pay by bank transfer → **Mark batch paid**. Each payee is notified. |
| 60 min before designer due | System | Designer gets "Due soon". |

QC send-backs do not use the client's rounds.

## 3. Before the first payout
Each designer and pod lead must add bank details in the app at `/settings/payouts`. Without them their rows stay **owed** and are left out of the export. The CSV holds full account numbers: download it only on your own computer and delete it after the transfer. Every download is logged.

## 4. Closing an order
After the client approves: on the order page press **Delivered**, then **Closed**. Closing is what creates the pay rows.

## 5. Quick test on the live site
1. Take a test order in **Client preview** (from the Phase 3a test).
2. As the client: Revisions → write "make the band thinner" → Ask for changes. The order shows **Revision requested**, version 2; the designer sees the note in the Revisions panel.
3. Walk it back to preview (designer submits, pod lead passes), then as the client press **Approved**.
4. As admin: **Delivered** → **Closed**. Open **Payouts**: two owed rows (designer, QC).
5. With bank details in place: Export → Download CSV → check amounts → Mark batch paid.
6. As the client, on the closed order: Order a change → a new order opens with "A change to …" at the top.
