# Redesign — before and after, per page

Before: `design-qa` branch, folder `before/`. After: folders `pages/`, `axe/`
and later captures on the same branch (`<stage>/<role>/<route>@<width>.png`,
at 390, 768 and 1440). Audit references (G1–G14) are in `AUDIT.md`.

Nothing below touched the database, migrations, RLS, the order state
machine, the audit log, server actions, auth or payments. The same server
actions are called with the same form fields.

## Across the product

| Before | After |
| --- | --- |
| Pages wider than a phone on Home, Queue, Billing, Access (G1) | Shared list rows and tables stack on a phone; no horizontal page scroll |
| Seven different page widths, some centred, some left (G8) | One frame (`Page`): `--page-max`, left-aligned under the sidebar; forms held to a readable measure |
| Condensed serif titles and numbers (G4) | Geist throughout; headings 600 at -0.02em |
| Uppercase letter-spaced mono everywhere (G5) | Uppercase only for small eyebrow labels; references in plain mono; table heads, badges and labels in sentence case |
| Uppercase outlined status boxes, one colour (G6) | `StatusPill`: sentence case, a dot, six meaning-only tones (amber = SLA risk, red = overdue / destructive) |
| Browser-default file inputs (G7) | `FilePicker`: a secondary "Choose file" button and the file name, same input underneath |
| 256px sidebar, "Signed in" floating text, two active states, duplicate icons (G9, G10) | 240px grouped sidebar (Work · Money · People · System), one active row, unique icons, collapsible to icons; user block with name and role opening Account and Sign out; Cmd+K |
| Phone: bottom tabs only | Phone: compact top bar, bottom bar with a raised Create, a More sheet |
| Equal-weight stat tiles (G11) | Compact summary strips, zeros muted; on the Queue, one pipeline strip that filters |
| "1 orders", "1 reviews" (G12) | Pluralised everywhere touched |
| Every row button black; red Suspend on every row | One black button per screen; row moves are secondary; red only inside a typed confirmation |
| "No orders here." | `EmptyState`: icon, what is missing, why or what to do, at most one action |
| Ad-hoc loading blocks | `PageSkeleton` on the real page frame (admin, order lists, home, wallet, files) |
| No skip link | "Skip to content" for keyboard users |

## Admin

| Page | Before | After |
| --- | --- | --- |
| Queue | 10 equal tiles, every row's button primary, "SLA left: Not started", footer links | Pipeline strip (zeros muted, click to filter in place); missed first looks, disputes and spec claims pinned on top; rows: status · order + ref · why · live first-look clock (Clock not started / amber under 1h / red overdue) · one secondary move; phone: stacked cards with a full-width move |
| All orders | Tabs, a Filter form, a static table | Views with counts, instant search, stage filter, views you save (this browser), a detail drawer per row; rows reduced to references on the server |
| Access | Raw IDs as text, a two-step role change with a per-row Save, red Suspend on every row, "1 orders", search behind a Filter button | Tabs with counts, instant search, role changed in the row with a toast (rolls back on refusal), Suspend in the row menu behind typing "suspend", IDs behind a copy button, pluralised activity |
| Settings | Raw keys and descriptions, densities in mg/cm³ with wrong helper text, a Save per row | Human labels and units (g/cm³, mm, ₹ per $1, $ per gram) converted on save; one sticky save bar listing every before → after; switches apply at once with a toast; "Last changed by X, date" per section from the rows' own updated_by/updated_at; raw keys in a closed Developer panel |
| Clients | A Save per row for the account manager | Saves on change with a toast |
| Create order | Native "Choose Files" | Styled picker |
| Credits, Applications, Leads | Plain "Nothing here" | Designed empty states; per-row Decide is secondary |
| Order page | One-tap red "Refund the client" | Secondary button opening a typed confirmation; red only on the final confirm |

## Client

| Page | Before | After |
| --- | --- | --- |
| Home | Four stat tiles first, uppercase labels, overflowed on a phone | "Welcome back": what needs you first, the first item the one black button, large type, full-width buttons on a phone; in-progress list with live countdowns; wallet and totals as quiet links; "Talk to your team" always in the top bar |
| Orders | Two hand-built layouts, mono uppercase heads | One responsive list, counts on every tab (empty tabs hidden), Pay as the row's action, designed empty states |
| Order page | Static timer, "Late — credit due" tag | Live countdown, Missed / Done on time pills |
| Wallet | Display-serif numbers | Semibold amounts, a real section heading |
| Account | Centred, floating "Sign out" text, uppercase labels, native file input | Identity first (name, email, roles as chips, status, client code, copyable reference), business form, logo with the styled picker, security as a row, Sign out as a real button |

## Designer and pod lead

| Page | Before | After |
| --- | --- | --- |
| Designer Home | Every job card's button black | One black button: the job to open first; live countdowns; empty state |
| Open jobs | Two hand-built layouts | One responsive list; your time and due-to-QC as live countdowns; Start work black only on the first job |
| Earnings | Centred narrow page | Shared frame, empty state |
| QC queue | Long uppercase eyebrow, black buttons on rows | Description line, secondary row moves, live countdowns, empty states |
| Team board | Create order black | Secondary |

## Tests

- Every existing check is unchanged in what it proves. Locators changed where
  the control changed (owner-approved): the Settings helper finds a field by
  key and presses the save bar; the capacity switch is found by its label;
  the density is typed in g/cm³.
- The anonymity crawl ignores React's numbered page rows when comparing two
  jobs (owner-approved); the leak check still reads the raw pages.
- Accessibility: axe (WCAG 2.2 A/AA) on every route at 390 and 1440, report
  per role in `axe.md` beside the screenshots.
