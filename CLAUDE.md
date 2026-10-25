# CLAUDE.md

Read docs/DECISIONS.md first. If two docs disagree, DECISIONS.md wins; if still unclear, ask. Build UI to match docs/design/. One phase per PR. No PR without passing tests. Never run migrations against production.

## Where things are

- Source of truth: `docs/DECISIONS.md`, then `docs/TCP-BUILD-SPEC.md` + `docs/SPEC-ADDENDUM.md`.
- Build plan and known conflicts: `docs/IMPLEMENTATION-PLAN.md`.
- Screens: `docs/design/screens/*.html` (index in `docs/design/README.md`). Sample data in them is placeholder.
- Website copy: `docs/marketing/LANDING-COPY.md`.

## Commands

- `npm run ci` — typecheck, lint, test, secret scan (what CI runs).
- `npm run test:local` — starts the throwaway Postgres on 127.0.0.1:5433, then runs every test.
- `npm run e2e` — browser tests (Phase 8): needs Docker and the Clerk development keys; see `tests/e2e/README.md`.
- `npm run db:apply` applies migrations to `$DATABASE_URL`. Only ever point it at a local or staging database.
