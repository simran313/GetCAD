# Phase 4a rollout — orders from email, WhatsApp and phone; message threads

What ships: migration `0043`, policy `0034` (2 files); **Staff console → New order for a client**; screenshots of the request; an automatic email to the client and a "Send on WhatsApp" button; the team can fill in the brief of these orders; two message threads on every order (client ↔ team, team ↔ designer); order pages refresh every 20 seconds.

## 1. Apply and merge
```bash
git fetch origin
git checkout claude/gracious-hopper-amum18
git reset --hard origin/claude/gracious-hopper-amum18
DATABASE_URL="postgresql://...your address..." npm run db:status    # 2 pending
DATABASE_URL="postgresql://...your address..." npm run db:apply     # applied 2 file(s)
```
Then merge the pull request straight away.

## 2. One-time settings (before the first real client)
1. **Clerk — sign-in by email code.** Clients the team adds have no password. In the Clerk dashboard, open the email address settings (*Configure → User & authentication*) and allow sign-in with **Email verification code**. Without it they cannot sign in.
2. **Email sending (Vercel → Settings → Environment Variables):**
   - `RESEND_API_KEY`: from resend.com, after you verify your sending domain.
   - `EMAIL_FROM`: for example `The CAD Pillar <orders@yourdomain.com>`.
   - `NEXT_PUBLIC_SITE_URL`: your live address starting with `https://` (used for the link in the email and the WhatsApp message).
   Redeploy after adding them. Until they are set, emails wait in the queue and go out once they are.

## 3. Placing an order for a client
| Step | Who | What |
| --- | --- | --- |
| 1 | Admin or pod lead | **Staff console → New order for a client →** |
| 2 | | **Find the client** (business, name, email, phone or code) and tick them, **or** fill in *New client* (business name, contact name, email, WhatsApp number with country code). A new client's account is opened; an email that already has one is reused. |
| 3 | | Came by (email / WhatsApp / phone), product, service, pod; what they asked for (the client sees this as the first message). |
| 4 | | **Screenshots** of the email or chat: at least one, PNG or JPEG. Clients and the team see them; **designers never do**. |
| 5 | | Keep **Email the client** ticked → **Place order**. The order opens with its reference (e.g. `MJ1-RN-C-14`). |
| 6 | | On the order: **Send on WhatsApp** opens WhatsApp with the message written; press send. |
| 7 | | **The brief**: fill it in for the client (sizes, metal, stone) and add **clean** reference pictures. This is what the designer sees. |
| 8 | | Quote → paid → confirm → assign, as before. The clock starts when the order is both paid and confirmed. |

## 4. Messages
Every order now has two conversations:
- **Client ↔ Team**: the client, admins and the pod lead. Staff show as "Team · first name". Designers never see this.
- **Team ↔ Designer**: the designer, admins and the pod lead. The client never sees this.

Staff can now write in both from the order page. Pages refresh by themselves every 20 seconds.

## 5. Quick test on the live site
1. As admin: New order for a client → *New client* with your own second email → WhatsApp → one screenshot → Place order.
2. The order shows **Received by WhatsApp**, the screenshot, your contact line and **Send on WhatsApp**.
3. Sign in as that email (code from your inbox): the order is there, titled **Placed via WhatsApp by the team**, with the screenshot and the team's first message.
4. As the client, write a message; as admin, reply in **Client ↔ Team**.
5. As a designer assigned to it: no screenshots, no client thread, only **Messages** with the team.
