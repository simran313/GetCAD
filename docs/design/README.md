# The CAD Pillar — design screens

92 static mockups from the signed-off canvas. Desktop artboards are 1440 × 900; mobile artboards are 390 × 844. Open any file in a browser.

## Rules for whoever builds from these

- These are **visual references**: layout, hierarchy, type, spacing, colour and components. They are not production code.
- **Sample data is placeholder.** Names, order numbers, prices ($180, $240…), timers and counts are illustrative. `docs/DECISIONS.md` wins on every value and rule.
- Design system: black `#0A0A0A`, white, neutrals `#F7F7F5` `#F0F0ED` `#E6E6E2`, borders `#E3E3DF` / `#CFCFC9`, text `#45453F` / `#6B6B66`. Type: Instrument Serif (display), Geist (UI), Geist Mono (refs, numbers, labels). 8 px spacing grid; 2–4 px radii.
- Build shared components first: button, status tag (needs / active / done / muted), category badge, timer, field, pills, table row, checklist row, upload slot, list row.
- Ring illustrations are placeholders for real renders and uploaded images.
- **Desktop ordering is one page (N1).** The N2–N4 desktop artboards are the older stepped flow and are superseded; build N2–N4 for mobile only.
- Two mobile-only states (C3b order quick view, C7b conversation) have no desktop artboard; on desktop they live inside C3 and C7.

## Client · start & order

| Screen | File | Size |
| --- | --- | --- |
| C1 · Home · desktop 1440 | `screens/C1-Home-desktop.html` | 1440 × 900 |
| C1 · Home · mobile 390 | `screens/C1-Home-mobile.html` | 390 × 844 |
| N1 · New CAD order (one page desktop · stepped mobile) · desktop 1440 | `screens/C2-New-order-desktop.html` | 1440 × 900 |
| N1 · New CAD order (one page desktop · stepped mobile) · mobile 390 | `screens/C2-New-order-mobile.html` | 390 × 844 |
| S1 · Sign in · desktop 1440 | `screens/S1-Sign-in-desktop.html` | 1440 × 900 |
| N0 · Choose a service · desktop 1440 | `screens/N0-Choose-a-service-desktop.html` | 1440 × 900 |
| N0 · Choose a service · mobile 390 | `screens/N0-Choose-a-service-mobile.html` | 390 × 844 |
| N2 · CAD step 2: Stones · desktop 1440 | `screens/N2-CAD-step-2-Stones-desktop.html` | 1440 × 900 |
| N2 · CAD step 2: Stones · mobile 390 | `screens/N2-CAD-step-2-Stones-mobile.html` | 390 × 844 |
| N3 · CAD step 3: Size & shank · desktop 1440 | `screens/N3-CAD-step-3-Size-and-shank-desktop.html` | 1440 × 900 |
| N3 · CAD step 3: Size & shank · mobile 390 | `screens/N3-CAD-step-3-Size-and-shank-mobile.html` | 390 × 844 |
| N4 · CAD step 4: Metal & finish · desktop 1440 | `screens/N4-CAD-step-4-Metal-and-finish-desktop.html` | 1440 × 900 |
| N4 · CAD step 4: Metal & finish · mobile 390 | `screens/N4-CAD-step-4-Metal-and-finish-mobile.html` | 390 × 844 |
| N5 · Review your order · desktop 1440 | `screens/N5-Review-and-send-desktop.html` | 1440 × 900 |
| N5 · Review your order · mobile 390 | `screens/N5-Review-and-send-mobile.html` | 390 × 844 |
| N6 · Brief sent · desktop 1440 | `screens/N6-Brief-sent-desktop.html` | 1440 × 900 |
| N6 · Brief sent · mobile 390 | `screens/N6-Brief-sent-mobile.html` | 390 × 844 |
| N7 · New render order (one page desktop) · desktop 1440 | `screens/N7-Render-brief-desktop.html` | 1440 × 900 |
| N7 · New render order (one page desktop) · mobile 390 | `screens/N7-Render-brief-mobile.html` | 390 × 844 |
| S1 · Sign in · mobile 390 | `screens/S1-Sign-in-mobile.html` | 390 × 844 |
| S2 · Create account · desktop 1440 | `screens/S2-Create-account-desktop.html` | 1440 × 900 |
| S2 · Create account · mobile 390 | `screens/S2-Create-account-mobile.html` | 390 × 844 |
| S3 · Welcome prompts · desktop 1440 | `screens/S3-Welcome-prompts-desktop.html` | 1440 × 900 |
| S3 · Welcome prompts · mobile 390 | `screens/S3-Welcome-prompts-mobile.html` | 390 × 844 |

## Client · track, pay & account

| Screen | File | Size |
| --- | --- | --- |
| C3 · Orders · desktop 1440 | `screens/C3-Orders-desktop.html` | 1440 × 900 |
| C3 · Orders · mobile 390 | `screens/C3-Orders-mobile.html` | 390 × 844 |
| C3b · Order quick view · mobile 390 | `screens/C3b-Order-quick-view-mobile.html` | 390 × 844 |
| C4 · Order · desktop 1440 | `screens/C4-Order-desktop.html` | 1440 × 900 |
| C4 · Order · mobile 390 | `screens/C4-Order-mobile.html` | 390 × 844 |
| C5 · Pay · desktop 1440 | `screens/C5-Pay-desktop.html` | 1440 × 900 |
| C5 · Pay · mobile 390 | `screens/C5-Pay-mobile.html` | 390 × 844 |
| C6 · Review renders · desktop 1440 | `screens/C6-Review-renders-desktop.html` | 1440 × 900 |
| C6 · Review renders · mobile 390 | `screens/C6-Review-renders-mobile.html` | 390 × 844 |
| C7 · Messages · desktop 1440 | `screens/C7-Messages-desktop.html` | 1440 × 900 |
| C7 · Messages · mobile 390 | `screens/C7-Messages-mobile.html` | 390 × 844 |
| C7b · Conversation · mobile 390 | `screens/C7b-Conversation-mobile.html` | 390 × 844 |
| C8 · Files · desktop 1440 | `screens/C8-Files-desktop.html` | 1440 × 900 |
| C8 · Files · mobile 390 | `screens/C8-Files-mobile.html` | 390 × 844 |
| C9 · Account · desktop 1440 | `screens/C9-Account-desktop.html` | 1440 × 900 |
| C9 · Account · mobile 390 | `screens/C9-Account-mobile.html` | 390 × 844 |
| W1 · Wallet · desktop 1440 | `screens/W1-Wallet-desktop.html` | 1440 × 900 |
| W1 · Wallet · mobile 390 | `screens/W1-Wallet-mobile.html` | 390 × 844 |
| W2 · Transactions · desktop 1440 | `screens/W2-Transactions-desktop.html` | 1440 × 900 |
| W2 · Transactions · mobile 390 | `screens/W2-Transactions-mobile.html` | 390 × 844 |
| W3 · Invoices · desktop 1440 | `screens/W3-Invoices-desktop.html` | 1440 × 900 |
| W3 · Invoices · mobile 390 | `screens/W3-Invoices-mobile.html` | 390 × 844 |

## Designer

| Screen | File | Size |
| --- | --- | --- |
| D1 · Become a designer · desktop 1440 | `screens/D1-Become-a-designer-desktop.html` | 1440 × 900 |
| D1 · Become a designer · mobile 390 | `screens/D1-Become-a-designer-mobile.html` | 390 × 844 |
| D2 · Home · desktop 1440 | `screens/D2-Home-desktop.html` | 1440 × 900 |
| D2 · Home · mobile 390 | `screens/D2-Home-mobile.html` | 390 × 844 |
| D3 · Open jobs · desktop 1440 | `screens/D3-My-work-desktop.html` | 1440 × 900 |
| D3 · Open jobs · mobile 390 | `screens/D3-My-work-mobile.html` | 390 × 844 |
| D4 · Job · desktop 1440 | `screens/D4-Job-desktop.html` | 1440 × 900 |
| D4 · Job · mobile 390 | `screens/D4-Job-mobile.html` | 390 × 844 |
| D4b · Designer checklist · desktop 1440 | `screens/D4b-Job-checklist-desktop.html` | 1440 × 900 |
| D4b · Designer checklist · mobile 390 | `screens/D4b-Job-checklist-mobile.html` | 390 × 844 |
| D5 · Messages · desktop 1440 | `screens/D5-Messages-desktop.html` | 1440 × 900 |
| D5 · Messages · mobile 390 | `screens/D5-Messages-mobile.html` | 390 × 844 |
| D6 · Earnings and bank · desktop 1440 | `screens/D6-Earnings-and-bank-desktop.html` | 1440 × 900 |
| D6 · Earnings and bank · mobile 390 | `screens/D6-Earnings-and-bank-mobile.html` | 390 × 844 |

## Pod lead

| Screen | File | Size |
| --- | --- | --- |
| P1 · QC queue · desktop 1440 | `screens/P1-QC-queue-desktop.html` | 1440 × 900 |
| P1 · QC queue · mobile 390 | `screens/P1-QC-queue-mobile.html` | 390 × 844 |
| P2 · QC review · two-level checklist · desktop 1440 | `screens/P2-QC-review-desktop.html` | 1440 × 900 |
| P2 · QC review · two-level checklist · mobile 390 | `screens/P2-QC-review-mobile.html` | 390 × 844 |
| P3 · All orders · desktop 1440 | `screens/P3-All-orders-desktop.html` | 1440 × 900 |
| P3 · All orders · mobile 390 | `screens/P3-All-orders-mobile.html` | 390 × 844 |
| P4 · Earnings · desktop 1440 | `screens/P4-Earnings-desktop.html` | 1440 × 900 |
| P4 · Earnings · mobile 390 | `screens/P4-Earnings-mobile.html` | 390 × 844 |
| P5 · Team board · desktop 1440 | `screens/P5-Team-board-desktop.html` | 1440 × 900 |
| P5 · Team board · mobile 390 | `screens/P5-Team-board-mobile.html` | 390 × 844 |
| P6 · Create order for a client · desktop 1440 | `screens/P6-Create-order-desktop.html` | 1440 × 900 |
| P6 · Create order for a client · mobile 390 | `screens/P6-Create-order-mobile.html` | 390 × 844 |

## Admin

| Screen | File | Size |
| --- | --- | --- |
| A1 · Queue · desktop 1440 | `screens/A1-Queue-desktop.html` | 1440 × 900 |
| A1 · Queue · mobile 390 | `screens/A1-Queue-mobile.html` | 390 × 844 |
| A10 · Create order for a client · desktop 1440 | `screens/A10-Create-order-desktop.html` | 1440 × 900 |
| A10 · Create order for a client · mobile 390 | `screens/A10-Create-order-mobile.html` | 390 × 844 |
| A2 · All orders · desktop 1440 | `screens/A2-All-orders-desktop.html` | 1440 × 900 |
| A2 · All orders · mobile 390 | `screens/A2-All-orders-mobile.html` | 390 × 844 |
| A3 · Order · desktop 1440 | `screens/A3-Order-desktop.html` | 1440 × 900 |
| A3 · Order · mobile 390 | `screens/A3-Order-mobile.html` | 390 × 844 |
| A4 · Access · desktop 1440 | `screens/A4-Access-desktop.html` | 1440 × 900 |
| A4 · Access · mobile 390 | `screens/A4-Access-mobile.html` | 390 × 844 |
| A5 · Designer applications · desktop 1440 | `screens/A5-Designer-applications-desktop.html` | 1440 × 900 |
| A5 · Designer applications · mobile 390 | `screens/A5-Designer-applications-mobile.html` | 390 × 844 |
| A6 · Contact leads · desktop 1440 | `screens/A6-Contact-leads-desktop.html` | 1440 × 900 |
| A6 · Contact leads · mobile 390 | `screens/A6-Contact-leads-mobile.html` | 390 × 844 |
| A7 · Account · desktop 1440 | `screens/A7-Account-desktop.html` | 1440 × 900 |
| A7 · Account · mobile 390 | `screens/A7-Account-mobile.html` | 390 × 844 |
| A8 · Billing · desktop 1440 | `screens/A8-Billing-desktop.html` | 1440 × 900 |
| A8 · Billing · mobile 390 | `screens/A8-Billing-mobile.html` | 390 × 844 |
| A9 · Clients and account managers · desktop 1440 | `screens/A9-Clients-and-account-managers-desktop.html` | 1440 × 900 |
| A9 · Clients and account managers · mobile 390 | `screens/A9-Clients-and-account-managers-mobile.html` | 390 × 844 |
