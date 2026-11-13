# Designers {#designer}

For CAD designers in a pod. You see only the jobs your pod lead assigns to you. You never see the client's name, the price, or anyone's pay rate; you see what each job pays you.

## What do you need to do? {#designer-tasks}

- [Get set up: first sign-in and the agreement](#designer-setup)
- [See what needs you today](#designer-home)
- [Start a job](#designer-start)
- [Pause and resume](#designer-pause)
- [Upload the four deliverables](#designer-upload)
- [Make the render image from four views](#designer-render-composer)
- [Record the model volume, gold weight and diamonds](#designer-weights)
- [Pass your designer check](#designer-check)
- [Send to QC from the final review](#designer-send)
- [Handle changes from QC or the client](#designer-changes)
- [Ask your pod lead a question](#designer-messages)
- [Read your pod's materials](#designer-materials)
- [Use the gold and diamond calculators](#designer-calculators)
- [See your earnings and add bank details](#designer-earnings)

## Get set up {#designer-setup}

An admin adds you to the platform with your email and places you in a pod. **No invitation email is sent**: the team tells you directly.

1. Go to **thecadpillar.com/sign-in** and enter the email the team used.
2. Enter the code that arrives by email.
3. **Home** shows **Finish onboarding**: "Sign the designer agreement. Your pod lead can assign you work once it is signed." Click **Continue**.
4. **Become a designer** opens at **Sign agreement**. Read the agreement.
5. Click **I have read and agree — sign**. Your signature is recorded against this exact version.
6. The page shows **Active**: "You're onboarded… and are eligible to be assigned work."
7. Add your bank details: [Earnings and bank details](#designer-earnings).

> [!IMPORTANT] Until you sign, no work can reach you
> Your pod lead can see your name but cannot assign you a job. If the agreement is updated, you are asked to sign the new version, and until you do you cannot receive new jobs.

## Home {#designer-home}

**Home** is your day at a glance:

- **Needs you**: **Changes requested** first, then **New job** and **In progress**. Each row shows **Due** or **Your time**, with **Open job**.
- **Messages**: unread messages from your pod lead.
- **Pod lead**: your pod lead, with **Open**.
- **Payout sent** and **View earnings**, when pay was sent.
- **Bank details**: "Add your bank details", "Bank details being checked" or "Bank details need fixing".

![A designer's Home](../assets/screens/designer-home.png)

**Open jobs** (sidebar) lists your jobs in tabs: **Open jobs** and **Submitted to QC**.

- Each job shows **Your time** ("Starts when you do", the time left, or **Over time**), **Due to QC** and the **Next move**.
- "Only the jobs your pod lead has assigned to you. Your timer starts when you press Start work, and stops while you pause."

## Start a job {#designer-start}

When a job is assigned you get a notification ("You have been assigned to an order."). It appears under **Needs you** as **New job**.

1. Click **Open job**.
2. Read everything before starting:
   - the **References** (the client's photos with their pins; "Client hidden" is a reminder that you never see who the client is);
   - **The piece** and **Specification** (the brief);
   - the client's **Master instructions**, when there are any.
3. Click **Start work**. Your time starts: the job's category minutes count down under **Your time left**.

![A job page: clock, references, brief, upload slots and checks](../assets/screens/designer-job.png)

![A job on a phone: status, Pause, master instructions and references](../assets/screens/designer-phone-job.png){.phone}

**Due to QC** is your deadline: the client's first-look time minus the time kept for QC.

- An hour before it, you are notified "…due to QC within the hour".
- Once it has passed, you and your pod lead are both notified.

## Pause and resume {#designer-pause}

Click **Pause** on the job when you must stop. Your own clock stops and the job shows **Paused**; **Resume** starts it again. The **Due to QC** time does **not** move. Your pod lead sees paused time.

## Upload the four deliverables {#designer-upload}

Under the job's **Version N deliverables**, choose or drop each file into its slot:

| Slot | What |
| --- | --- |
| **Rhino 3DM** | The final model. Blocks are fine: they are exploded on upload |
| **STL** | Print-ready mesh, binary or ASCII |
| **Render views** | One image with the four basic render views ([make it from four views](#designer-render-composer)) |
| **Technical sheet** | One image: four views with measurements, diamond details and gold weight (kt) |

- Each slot shows **Checking and cleaning…** and then the uploaded file. Files can be up to 50 MB.
- Names, authors and other details inside each file are removed, and the system names the files.
- "x of 4 uploaded" counts progress.

## Make the render image from four views {#designer-render-composer}

On the **Render views** slot, click **From 4 views**. A window opens with four equal boxes: **Front**, **Side**, **Top**, **Perspective**.

1. Fill each box in one of three ways:
   - snip a view and press <kbd>Ctrl</kbd> + <kbd>V</kbd> (it goes into the box with the dark outline, then moves to the next empty one);
   - drop a picture onto a box;
   - click a box to choose a file.
2. Arrange the views:
   - drag a view onto another box to swap them, or click **⇄** on one and then click the other;
   - **×** clears a box.
3. When all four are in ("4 of 4 views"), click **Make the render and upload**. Each view is fitted whole into an equal square on white, and the result goes into the slot.

![The render composer: four equal boxes](../assets/screens/designer-render-composer.png)

## Record the model volume, gold weight and diamonds {#designer-weights}

1. **Model volume**: in Rhino, use Analyze → Mass properties → Volume on the final model. Enter it in mm³ and click **Save**. The weight sheet is made from it.
2. **Gold weight and diamonds**:
   1. Enter the **18K cast weight (g) · this job**. The volume gives a hint.
   2. Enter the **Casting allowance (g)** and the **Post allowance (g)**.
   3. **Add diamonds** for each size of stone (shape, size, pieces). The carat per stone comes from the size charts.
   4. Click **Save weights**. No diamonds? Save with no lines.
3. Upload or re-upload the **Technical sheet**. A panel is added underneath it with the cast weight in every metal and the diamonds.

The panel states:

- "Saved and added under the technical image".
- "Saved, but not yet added to the technical image": upload the image again, or save again.

Version 2 starts from version 1's weights.

## Pass your designer check {#designer-check}

Click **Mark the QC sheet**. It opens the **Designer check**, nine lines:

1. size and all measurements;
2. diamond sizes, colours and count;
3. setting type;
4. metal colour and karat;
5. the client's special remarks;
6. overall look;
7. no open or naked edges;
8. STL mesh tolerance;
9. files exported.

For each line:

- optionally enter a **Value or finding** and a **Remark**;
- click **Pass** or **Fail**;
- **Clear** undoes a mark; **Change** reopens a marked line.

Lines can be marked only after **Start work**. Your signature and the time are recorded when you send to QC.

## Send to QC from the final review {#designer-send}

Click **Final review and send to QC**. The page fills the screen:

- **left:** the client's references (zoom, drag, **Full size**) and the brief;
- **middle:** your model: the STL in 3D, the render, the technical sheet;
- **right:** the designer check, the gold weight and diamonds, and what is still missing.

![The final review before QC](../assets/screens/designer-final-review.png)

When everything is in, the page says "Everything is in. Matches the references? Send it." Click **Send to QC**.

> [!WARNING] Before you press Send to QC
> The version is locked and goes to your pod lead. The client is told work was submitted. You cannot change this version afterwards; changes come back as a new version.

Sending needs:

- every designer line passed;
- all four files;
- the model volume;
- the gold weight.

The page lists what is missing, for example "Upload the STL" or "Enter the model volume".

## Handle changes from QC or the client {#designer-changes}

If QC sends the job back, or the client asks for changes, it returns as **Changes requested** at the top of **Home**.

1. Open the job. The notes are under **Pod lead notes** (QC: each failed line with its finding and remark) or **Changes the client asked for**.
2. Click **Start work**. This starts a new version, with fresh slots and a fresh check.
3. Make the changes, upload, check, and send to QC again.

QC send-backs are part of the job. Changes the client orders after approval are paid as a new job.

## Ask your pod lead a question {#designer-messages}

**Ask pod lead** on the job, or **Messages**. Your conversation is with your pod lead and admins only: "Client questions go through your pod lead." You never see or write in the client's conversation. A message the team forwards from the client appears as "Forwarded from the client".

## Pod materials {#designer-materials}

**Materials** lists the instructions, charts and references your pod lead shares, for example a prong-size chart. Click **Open**. You can read them; only your pod lead or an admin adds or removes them.

## Calculators {#designer-calculators}

**Calculators** (`/tools`) works out the gold casting weight per metal and the diamond weight from the size charts as you type. Nothing is saved.

## Earnings and bank details {#designer-earnings}

**Earnings** lists what each job pays you, added when its order closes and paid by bank transfer: "Paid per job, after the order closes". QC send-backs are part of the job.

**Bank details** (**Account → Payout details**, or **Add bank details** on Earnings):

1. Enter:
   - **Account holder name**, exactly as at your bank;
   - **Bank account number**, twice;
   - **IFSC**;
   - **Account type**;
   - **PAN**.
2. Click **Save payout account**.

The details are checked before payouts are released; until then they show as being checked. A name, account number or IFSC that does not match the bank is the most common reason a payout fails. Only Indian bank accounts are paid at present.

You are notified "Your pay of ₹… for this job was sent." when the team pays a batch.
