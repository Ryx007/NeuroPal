# NeuroPal UI Redesign — Index & Checklist

**Owner:** Ryx · **Scope:** locked directives D1–D12 (see `03-LOCKED-DESIGN-DIRECTIVES.md`)
**Theme authored in:** Dark + Ruby (default) · **Frame:** 412 × 915
**Approach:** mockups produced directly as self-contained HTML/CSS (see `DECISIONS.md` → D0).
**Status legend:** ⬜ todo · 🟡 in progress · ✅ done

> Screenshots folder was empty (only a placeholder). Built from the docs +
> the actual `source/` JSX (better than screenshots — real wiring & copy).

---

## Queue checklist

| # | Screen | Directives | Files | Status |
|---|--------|-----------|-------|--------|
| 1 | Global Shell | D1, D3, D4, D5 | `1-global-shell/mockup.html` | ✅ |
| 2 | Reader | D8, D9, D10 | `2-reader/mockup.html`, `mockup-v2.html` | ✅ |
| 3 | Library | D11 | `3-library/mockup.html` | ✅ |
| 4 | Visualizer | D12 | `4-visualizer/mockup.html` | ✅ |
| 5 | Toolbox | D7 | `5-toolbox/mockup.html` | ✅ |
| 6 | Settings | D2 | `6-settings/mockup.html` | ✅ |
| 7 | Home / Notes / Profile | D1/D3/D4 re-render | `7-home-notes-profile/mockup.html` | ✅ |

**All 7 queue items complete — 18 files.** ✅ Definition of Done met.

Foundation: `_shared/tokens.css`, `_shared/README.md`, `DECISIONS.md` ✅

---

## Chosen defaults (owner can override)
- **Shell:** single drawer, 300px, `.glass--deep`; header keeps avatar + wordmark; no new color roles.
- **Reader player:** **Variation A (docked mini-player)** = default; Variation B (`mockup-v2.html`) = its expand state. WPM lives on the player. Atkinson 19pt/1.75; KaTeX in Text mode + Original-pages fallback.
- **Library:** arXiv search = header-triggered **collapsible panel** (in-place, not a route); shelf = **2-col book-cover grid**; connection banner kept prominent.
- **Visualizer:** Bloch model = **time-scrub + β tilt + X/H/T presets + live θ/φ/⟨σ⟩ readout + dotted arcs**; interference = the template-CSS styling reference.
- **Toolbox:** rename + re-render only; kept the mono timer (no ring) to honor “same contents.”
- **Settings:** **full-screen** grouped screen (not a sheet), with live typography preview.
- **Home/Notes/Profile:** straight re-render into the shell; content untouched.

## Choices awaiting the owner
- **Shell:** header avatar *and* drawer Profile, or drawer-only? (default: both). Dedicated `success` toast color vs reuse `--secondary` (default: reuse).
- **Reader:** WPM on player vs Display-options-only (default: player). Promote Ask margin-notes → full doc-chat thread (recommended follow-up, out of strict D-scope).
- **Library:** 2-col grid vs current rich single-column rows (default: grid). Wire filter chips for real, or cut (default: leave visual, as today). Keep arXiv category filters or minimal single field.
- **Visualizer:** precession+presets model vs an explicit gate-sequence builder (default: precession+presets). SVG spec vs Three.js/expo-three for production (dev’s call).
- **Toolbox (optional, out of D7 scope):** timer progress ring + arbitrary date/time reminder picker.
- **Settings:** full screen vs drawer-launched sheet (default: screen). Wire `Density` for real effect, or cut.

## Backend follow-ups these designs assume (later pushes, per the directives)
- **D9** equation extraction (MathML→LaTeX; PDF/scanned→math-OCR→LaTeX→KaTeX).
- **D11** arXiv query + fetch + ingest endpoint.
- **D12** Manim-grade template rework in `data/vizTemplates.js` (`BASE_CSS`), possibly with a math/animation lib.
- Not in this pass (flagged, owner’s later call): Home mock data → real; Notes editor wishlist; Profile stub buttons; filter-chip filtering; Density effect.

## Blockers
- **None.** Run completed end-to-end. (No `BLOCKERS.md` written — nothing blocked.)

## Verification performed
- Static checks on all 8 mockups: semantic tokens present in every file (`--accent:#FF7F8E` ×8), no leftover/malformed code (searched for stray placeholders, `undefined`/`NaN`, broken CSS/JS — none), `<script>` tags balanced, KaTeX + interactive JS (Bloch math, toast auto-hide, sliders) re-read and confirmed sound.
- **Live browser preview was not run**: the in-app browser tool refuses `file://`, and the sandbox can't run headless Chromium (missing system libs, no sudo) or reach the user's machine to serve over http. Preview is optional in the brief; the HTML is standard and self-contained, so opening any `mockup.html` by double-click will render it (internet on for Google Fonts + KaTeX). If you'd like, I can screenshot each in a follow-up once a renderer is available.

## Directive coverage map
- D1 Left drawer → Q1 · D2 Settings screen → Q6 · D3 Liquid glass → all ·
  D4 Safe area + tinted status bar → all · D5 Dismissible/auto-hide toast → Q1 ·
  D7 Toolbox rename → Q5 · D8 Play-Books reader → Q2 · D9 Equation rendering → Q2 ·
  D10 Tidal player → Q2 · D11 arXiv search → Q3 · D12 Manim-grade visualizer → Q4.
  D6 (keyboard-aware inputs) is behavioral — noted in Library/Toolbox/Settings NOTES.
