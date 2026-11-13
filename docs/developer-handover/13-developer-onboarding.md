# Developer onboarding and maintenance

Everything a new developer needs to become productive and safe on The CAD Pillar in the first week, plus the routine maintenance that keeps the platform healthy.

## Day 1: read, in this order

1. `CLAUDE.md`: the house rules. `docs/DECISIONS.md` wins over every other document; one phase per pull request; no pull request without passing tests; never run migrations against production.
2. `docs/DECISIONS.md`: what the business has decided (roles, prices, payouts, SLA, deliverables, QC).
3. This handbook, chapters 2, 4, 5, 6 and 8.
4. `docs/SYSTEM.md` and `docs/OPERATIONS.md`: the order life cycle and every action per role.
5. `docs/redesign/REVAMP-NOV-2026.md` and `/design-preview`: the design system you build with.

## Machine setup

| Need | Version | Why |
|---|---|---|
| Node.js | ≥ 20 (CI uses the version in `ci.yml`) | Next.js 15, scripts |
| npm | bundled | `npm ci` from `package-lock.json` |
| Docker | recent | The throwaway test Postgres (`docker compose`), and PostgREST for e2e |
| Git | recent | |
| Playwright Chromium | `npx playwright install chromium` | e2e and design QA |
| pandoc ≥ 3.1, LibreOffice (optional) | | Only to regenerate this handbook's DOCX and check it |

```bash
git clone https://github.com/simran313/GetCAD && cd GetCAD
npm ci
cp .env.example .env.local      # fill with DEVELOPMENT values only (Clerk dev keys, a dev Supabase project)
npm run test:db:up              # throwaway Postgres on 127.0.0.1:5433 (trust auth, tmpfs)
npm run ci                      # typecheck, lint, all tests, secret scan; must pass before you start
npm run dev                     # http://localhost:3000
```

Never put production keys in `.env.local` on a development machine. The only production credential a developer may need is `DATABASE_URL`, for applying a migration the owner has approved, from a trusted machine.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run typecheck` / `npm run lint` | Strict TypeScript; ESLint, including the `core/` boundary rule |
| `npm test` | All vitest suites (needs the test database) |
| `npm run test:local` | Starts the test database, then runs every test |
| `npm run ci` | Exactly what CI's `verify` job runs |
| `npm run e2e` | Browser journeys (needs Docker and the Clerk **development** keys; see `tests/e2e/README.md`) |
| `npm run db:status` / `npm run db:apply` | Show or apply pending migrations to `$DATABASE_URL` (local or staging; production only by the owner) |
| `npm run secret-scan` | Scans the working tree for secrets |
| `npm run verify:payment` / `verify:payout` / `verify:delivery` | Razorpay checks (see `docs/LAUNCH.md`) |

## How to…

### Add a page

1. Create `app/(app)/<segment>/page.tsx`. If it is a new top-level segment, add it to `APP_ROUTE_SEGMENTS`, and to `PROTECTED_PREFIXES` if it needs sign-in (`core/auth/session.ts`). The route-inventory test fails otherwise.
2. Read data with `createUserSupabaseClient()`, never the service role, through a visibility function or an RLS-protected table.
3. Use `components/ui` and `components/shell`, tokens only, no hard-coded colours or pixel offsets for fixed bars (`--chrome-top`, `--chrome-bottom`).
4. Add it to role navigation if needed (`core/nav`).
5. Commit with `[design-qa:after]` in the message when the change is visual, so screenshots and axe run.

### Add a server action

Follow the checklist in chapter 7: `"use server"`, `auth()`, the user client, a database function that checks the caller, validation, `revalidatePath`, friendly errors, tests.

### Change the database

Follow chapter 5, "Changing the schema safely": a new numbered migration, RLS on, a policy or function per access path, `search_path` pinned, explicit grants, audit writes, and a `tests/db/*.test.ts` that proves allowed and refused callers. **Never** edit an applied migration. **Never** run tests against a remote database; the harness refuses.

### Add a test

| Kind | Where | Runs in |
|---|---|---|
| Pure logic | next to the module (`core/**/x.test.ts`) | vitest |
| Database (RLS, functions, invariants) | `tests/db/*.test.ts`, using `connectFreshDb()` from `tests/helpers/db.ts` | vitest + the throwaway Postgres |
| Config and route rules | `tests/config/*.test.ts` | vitest |
| User journeys | `tests/e2e/*.e2e.ts` | Playwright in CI's `e2e` job |
| Visual and accessibility | `tests/design-qa/*.qa.ts` | The design-qa workflow |

### Handle money

Integers only (cents, paise), using `core/money` helpers. Never compute a client's price where a pod lead or designer can read it. Ledger rows are append-only: correct with a new row.

### Handle identities

Never join identity tables into a query a client or designer can run. Admin identity reads go through `record_identity_lookup` / `lib/clerk/identities.ts` and are logged. Run the anonymity e2e suite for any change near orders, threads or files.

## Code conventions

- TypeScript strict; no `any` without a comment explaining why.
- `core/` is pure: no React, no Next.js, no I/O.
- Server-only modules import `server-only`.
- File and component names are kebab-case for components and camelCase for helpers, matching the folder you are in.
- Copy is plain, short and specific (see the redesign docs). No claims that are not in `content/claims.ts`.
- Comments explain *why*, especially for security decisions.

## Pull requests

- One phase or feature per pull request. Title in plain English.
- A description that covers what changed, why, how it was tested, any migration and its rollback, and screenshots for UI.
- CI green (`verify` and `e2e`). Design QA for visual changes.
- Do not merge your own pull request into production without the owner's review.

## Routine maintenance

| Cadence | Task | How |
|---|---|---|
| Weekly | Dependency advisories | `npm audit --omit=dev`; open one upgrade pull request for anything High or Critical |
| Weekly | Scheduled-job health | GitHub → Actions → push-dispatch: recent runs green |
| Weekly | Error review | Vercel → Logs → Level: Error |
| Monthly | Audit chain | `SELECT audit.verify_chain();` → `{"valid": true}` |
| Monthly | Email queue | `email_outbox` rows stuck or failing |
| Monthly | Storage growth | Supabase → Storage usage; orphaned files |
| Quarterly | Security review | Re-run chapter 9's method; update the register |
| Quarterly | Restore drill | Restore a backup into a scratch project (chapter 14) |
| Quarterly | Access review | Vercel, GitHub, Supabase, Clerk, Razorpay members; remove leavers |
| On every release | Health check | `/api/health`; quick role walkthrough (chapter 16) |

## Regenerating this handbook

The Markdown in `docs/` is the source of truth. The PDF and Word files are generated.

```bash
# 1. Refresh the code-derived appendices (needs a local Postgres on 127.0.0.1:5433)
npm run test:db:up
DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres \
  node docs/document-generation/extract-reference.mjs

# 2. Re-render diagrams, then build the PDF and DOCX into docs/master-documents/
node docs/document-generation/build-handbook.mjs
```

Requirements: Node ≥ 20 with the repository's dependencies installed (Playwright Chromium, pdfjs-dist), and **pandoc ≥ 3.1** on the PATH. LibreOffice is optional; with it, the build also renders the DOCX to PDF to check pagination. The chapter order and metadata are in `docs/document-sources/handbook.json`. Diagram sources are in `docs/diagrams/src/*.mjs`. Edit those, never the SVG or PNG outputs.
