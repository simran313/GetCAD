# Pod leads {#pod-lead}

For the lead of a pod. You assign your pod's jobs to its designers, check every version before the client sees it (QC), keep the team moving, and can place orders for clients. You see the designer's pay and your pod pay on each job, but never the client's price or payments.

## What do you need to do? {#pod-tasks}

- [Find what needs a check](#pod-qc-queue)
- [Assign a job to a designer](#pod-assign)
- [Confirm an order's brief](#pod-confirm)
- [Run the QC review: pass or send back](#pod-qc-review)
- [Record measurements and client waivers](#pod-measure)
- [Move a job, take it back, or escalate it](#pod-move)
- [Place an order for a client](#pod-create-order)
- [Watch performance and bottlenecks](#pod-performance)
- [Share instructions and charts with the pod](#pod-materials)
- [Talk to the designer or the client](#pod-messages)
- [Re-measure a spec claim](#pod-claims)
- [See your earnings](#pod-earnings)

## Your first sign-in {#pod-first-login}

Sign in as described in [Signing in](#signing-in). You land on the **QC queue**. Your sidebar:

| Group | Items |
| --- | --- |
| Work | **QC queue**, **Team board**, **All orders**, **Create order** |
| Inbox | **Messages** |
| Team | **Performance**, **Materials** |
| Money | **Earnings** |
| More | **Calculators** |

If your sidebar is empty of designers, or the board says "No designers in your pod yet", ask an admin to place designers in your pod. If you have no pod at all, an admin uses **Create their pod**.

## The QC queue {#pod-qc-queue}

**QC queue** (`/qc`) shows only what needs a check, in your pod(s):

- **Awaiting QC · oldest first**, with **Start review**;
- **In your review**, with **Continue**.

Each row shows the designer, the version, when it was submitted and how many lines you have marked. The figures across the top count jobs **waiting for QC**, **in your review**, orders **paid, not yet assigned**, and your **QC earnings · month**.

![The QC queue](../assets/screens/pod-qc-queue.png)

## The Team board {#pod-board}

**Team board** (`/pod/board`) is "who is working on what":

- the **Unassigned** column, with minutes waiting;
- one column per designer, with their reference and a load bar ("Free · 0 of 480 min", or "270 of 480 min", or "over the shift");
- each job card with its status (**Paused** when paused) and its timer.

![The Team board, with a job's Move, take back or escalate opened](../assets/screens/pod-board-job-actions.png)

## Assign a job to a designer {#pod-assign}

**Before you start:**

- the order is **Paid** and in your pod;
- it has a category (otherwise the card says **Set a category first**);
- ideally it is confirmed, so the client's clock is running.

1. **Team board** → **Unassigned** → the job → **Assign to…**.
2. Choose the designer. Each option shows their open and shift minutes, for example "DSG-0003 · 120/480".
   - Greyed options marked "· not signed" are designers who have not signed the agreement, or who are suspended. You cannot choose them; ask an admin.
3. Click **Assign**.

You can also assign from the order page: **Next step** → **Assign a designer** → **Designer** → **Assign**.

![Assigning from the order page](../assets/screens/pod-order-assign.png)

**What happens:**

- The designer is notified "You have been assigned to an order."
- The job moves into their column.
- The order reads "Assigned to … · not started yet".
- Pay is set at that designer's rate.
- Going over the shift only warns, unless an admin has switched on capacity blocking.

> [!NOTE] One order, one designer
> Once a job has a designer, it cannot be assigned again. [Move it or take it back](#pod-move) instead.

## Confirm an order's brief {#pod-confirm}

When the brief is complete and any questions are answered, open the order and click **Confirm order**. If the order is paid, this starts the client's first-look clock. It happens once and cannot be undone.

## Run the QC review {#pod-qc-review}

You are notified "A job in your pod is ready for QC." Open **QC queue** → **Start review**.

The page shows:

- **First look due**;
- the **Version** tabs and the designer's files with **Download**;
- the **QC checklist** with the **QC manager** lines;
- the **Decision**;
- **Measured specification**;
- **Client waivers**;
- **The brief**;
- **References**.

The designer has already passed all nine of their lines ("Signed by DSG-… at submission").

![The QC review](../assets/screens/pod-qc-review.png)

**Mark the five QC manager lines:**

1. overall design look;
2. diamond sizes, shapes and colours;
3. all measurements;
4. setting type, metal colour and karat;
5. the client's special remarks.

For each line:

- enter a **Value or finding** and a **Remark** if useful;
- click **Pass** or **Fail**;
- **Clear** undoes a mark.

**Then decide:**

- **Send back · revision needed.**
  1. Fail at least one line, or write a **Revision note** (required when no line failed).
  2. The panel shows "Revision needed · the designer receives these failed lines:", plus a box for "Anything else for the designer".
  3. Click **Send back · revision needed**.
  4. The order becomes **Revision requested**, and the designer sees your lines under **Pod lead notes**. A send-back does not use the client's change rounds.
- **Approve · pass to client.**
  1. The button opens once every QC manager line has passed and, for CAD, the measurements are recorded. It reads "Approve needs every QC manager line passed" until then.
  2. Click **Approve · pass to client**.
  3. The client is notified and emailed "First look ready", and the clock stops.

> [!WARNING] Before you approve
> The client sees this version at once. Your decision and the time are recorded against your account and printed on the QC certificate. Your pod pay for the job is shown beside the button.

## Record measurements and client waivers {#pod-measure}

Under **Measured specification** ("Needed to pass · goes on the certificate"):

1. Enter **Minimum wall (mm)**, **Minimum prong (mm)**, **Inner diameter (mm)**, **Mesh tolerance (mm)**, **Ring size** (for example `US 7`), **Open edges** ("Must be 0 to pass"), and each **Stone seat**, for example "Centre oval 9 × 7". The designer's model volume and the minimums are shown for reference.
2. Click **Record measurements**. Click **Update measurements** to change them later.

**Client waivers.** When the client asks for less than a minimum (for example a 0.6 mm wall):

1. Choose **Spec…**.
2. Enter **What the client asked for** and a **Note**.
3. Click **Add waiver**.

The waiver is printed on the certificate, and a later spec claim on it is not covered.

## Move a job, take it back, or escalate it {#pod-move}

**Team board** → the job card → **Move, take back or escalate**. The same controls are on the order page under **Other actions ›**.

- **Move:**
  1. Choose **Move to…**.
  2. Enter **Why it moves**. It is required once work has started.
  3. Click **Move job**. "Job moved" confirms it.
  4. The new designer presses **Start work**.
- **Take back:**
  1. Enter **Why it is taken back** (required once started).
  2. Click **Take back from the designer**.
  3. The order waits for a designer again: "Taken back · waiting for a designer". The designer and the admins are notified.
- **Escalate:**
  1. Enter **What needs an admin**.
  2. Click **Escalate**. "Escalated to admin" confirms it.
  3. Every admin is notified. When one resolves it, you are notified, and **Performance → Escalated to admin** shows the resolution.

## Place an order for a client {#pod-create-order}

**Create order** opens the same form admins use: find or add the client, describe the order, add at least one screenshot of the request, **Place order**. The order goes into your pod. The steps are in the Admin Operations Manual ("Place an order for a client"); the [walkthrough](#together) shows where it fits.

## Performance {#pod-performance}

**Performance** (`/pod/performance`): "Live load, bottlenecks and each designer's output, from recorded work only. Compared with the period before."

- **Filters:** **Period**, **From**, **To**, **Designer** (**Everyone**), **Category** (**All**), **Job type** (**All**), then **Apply**. **Reset** clears them. The download buttons give **Excel**, **CSV** and **PDF**.
- **Figures:** **Submitted to QC**, **Passed QC**, **On time**, **First-pass QC**, **Avg working time**, **Avg turnaround**.
- **Bottlenecks now:**
  - **Waiting for a designer**, **Waiting for QC**, **Overdue to QC**, **Paused**;
  - **Idle designers**;
  - an **Uneven load** hint, with a link to the **team board**.
- **Escalated to admin**: your open escalations.
- **Designers**: each designer's **Avg work**, **Avg turnaround**, **On time**, **First-pass QC**, **QC returns** and **Client changes**. Click one for their page.

A designer's page shows:

- their pay rate ("₹8.00 a minute", or "own rate, set by an admin"); you can see it but not change it;
- what they hold now;
- their **Job history** and **Activity** (the last 200 events).

## Share instructions and charts {#pod-materials}

**Materials** → **Share with your pod**:

1. Choose the **Pod**.
2. Enter a **Title**, for example "Prong size chart".
3. Choose the **File** (PDF, PNG, JPEG, ZIP or STEP, up to 50 MB).
4. Describe **What it is for**.
5. Share it.

"Shared with the pod" confirms it, and every designer in the pod can open it.

To take one down: **Remove** → "Remove '…'? Designers in the pod will no longer see it." → **Remove**.

## Talk to the designer or the client {#pod-messages}

Each order has two tabs:

- **Client**: the conversation with the client; the designer never sees it, and to the client you are "Your team".
- **Designer**: the conversation with the designer; the client never sees it.

You are notified of new messages from the client and from the designer. Under a message, **Forward to designer** (or **Forward to client**) passes it to the other side after a confirmation. Check that a client's message names nobody before forwarding it to the designer.

## Re-measure a spec claim {#pod-claims}

When a client opens a spec claim, you are notified "A client opened a spec claim. Re-measure the archived file."

1. Open the order → **Spec claims**.
2. Compare their file (it says whether the **file matches** the delivered version) and the photos.
3. Enter the **Re-measured value** and a **Decision note**.
4. Click **Uphold · free fix + credit** or **Spec met · reject**.

An upheld claim creates a free fix order for you to assign, with the 6-hour clock running.

## Earnings {#pod-earnings}

**Earnings**: "Paid per review · 50% of the designer's pay, at least ₹300". It lists each job's pod pay and the **Pod pay by category** table. Pay is added when the order closes. Add your bank details with **Add bank details**: the same form as designers use, under [Earnings and bank details](#designer-earnings).
