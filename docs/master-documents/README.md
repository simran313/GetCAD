# Master documents

Generated deliverables of the Master Technical Handbook. **Do not edit these files**: they are rebuilt from the Markdown in `docs/` by `node docs/document-generation/build-handbook.mjs` (see [docs/README.md](../README.md)).

| File | What it is |
|---|---|
| `THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.pdf` | The reference edition. A4, cover, clickable contents with page numbers, numbered chapters, running headers and footers, PDF bookmarks, vector diagrams. |
| `THE-CAD-PILLAR-MASTER-TECHNICAL-HANDBOOK.docx` | An editable Word copy with the same content. Word refreshes the contents page numbers when the file is opened (accept the prompt to update fields); entries are pre-filled and clickable in any viewer. |
| `build-report.json` | What the last build produced and checked: page counts, sizes, chapters found in both files, contents entries located, diagrams embedded, LibreOffice render. |

The code revision the handbook describes is printed on the cover and in `build-report.json`.
