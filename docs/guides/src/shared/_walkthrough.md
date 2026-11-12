This walkthrough follows one fictional order through every account. The names are invented: the client **Northline Jewelers** (client code `NJ1`), the piece **"Aurora halo ring"**, a pod called **Rhino pod**, and two designers, **DSG-0007** (new) and **DSG-0003**. The order includes one blocked handoff, one QC send-back and one client revision round.

> [!NOTE] How to read each step
> **Who** acts, **the control** they use, **what changes** on their screen, **who receives it** and what they see, and **how the admin checks** it.

### Step 1 · The client sends the brief {#walk-1}

- **Who:** the Northline buyer (Client).
- **Control:** **New order** → **CAD design** → fill **The piece**, **Stones** and **Size & metal** → **Review** → **Send for a price**.
- **Changes:** the page "Sent for a price" opens. On the order, the status sentence reads "We're pricing your brief".
- **Received by:** nobody gets a notification. The client receives the "Order received" email.
- **Admin checks:** **Queue**. The **Awaiting quote** counter goes up by one, and the order appears under **Needs a move** with **Price it**.

### Step 2 · The team prices it {#walk-2}

- **Who:** an Admin (or a Sales member).
- **Control:** **Queue** → **Price it** (opens the order) → **Next step** card → **Category** `C`, **Price $ (optional)** left empty (the band price, $35) → **Set quote**.
- **Changes:** the status pill becomes **Quoted**, and the order card shows **Price**, **Designer pay** and **Pod pay**.
- **Received by:** the client gets an in-app notification "Your order has been quoted." and the "Quote ready" email. Their order shows "Your price is ready" with **Pay & start**.
- **Admin checks:** the Queue counter **Awaiting payment**.

### Step 3 · The client pays {#walk-3}

- **Who:** the client, by card or UPI. **Or**, for a Wise transfer, an Admin or Finance member.
- **Control (card):** **Pay & start** → the pay button → Razorpay checkout. **Control (transfer):** the order → **Next step** → **Paid by** `Wise transfer`, **Reference** (the transfer reference) → **Mark paid**.
- **Changes:** the status becomes **Paid**. With only one pod led, the order joins **Rhino pod** automatically.
- **Received by:** the client gets the "Payment received" email and sees "Paid · we're checking your brief".
- **Admin checks:** the Queue row now reads "Paid · confirm the order to start the clock", with **Confirm**.

### Step 4 · The admin confirms the brief {#walk-4}

- **Who:** an Admin (a pod lead may also confirm).
- **Control:** the order → **Next step** → **Confirm order**.
- **Changes:** the first-look clock starts (6 hours for category C). The Queue row reads "Paid and confirmed · the pod lead assigns a designer".
- **Received by:** the client is notified "Your order is confirmed and paid — the first-look clock has started." and gets the "Order confirmed" email with the due time. The pod lead is notified "An order in your pod is confirmed and paid — the clock is running."
- **Admin checks:** the **First look** column on the Queue shows the time left.

### Step 5 · Blocked handoff: the new designer cannot be chosen {#walk-5}

- **Who:** the Rhino pod lead.
- **Control:** **QC queue** → **Team board** → the order under **Unassigned** → **Assign to…**.
- **What they see:** DSG-0007 is listed but greyed out, marked "· not signed" ("(not signed up)" on the order page). The admin added DSG-0007 to the pod yesterday, but DSG-0007 has not yet signed the designer agreement.
- **Resolution:** the pod lead writes to an admin, or assigns DSG-0003 instead. The admin opens **Designers** → DSG-0007, sees **Waiting to sign in**, and sends DSG-0007 the sign-in instructions shown on that page. Once DSG-0007 signs in and presses **I have read and agree — sign**, the status becomes **Active** and the name is selectable.
- **Admin checks:** **Designers**. The status pill reads **Active**, and the **Pods** page no longer says "Not signed".

### Step 6 · The pod lead assigns {#walk-6}

- **Who:** the pod lead.
- **Control:** **Assign to…** → DSG-0007 · `0/480` → **Assign**.
- **Changes:** the job moves into DSG-0007's column on the team board. The order says "Assigned to DSG-0007 · not started yet". Designer pay is set at DSG-0007's rate.
- **Received by:** DSG-0007 is notified "You have been assigned to an order." The job appears on their **Home** under **Needs you** as "New job".
- **Admin checks:** the Queue counter **With designer**. On the order, **Designer** shows DSG-0007.

### Step 7 · The designer builds version 1 and sends it to QC {#walk-7}

- **Who:** DSG-0007.
- **Control:** **Open jobs** → the job → **Start work**. Upload the four files (Rhino 3DM, STL, Render views, Technical sheet). Save the **Model volume**. Fill **Gold weight and diamonds** → **Save weights**. Mark every **Designer check** line **Pass**. Then **Final review and send to QC** → **Send to QC**.
- **Changes:** the job reads "With your pod lead for QC".
- **Received by:** the pod lead is notified "A job in your pod is ready for QC." The client is notified "Work has been submitted on your order." and sees "We're checking the design".
- **Admin checks:** the Queue counter **In QC**.

### Step 8 · QC sends it back once {#walk-8}

- **Who:** the pod lead.
- **Control:** **QC queue** → **Awaiting QC** → **Start review**. Under **All measurements**, type a finding and a remark, then **Fail**. Then **Send back · revision needed**.
- **Changes:** the status becomes **Revision requested**. QC send-backs do not use up the client's revision rounds.
- **Received by:** DSG-0007 sees the failed line under **Pod lead notes** on the job, then presses **Start work** again and sends version 2.
- **Admin checks:** the order **Timeline** shows the send-back. The Queue counter is back to **With designer**.

### Step 9 · QC passes it to the client {#walk-9}

- **Who:** the pod lead.
- **Control:** mark all five **QC manager** lines **Pass** → fill **Measured specification** → **Record measurements** → **Approve · pass to client**.
- **Changes:** the status becomes **Ready to preview**. The first look is recorded and the clock stops: on time.
- **Received by:** the client is notified "Your order is ready to preview." and gets the "First look ready" email.
- **Admin checks:** the Queue counter **With client**. The **First look** column says **Done**.

### Step 10 · The client asks for one change {#walk-10}

- **Who:** the client.
- **Control:** **Review** → under **Ask for changes**, describe the change (sizes in mm, which view, which part) → **Send changes**.
- **Changes:** the client's page shows "1 of 2 rounds used" and "Your changes are being made".
- **Received by:** DSG-0007 and the pod lead are notified "Changes requested (round 1)…". The job comes back as "Changes requested" with **Changes the client asked for**.
- **Admin checks:** the order's **Revisions** section lists round 1. DSG-0007 sends version 3, and QC passes it as in steps 7–9.

### Step 11 · The client approves {#walk-11}

- **Who:** the client.
- **Control:** **Review** → **Approve this design**.
- **Changes:** the status becomes **Approved**. The STL, 3DM and summary sheet unlock in the client's **Files**.
- **Received by:** DSG-0007 and the pod lead are notified "The client approved…". The client gets the "Design approved" email.
- **Admin checks:** the Queue row reads "Client approved · deliver the files" with **Deliver**.

### Step 12 · The team delivers and closes {#walk-12}

- **Who:** an Admin (or an Ops member).
- **Control:** the order → **Next step** → **Delivered**. Later, **Next step** → **Closed**.
- **Changes:** the order goes from **Delivered** to **Closed**. Closing creates the designer's and the pod lead's pay as **Owed**.
- **Received by:** the client gets "Your order has been delivered." and the "Files delivered" email.
- **Admin checks:** the Queue counter **Ready for payout**. **Payouts** lists two owed rows for this order.

### Step 13 · The team is paid {#walk-13}

- **Who:** an Admin (or a Finance member).
- **Control:** **Billing** → **Payouts** → **Export … as a batch** → **Download CSV**. Pay by bank transfer from the CSV, then **Mark batch paid**.
- **Received by:** DSG-0007 and the pod lead are notified "Your pay of ₹… for this job was sent." The amount shows under their **Earnings**.
- **Admin checks:** the batch no longer says "not yet marked paid".
