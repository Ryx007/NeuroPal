# 2 — Reader — NOTES

**Directives:** D8 (Play-Books immersive), D9 (equation rendering), D10 (Tidal player)
**Files:** `mockup.html` (immersive view + TOC + Original-pages + player **Variation A**), `mockup-v2.html` (player **Variation B**)

## What changed
### D8 — Google Play Books immersive reader
- Busy header, left `Minimap`, and `‹ Part 1/25 ›` are gone. Content-first surface,
  generous margins, comfortable measure. **Tap center toggles chrome** (top bar +
  player), which auto-hides while reading.
- **Top bar** = back · title/subtitle · **Contents** · **Display options (Aa)** ·
  overflow (⋮, holds Study 🎓). Clean, liquid glass.
- **Table of Contents** replaces `‹ Part N/M ›` (frame R2): chapter list, jump on
  tap, current chapter highlighted; a **position scrubber with chapter ticks**
  is shared with the player.
- **Original pages** view kept (frame R3) as the equation-fidelity fallback; Text ⇄
  Pages toggle, pinch-zoom + page jump added. **Citation graph cut** (dead).

### D9 — Equation rendering (KaTeX-quality)
- Inline + block math rendered with **real KaTeX** in the mockup (see the block
  eq. (3.14) and the before→after card). Shows the target the way Claude/ChatGPT/
  Gemini render math. **TTS skips equations**; the karaoke highlight steps over them.
- Flagged **backend-dependent**: extraction (MathML → LaTeX; PDF/scanned → math-OCR
  → LaTeX) is a later push. The *look* is now fixed.

### D10 — Tidal-style player (2 variations, both keep the contract)
- **Variation A — docked mini-player (recommended default, `mockup.html`)**:
  slim scrubber w/ chapter ticks on top → **◀ ⏯ ▶ centered** → **tone
  (Soft/Natural/Deep)** bottom-left + **WPM pill** bottom-right. Tinted glass,
  hides with chrome.
- **Variation B — full-screen now-playing (`mockup-v2.html`)**: same order, larger,
  with cover + title + chapter, big scrubber (elapsed/remaining), WPM stepper.
- **Ask** moved OUT of the bar to a **translucent top-right glass button** (both
  variations).

## Elements touched (→ `02` Reader table)
`ReaderHeader` (→ Play-Books top bar, citation-graph removed), `PartNav` (→ TOC +
scrubber), reader body/`ParagraphText` (karaoke preserved: word tap-to-seek +
current-word highlight + read/unread dim), in-body equations (→ D9), long-press →
**Explain** (selection popover shown), `PlaybackBar` (→ Tidal player), Ask (→
top-right float), `Minimap` (cut), `CitationGraphDialog` (cut), Original pages
(kept), Study (🎓 in overflow → `StudySheet`).

## Recommended default
- **Player: Variation A (docked).** Ship A as default, B as its expanded state
  (one component, two heights).
- Reading font Atkinson Hyperlegible @ 19pt / 1.75 spacing shown; all honor Settings.

## Choices left for owner
- **WPM placement**: shown as a pill on the player’s bottom row (A) / a stepper (B).
  Alt option: put it inside Display options only. Default keeps it on the player
  (it’s an accessibility/reading-speed control, per D10).
- **Ask target**: opens the doc Q&A thread. `02` suggests promoting margin-note
  answers into a full doc-chat thread — recommended, but out of this directive’s
  strict scope; flagged for a follow-up.
- **Equation source of truth** when both exist: render KaTeX in Text mode, keep
  Original-pages as the fallback. Default as shown.

## Backend / behavioral notes
- D9 extraction/conversion + D-chat persistence (`/documents/:id/chat`) are later
  pushes. D6 keyboard-aware applies to the Ask input.
