# The CAD Pillar: documentation

Start with **[DECISIONS.md](./DECISIONS.md)**. It is the source of truth for business rules and wins over any other document. For everything technical, the **Master Technical Handbook** is the permanent reference: one Markdown chapter per topic below, published as a PDF and a Word document.

## Master Technical Handbook

| | |
|---|---|
| PDF (read and share) | [master-documents/THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.pdf](./master-documents/THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.pdf) |
| Word (editable copy) | [master-documents/THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.docx](./master-documents/THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.docx) |
| Build report | [master-documents/build-report.json](./master-documents/build-report.json) |

The PDF and DOCX are **generated**. Edit the Markdown below, then regenerate (see the end of this page). Edits made directly in the Word file are lost on the next build.

### Chapters (Markdown sources)

| # | Chapter | Folder |
|---|---|---|
| 1 | [Executive technical overview](./founder-guide/01-executive-overview.md) | founder-guide |
| 2 | [Complete application architecture](./architecture/02-application-architecture.md) | architecture |
| 3 | [Founder's technical education](./founder-guide/03-founder-technical-education.md) | founder-guide |
| 4 | [Frontend and backend](./architecture/04-frontend-and-backend.md) | architecture |
| 5 | [Database schema, relationships and row-level security](./database/05-database-schema-and-rls.md) | database |
| 6 | [Authentication, authorisation and the role matrix](./security/06-authentication-and-authorization.md) | security |
| 7 | [API and Server Action documentation](./api/07-api-and-server-actions.md) | api |
| 8 | [File storage and CAD intellectual-property protection](./security/08-file-storage-and-ip-protection.md) | security |
| 9 | [Security audit and vulnerability register](./security/09-security-audit.md) (sanitised) | security |
| 10 | [Infrastructure, GitHub, Vercel and deployment workflows](./architecture/10-infrastructure-and-deployment.md) | architecture |
| 11 | [Third-party integrations](./architecture/11-third-party-integrations.md) | architecture |
| 12 | [Feature-by-feature technical reference](./features/12-feature-reference.md) | features |
| 13 | [Developer onboarding and maintenance](./developer-handover/13-developer-onboarding.md) | developer-handover |
| 14 | [Troubleshooting and disaster recovery](./developer-handover/14-troubleshooting-and-disaster-recovery.md) | developer-handover |
| 15 | [Technical debt and scalability roadmap](./developer-handover/15-technical-debt-and-roadmap.md) | developer-handover |
| 16 | [Production readiness checklist](./developer-handover/16-production-readiness-checklist.md) | developer-handover |
| 17 | [Architecture and workflow diagrams](./diagrams/17-diagram-atlas.md) | diagrams |
| 18 | [Glossary of technical terms](./founder-guide/18-glossary.md) | founder-guide |
| 19 | [Audit method, assumptions and missing access](./security/19-audit-method-and-assumptions.md) | security |
| A | [Database schema reference](./database/generated/schema.md) (generated) | database/generated |
| B | [Database functions reference](./database/generated/functions.md) (generated) | database/generated |
| C | [Routes reference](./api/generated/routes.md) (generated) | api/generated |
| D | [Server actions reference](./api/generated/server-actions.md) (generated) | api/generated |
| E | [Configuration variables, names only](./architecture/generated/environment.md) (generated) | architecture/generated |

### Folder map

```
docs/
  architecture/          ch. 2, 4, 10, 11 + generated/environment.md
  security/              ch. 6, 8, 9, 19 (sanitised; the restricted annex is never committed)
  database/              ch. 5 + generated/schema.md, generated/functions.md
  api/                   ch. 7 + generated/routes.md, generated/server-actions.md
  features/              ch. 12
  developer-handover/    ch. 13–16
  founder-guide/         ch. 1, 3, 18
  diagrams/              ch. 17 · *.svg (Markdown and PDF) · png/*.png (Word) · src/*.mjs (editable sources)
  master-documents/      the generated PDF and DOCX, build-report.json
  document-sources/      handbook.json (chapter order, metadata) · reference.docx (Word styles)
  document-generation/   extract-reference.mjs · diagrams.mjs · build-handbook.mjs · make_reference_docx.py
```

### Regenerate

```bash
npm ci && npm run test:db:up                       # local throwaway Postgres on 127.0.0.1:5433
DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres \
  node docs/document-generation/extract-reference.mjs   # appendices A–E from the code
node docs/document-generation/build-handbook.mjs        # diagrams, PDF, DOCX, build report
```

Needs pandoc ≥ 3.1 on the PATH. LibreOffice is optional; with it, the DOCX contents page gets page numbers and is checked. Change Word styles in `document-generation/make_reference_docx.py` and run it with `python3`. Details are in chapter 13.

### Security material

Chapter 9 is safe for this repository. Exploit-sensitive evidence (exact grants, infrastructure names, verification queries, remediation SQL) lives in a **restricted annex held by the owner outside the repository**. `.gitignore` excludes `docs/security/restricted/` and any file with `RESTRICTED` in its name.

## Other documents

| Document | Purpose |
|---|---|
| [DECISIONS.md](./DECISIONS.md) | Business decisions (source of truth) |
| [SYSTEM.md](./SYSTEM.md), [OPERATIONS.md](./OPERATIONS.md) | How an order moves; every action per role (superseded where they disagree with DECISIONS) |
| [TCP-BUILD-SPEC.md](./TCP-BUILD-SPEC.md), [SPEC-ADDENDUM.md](./SPEC-ADDENDUM.md), [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | Original specification and build plan |
| [DEPLOY.md](./DEPLOY.md), [LAUNCH.md](./LAUNCH.md), [CLERK-PRODUCTION.md](./CLERK-PRODUCTION.md) | Deployment, go-live, Clerk production switch |
| [PERFORMANCE.md](./PERFORMANCE.md), [SEO.md](./SEO.md), [EMAIL.md](./EMAIL.md) | Speed budgets, search, email |
| [BLACKBOX.md](./BLACKBOX.md), `PHASE-*-ROLLOUT.md` | Acceptance tests and phase runbooks |
| [guides/](./guides/README.md) | Platform User Guide and Admin Operations Manual (for people using the portal) |
| [redesign/](./redesign/REVAMP-NOV-2026.md), [design/](./design/README.md), [marketing/](./marketing/LANDING-COPY.md) | Design system and copy |
