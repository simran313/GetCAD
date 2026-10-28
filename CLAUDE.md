# CLAUDE.md

Read docs/DECISIONS.md first. If two docs disagree, DECISIONS.md wins; if still unclear, ask. Build UI to the redesign: `docs/redesign/` and the shared components in `components/ui`. One phase per PR. No PR without passing tests. Never run migrations against production.

## Where things are

- Source of truth: `docs/DECISIONS.md`, then `docs/TCP-BUILD-SPEC.md` + `docs/SPEC-ADDENDUM.md`.
- Build plan and known conflicts: `docs/IMPLEMENTATION-PLAN.md`.
- Design: the redesign (October 2026) is current — tokens in `app/globals.css`, components in `components/ui` and `components/shell`, live examples at `/design-preview`, page-by-page record in `docs/redesign/BEFORE-AFTER.md`, screenshots of every route on the `design-qa` branch (`after/`). The older mockups in `docs/design/screens/` are superseded where they differ; use them only for screens the redesign did not touch.
- Speed: `docs/PERFORMANCE.md` (budgets, how it is measured, before/after, what is left); measured by `tests/e2e/zz-speed.e2e.ts`.
- Website copy: `docs/marketing/LANDING-COPY.md` (home: `docs/redesign/HOMEPAGE-COPY.md`); claims in `content/claims.ts`.

## Commands

- `npm run ci` — typecheck, lint, test, secret scan (what CI runs).
- `npm run test:local` — starts the throwaway Postgres on 127.0.0.1:5433, then runs every test.
- `npm run e2e` — browser tests (Phase 8): needs Docker and the Clerk development keys; see `tests/e2e/README.md`. CI also runs Lighthouse on the home and pricing pages (`lighthouserc.json`): it fails on a regression from the 26 Oct 2026 level; the goal (performance 90, largest paint 2.5 s) is printed with the results until met.
- Design QA: a push to a branch whose commit message holds `[design-qa:<stage>]` screenshots every route and runs axe (`.github/workflows/design-qa.yml`); `[design-qa:after]` fails on any serious axe finding.
- `npm run db:apply` applies migrations to `$DATABASE_URL`. Only ever point it at a local or staging database.
