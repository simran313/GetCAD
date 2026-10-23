# Phase 2 rollout — quote, confirmation and the 6-hour clock

What ships: migrations `0039`, `0040`, policy `0031` (3 files), the new quote panel, **Confirm order**, **Mark paid**, the first-look line on every order, and `/admin/credits`.

## 1. Before you merge
1. Supabase → Database → **Extensions** → `pg_cron` is **enabled**. If you enable it now, do it before step 2.
2. In the Codespace terminal:
   ```bash
   git fetch origin
   git checkout claude/gracious-hopper-amum18
   git reset --hard origin/claude/gracious-hopper-amum18
   DATABASE_URL="postgresql://...your address..." npm run db:status    # 3 pending
   DATABASE_URL="postgresql://...your address..." npm run db:apply     # applied 3 file(s)
   ```
3. Merge the pull request straight after. The old quote form calls the old function, which still works, so a gap of a few minutes is harmless.

## 2. Check the every-minute sweep is scheduled
Supabase → SQL Editor:
```sql
SELECT jobname, schedule, command, active FROM cron.job;
```
You should see `sla-sweep | * * * * * | SELECT public.sla_sweep() | true`.

If there is no row (pg_cron was enabled after step 1), run once:
```sql
SELECT cron.schedule('sla-sweep', '* * * * *', 'SELECT public.sla_sweep()');
```

To see it running a few minutes later:
```sql
SELECT status, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

## 3. How the team uses it
| Who | Where | What |
| --- | --- | --- |
| Admin | Order page → Payment | **Set quote**: pick the category; leave the price empty for the band price ($55 A–C, $49 first design once per client, $85 D–F, from $120 G–L); G–L need a deadline in hours. After quoting, the payment panel shows payouts as a share of the price, in red above 40 %. |
| Client | Order page | Pays by card as before, or by Wise / bank / PayPal using your details. |
| Admin | Order page → Payment | **Mark paid** for a Wise / bank / PayPal / other payment, with its reference. |
| Admin or pod lead | Order page → First look | **Confirm order** once the brief is complete. The clock starts when the order is both paid and confirmed. |
| Everyone | Order page → First look | Shows "waiting for payment / confirmation", the due time, "on time" or "missed". |
| Admin | Staff console → **Late-order credits** | Decide each missed standard order: apply to next order, refund, partial (amount + reason) or reject (reason). The client sees the credit only after this. Refunds are sent by hand until Phase 9. |

## 4. Quick test on the live site
1. As a client, create and submit a small test order.
2. As admin, set quote with category C. It should show $55 (or $49 if it is that client's first design).
3. Mark paid (method "Other", reference "TEST"). First look shows "waiting for confirmation".
4. Confirm order. First look shows "due by …" six hours from now.
5. Cancel or leave the test order; it will be swept as missed after 6 hours and appear in Late-order credits — reject it with reason "test".
