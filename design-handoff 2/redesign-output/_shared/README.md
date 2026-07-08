# redesign-output/_shared

Shared reference for the developer. The mockups themselves are **self-contained**
(each `.html` inlines its own tokens + fonts), so they open with a double-click,
no build step, internet on (Google Fonts + KaTeX load from CDN).

- `tokens.css` — the semantic color tokens (Dark + Ruby) as CSS variables, plus
  the `.glass` / `.glass--deep` liquid-glass material (D3). This is the canonical
  mapping: `--surface-container` → `palette.surfaceContainer`, etc. Every mockup
  uses the identical `:root` block.

## How to read a mockup
Each queue folder has `mockup.html` (open in any browser). Phone frames are
**412 × 915** (Galaxy S24 Ultra logical width). Where a directive asked for
variations, you'll find `mockup-v2.html` (and a recommended default noted in
`NOTES.md`). Every folder's `NOTES.md` lists: which **D#**, what changed, the
elements touched (mapped to `02-SCREENS-AND-ELEMENTS.md`), the recommended
default, and any choice left for the owner.

## Fonts used
Space Grotesk (display/titles/buttons), Inter (body/UI), JetBrains Mono
(numbers/timers), Atkinson Hyperlegible (reader body). All from Google Fonts.
"Dyslexic" reader option → OpenDyslexic on-device (already bundled); mockups
fall back to Atkinson.

## What is NOT here
No app source changes, no backend, no git. These are design specs only. Backend
-dependent directives (D9 equation extraction, D11 arXiv fetch/ingest, D12
Manim-grade template rework) are designed "as if they work" and flagged in NOTES.
