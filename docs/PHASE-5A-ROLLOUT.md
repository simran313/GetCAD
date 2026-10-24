# Phase 5a rollout — new look, shared building blocks, navigation

What ships: no database change. The portal switches to the designs' black-and-white look; new building blocks used by the next screens; sidebars per role; the client home moves to `/home`.

## 1. Merge
Merge the pull request once its checks are green. Nothing to apply in Supabase, no settings.

## 2. What changes for people
- **Everyone:** black buttons, warm greys, square corners, the name "The CAD Pillar" in the serif font, status tags in black and grey:
  - **solid black:** someone must act;
  - **outlined:** in progress;
  - **tick:** done;
  - **grey:** nothing happening.
- **Clients and designers:** white sidebar. The client menu is Home · New order · Orders · Account.
- **Admins and pod leads:** black sidebar labelled "Team workspace", with **Create order** (the Phase 4a screen).
- **Dark mode is gone:** the portal is always light, as in the designs.
- **Addresses:**
  - the client home is **/home**; old `/dashboard` links still work;
  - **/login** and **/signup** open sign-in and sign-up;
  - the installed phone app opens on /home and stays the same app.

## 3. Check it
1. Open **/account/kit** on your phone and on a computer. It shows every building block with sample values: tags, timers, fields, choice pills, rows, checklist, upload slots.
2. Sign in as a client: white sidebar (or bottom bar on a phone), Home · New order · Orders · Account.
3. Sign in as admin: black sidebar, "Team workspace", Queue · Orders · Create order · Account.
4. Open an old link to `/dashboard`: it lands on `/home`.

The screens themselves keep their current layout until 5b (client), 5c (designer, pod lead) and 5d (admin) rebuild them with these blocks.
