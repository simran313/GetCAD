# axe: admin

8 serious or critical findings.

- `/admin/new-order` @390 — **label** (critical): Form elements must have labels
  - `input[type="file"]`
- `/admin/new-order` @1440 — **label** (critical): Form elements must have labels
  - `input[type="file"]`
- `/admin/settings` @390 — **aria-hidden-focus** (serious): ARIA hidden element must not be focusable or contain focusable elements
  - `.bottom-\[calc\(env\(safe-area-inset-bottom\)\+72px\)\]`
- `/admin/settings` @1440 — **aria-hidden-focus** (serious): ARIA hidden element must not be focusable or contain focusable elements
  - `.bottom-\[calc\(env\(safe-area-inset-bottom\)\+72px\)\]`
- `/orders/Jea9CnqC56nFWjYjut5cB` @390 — **color-contrast** (serious): Elements must meet minimum color contrast ratio thresholds
  - `.border-\[color\:var\(--tone-success-line\)\] > .opacity-75.mt-1`
- `/orders/Jea9CnqC56nFWjYjut5cB` @1440 — **color-contrast** (serious): Elements must meet minimum color contrast ratio thresholds
  - `.border-\[color\:var\(--tone-success-line\)\] > .items-baseline.justify-between.gap-3 > .opacity-80`
  - `.border-\[color\:var\(--tone-success-line\)\] > .opacity-75.mt-1`
- `/account` @390 — **definition-list** (serious): <dl> elements must only directly contain properly-ordered <dt> and <dd> groups, <script>, <template> or <div> elements
  - `dl`
- `/account` @1440 — **definition-list** (serious): <dl> elements must only directly contain properly-ordered <dt> and <dd> groups, <script>, <template> or <div> elements
  - `dl`
