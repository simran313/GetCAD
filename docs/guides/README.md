# User guides

Two guides and one report, written in Markdown and built into branded HTML and PDF.

| Output (`dist/`) | Source (`src/`) | For |
| --- | --- | --- |
| `admin-operations-manual.pdf` / `.html` | `admin-operations-manual.md` + `admin/*.md` | Administrators: every admin screen, procedure and fix |
| `platform-user-guide.pdf` / `.html` | `platform-user-guide.md` + `guide/*.md` | Clients, designers, pod leads, admins and staff |
| `coverage-report.pdf` / `.html` | `coverage-report.md` | What each section covers, and how it was verified |

Parts used by both guides live in `src/shared/`: account types, statuses, notifications, visibility, the walkthrough and the glossary. Edit them once.

## Build

```bash
node docs/guides/build.mjs            # all three
node docs/guides/build.mjs admin      # only sources whose name contains "admin"
```

The build:

- uses the repository's Playwright Chromium and needs no network;
- prints each PDF twice, so the contents page carries real page numbers;
- fails if a link points at a section that does not exist, if two headings share an id, or if an image is missing.

## Writing rules

- Use exact on-screen labels in **bold**. A path is written as **Menu** → **Item** → **Button**.
- One action per numbered step.
- Every claim must be true of the code or the running app. Anything unverified goes in the coverage report, not in a guide.
- Fictional names only: Northline Jewelers, DSG-0007, Rhino pod. Screenshots come from the throwaway e2e stack.
- Use they/them for people in examples.

## Markdown understood by `build.mjs`

| Write | Get |
| --- | --- |
| `# Title {#id}` (levels 1–4) | A heading. Level 1 starts a new page. `{#id}` is optional; ids are otherwise made from the text |
| `[text](#id)` | An internal link (clickable in the PDF) |
| `**bold**`, `*italic*`, `` `code` ``, `<kbd>Ctrl</kbd>` | Inline styles |
| `- item`, `1. step`, indented 3 spaces for a sub-list | Lists |
| GitHub tables | Tables; the header repeats on each PDF page |
| `> [!NOTE] Title`, `[!TIP]`, `[!WARNING]` ("Before you commit"), `[!IMPORTANT]`, `[!LIMIT]` ("Known limit") | Callouts |
| `![Caption](../assets/screens/x.png)` alone on a line, optionally `{.narrow}`, `{.half}` or `{.phone}` | A figure with a caption |
| `<!-- include: path.md -->` | That file's text, relative to the including file |
| `<!-- toc -->`, `<!-- pagebreak -->`, `<!-- anchor: some-id -->` | Contents, a page break, a link target |

## Screenshots

`assets/screens/*.png` are real captures of the portal on the throwaway test stack, with fictional data. They are made in CI, so nothing touches production:

1. Push a commit whose message contains `[design-qa:guide]` to `claude/gracious-hopper-amum18` or `design/redesign`. The Design QA workflow runs the e2e journeys, then `tests/design-qa/screens.qa.ts` (every route) and `tests/design-qa/guide.qa.ts` (open menus, dialogs, order states). It commits the images to the `design-qa` branch under `guide/`.
2. Fetch them and crop them into `assets/screens/`:

   ```bash
   git fetch origin design-qa
   mkdir -p /tmp/qa && git archive origin/design-qa guide | tar -x -C /tmp/qa
   node docs/guides/screens.mjs /tmp/qa/guide
   ```

3. Rebuild. Look at each new image before committing: no real names, emails or client data.
