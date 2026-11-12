# Messages, files and visibility {#messages-files}

## Two conversations per order {#two-conversations}

Every order has two separate conversations. The database keeps them apart.

| Tab on the order | Members | Never seen by | Notes |
| --- | --- | --- | --- |
| **Client ↔ Team** | The client; the pod lead; admins | **The designer** | To the client, every team message comes from **"Your team"**. Team members see each other as "Team · first name". Opens with the client's brief as the first message. |
| **Team ↔ Designer** | The designer; the pod lead; admins | **The client** | The designer's copy of the brief never names the client. |
| **Old messages** | Admins only | Everyone else | Read-only messages from before the current chat (version 1). Shown only when they exist. |

## Messages {#messages-admin}

**Open:** sidebar → **Messages** (`/messages`). On an order, the conversations are also in the **Conversations** card.

- **The list** shows every order's conversation, with the latest message and an unread count.
  - Filters: **All**, **Unread**, **Needs reply** (the client or designer wrote last), **No messages**.
  - **Search conversations** by order number or name.
- **The conversation:**
  - **All conversations** (back, on a phone);
  - the order title;
  - the order-details button, which opens **Brief**, **Files** and **Open the order**.

![An order's conversation, team view](../assets/screens/admin-messages-order.png)

**Writing a message**

1. Choose the tab, **Client ↔ Team** or **Team ↔ Designer**.
2. Type in **Message**.
   - **Attach** (paper clip) offers **Camera**, **Photos** or **File** (up to 25 MB each).
   - The microphone records a **voice message**.
3. Click **Send** (the arrow).
   - A tick shows **Sent**; a double tick shows **Read**.
   - A failed message says "Not sent · Tap to retry".

**Marking up a picture.** Open any picture in the conversation, the brief's included, and click **Mark up**. Draw in one of three ways:

- drag around an area to circle it (the default);
- draw freehand;
- tap to drop numbered pins.

**Undo** and **Clear** correct mistakes. **Done** attaches the marked-up copy to your message.

**Forwarding between the client and the designer.** Only the team can forward.

1. On a message, click **Forward this message**.
2. Read the note:
   - to the designer: "The designer gets the text and pictures as 'Forwarded from the client'. Check it names nobody.";
   - to the client: "The client gets it from the team, never from the designer by name."
3. Click **Forward to …**. Files are cleaned again on the way. File types the destination cannot take are left out, and the message says how many.

> [!WARNING] Before you forward to a designer
> Read the client's message first. If it contains their company name, an address or a phone number, do not forward it; retype the instruction instead. Anonymity is the product's promise.

## Files on an order {#files}

| File | Who adds it | When the client gets it |
| --- | --- | --- |
| Reference photos, certificate pictures (in the brief) | Client (or the team, on-behalf) | Always (their own) |
| Screenshots of the request (on-behalf orders) | The team | Always; designers never |
| Rhino 3DM, STL | Designer, in the job's upload slots | From approval |
| Render views (one image with four views), Technical sheet | Designer | From **Ready to preview** |
| QC certificate, Weight sheet (PDF) | Made by the platform after QC | After QC passes |
| Summary sheet (PDF) | Made by the platform | From approval |
| Files sent in a conversation | Anyone in that conversation | In their own conversation only |

**Cleaning and names.**

- Every upload is cleaned before it is stored. Author, studio and camera details are removed from 3DM, STL and image files, and Rhino blocks are exploded into plain geometry.
- Formats that cannot be cleaned are refused.
- Delivered files are named by the system (`ORDER_SLOT_vN`), fingerprinted, and archived read-only.

**The team's Files panel** on an order: **Upload a file** (PNG, JPEG or STEP), choose what it is, **Upload**. Each file shows its version (**v1**, **v2**…), **Download**, and **Held** where the client cannot have it yet.

## Who sees what {#visibility}

<!-- include: ../shared/_visibility.md -->

# Notifications and email {#notifications}

<!-- include: ../shared/_notifications.md -->

## Check whether emails reach clients {#email-previews}

**Open:** **Settings** → **Email previews** (`/admin/emails`).

![Email previews: the delivery mode, every template, and a test send](../assets/screens/admin-emails.png)

- **The banner** shows the mode:
  - "Live: emails go to their real recipients."
  - Or: "Test mode: every email goes to *test inbox*, with the real recipient in the subject. Clients receive nothing until EMAIL_DELIVERY=live."
- **Every template** with sample data, marked **Always sent** or **Can turn off**.
- **Send all N to *test inbox***: sends every template to the test inbox, so you can check how they look in Gmail, Outlook and Apple Mail.

> [!IMPORTANT] Going live is a deployment setting, not a button
> Switching email to live is done by the owner in the hosting settings (`EMAIL_DELIVERY=live`, then redeploy). See `docs/EMAIL.md`. Emails queued in test mode are not re-sent.
