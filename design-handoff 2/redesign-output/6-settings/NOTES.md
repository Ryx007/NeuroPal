# 6 — Settings — NOTES

**Directive:** D2 (Tweaks content → Settings drawer destination)
**File:** `mockup.html` (2 frames: appearance+typography · layout+audio)

## What changed
- **D2 — Tweaks → Settings.** The content of the old **Tweaks sheet** moves to a
  **Settings** screen reached via **Drawer → Settings** (D1). The header hamburger
  no longer opens it (it opens the drawer). Presented as a **full screen** (chosen
  default) so all accessibility-critical controls fit without a cramped modal.
- Grouped into **Appearance · Reading (typography) · Reading (layout) · Audio**,
  with a **live typography preview** (drag Font size / Line spacing to see it react;
  tap a Reader font to swap the face). Accent shown as color swatches.

## Elements touched (→ `02` Tweaks table) — all preserved with dispatch
Theme → `setTheme` (Dark/Sepia/Light/Contrast) · Accent → `setAccent`
(Ruby/Cyan/Purple/Green) · Reader font → `setReaderFont` (Inter/Atkinson/Dyslexic/
Lora/Fraunces) · Reader layout → `setReaderLayout` (Split/Focus/Paginated) ·
Density → `setDensity` (Calm/Dense) · Font size → `setFontSize` · Line spacing →
`setLineSpacing` · WPM → `setWpm` · Voice → `setVoice`. Source: `selectUiState`.

## Recommended default
- **Full-screen Settings** (not a sheet). Grouped sections + live preview. This is
  the default.

## Choices left for owner
- **Screen vs sheet:** D2 allows either; default is full screen. If you prefer a
  drawer-launched bottom sheet, the same groups drop into a sheet.
- **Density** (`02` note: “barely affects anything”): kept as a control to preserve
  its dispatch; wire it to real effect or cut later — owner’s call, out of scope now.
- Font/size/theme are intentionally duplicated into the Reader’s Display options
  (D8) — same store, two entry points (recommended for accessibility reach).

## Backend / behavioral notes
- Pure client state (`uiSlice`); no backend. D6 keyboard-aware if any field is added.
