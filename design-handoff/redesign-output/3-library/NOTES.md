# 3 — Library — NOTES

**Directive:** D11 (collapsible arXiv search) + restyle of the document grid
**File:** `mockup.html` (3 frames: shelf/collapsed · search expanded · results + Add)

## What changed
- **D11 — arXiv search.** A **search icon in the header** expands a **collapsible
  search box** (animates open; tap again / “esc” collapses). Query field takes
  title / author / arXiv id, with optional category filters (quant-ph, Author,
  Recent). Results show **title · authors · abstract snippet · arXiv id · year**,
  each with **“Add to Library.”** On add → downloads + ingests → the paper appears
  on a shelf card with the normal **ingesting → ready** progress (frame 3 row 2
  shows the “Ingesting…” hand-off; frame 1 shows an ingesting card).
  Interactive: click the header 🔍 in frame 1 to expand; “Add” buttons flip to
  “Ingesting…”.
- **Restyle (not a directive, natural with the pass):** `DocCard` → a book-cover
  grid tile — colored spine + type badge (PDF/EPUB/arXiv/DOCX), 2-line title,
  authors/pp, and a **reading-progress ring** kept visually distinct from the
  **ingest progress bar** (the `02` distinction). Upload tile + FAB kept; filter
  chips restyled; the **connection-error banner + Retry** kept prominent (shown in
  the extras panel).

## Elements touched (→ `02` Library table)
Header title/subtitle; **arXiv search (NEW → D11)**; filter chips (visual today);
connection error banner + Retry; `DocCard` (tap → Reader, long-press ⋮ →
`DocActionsSheet`); type badge; ingest progress vs reading progress; Continue/Ready;
Upload card + FAB; `DocActionsSheet` rename/delete.

## Recommended default
- arXiv search as a **header-triggered collapsible panel** (in-place, not a
  separate route) — recommended. Book-cover 2-col grid as the shelf default.

## Choices left for owner
- **Grid vs list:** default is a 2-column book-cover grid. If you prefer the
  current rich single-column rows, that’s a layout swap — flagged.
- **Filter chips:** still visual-only in code (`02`). Wire real filtering or cut —
  owner’s call later; left visual here to match current behavior.
- **arXiv filters:** included quant-ph/Author/Recent as optional; drop if you want
  the minimal single-field version.

## Backend / behavioral notes
- **arXiv query + fetch + ingest endpoint is a later push** (designed as if it
  works). D6 keyboard-aware on the search field and the rename field.
