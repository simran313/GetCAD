# Phase 5d rollout — admin screens and automatic pods

What ships: the admin workspace from the designs, a Pods screen (no more SQL), and paid orders joining the pod on their own.

## 1. Apply the database change
In the Codespace:

```
npm run db:apply
```

It applies `0048_admin_screens.sql` and the policy `0037_client_managers_rls.sql`.

**What happens at once:** if exactly one pod has a pod lead, every order that is paid or confirmed and has no pod joins that pod now. Your order NT1-RN-C-14 is in a pod already from the SQL you ran.

## 2. Merge
Merge once the checks are green. No new settings.

## 3. What changes for admins
Your menu: **Queue · Create order · All orders · Billing · Clients · Access · Applications · Leads · Account**. `/home` opens the Queue.

- **Queue:**
  - a count for every stage (click one to see those orders);
  - a banner when late-order credits wait for you;
  - "Most urgent first": disputes, then whatever is closest to a client deadline, each with the reason and one button.
  - Paid orders with no pod show **Choose a pod** right there.
- **All orders:** references only (order, client code, designer). Tabs, search, and **Export CSV**.
- **Order page:**
  - the header shows the order, client code, designer and pod lead;
  - the left side has messages, files and history;
  - the right side starts with **Next**: what to do, which pod it is in (with **Move**), and a link to the QC review while in QC;
  - below that are confirm, assign, price and money.
- **Access → Pods:**
  - create pods;
  - set the pod lead (must have the QC role);
  - add, move or remove designers.
  - With exactly one pod, paid orders join it automatically. With more, they wait in the Queue for you to choose.
- **Billing:** money held in orders, paid this month, refunds, credits to decide, every money movement, and team payouts owed. Invoices and wallets come in the payments phase.
- **Clients:** every client by code with orders and spend; pick an **account manager** for each.
- **Account:** shows all your roles; **Sign-in and security** for password and two-step sign-in.
- Applications, Leads, Create order, Payouts and Credits keep working as before with the new headers.

Pod leads, designers and clients see no change apart from orders now reaching the pod lead without SQL.

## 4. Check it
1. Open **Access → Pods**:
   - your pod shows its lead and designer;
   - add or remove a designer to try it.
2. As a client, place and pay a test order, or mark one paid as admin. It appears in the pod lead's **QC queue / Team board** with no SQL.
3. **Queue:** the counters add up; click a counter to see the matching orders.
4. **Clients:** set an account manager and press Save.
5. **Billing:** your test payment shows under money movements.
6. **All orders → Export CSV:** a file downloads.
