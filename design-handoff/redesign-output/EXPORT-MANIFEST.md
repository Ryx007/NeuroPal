# NeuroPal Redesign — Export Manifest

Everything Claude Code needs to build the redesign + backend. Point Claude Code at
the NeuroPal repo and this package. **Start with `redesign-output/00-BUILD-BRIEF-FOR-CLAUDE-CODE.md`.**

## Package tree (`design-handoff/`)

```
design-handoff/
├── 00-README.md                     # original handoff readme
├── 01-DESIGN-SYSTEM.md              # semantic color tokens, fonts, material  ← READ
├── 02-SCREENS-AND-ELEMENTS.md       # per-element wiring contract (preserve)  ← READ
├── 03-LOCKED-DESIGN-DIRECTIVES.md   # D1–D12 — THE SCOPE                       ← READ
├── 04-CLAUDE-DESIGN-PROMPT.md       # (design-phase prompt; context only)
├── 05-COWORK-WORKFLOW.md            # (process notes; context only)
├── source/                          # snapshot of the current app (screens, store,
│                                    #   theme, navigation, components) referenced by 02
├── screenshots/                     # (was empty — built from docs + source)
└── redesign-output/                 # ← THE DELIVERABLE
    ├── 00-BUILD-BRIEF-FOR-CLAUDE-CODE.md   # implementation plan (FE+BE)       ← START HERE
    ├── REDESIGN-INDEX.md                   # checklist, chosen defaults, open choices
    ├── DECISIONS.md                        # autonomous decisions log (incl. approach)
    ├── EXPORT-MANIFEST.md                  # this file
    ├── _shared/
    │   ├── tokens.css                      # canonical tokens + .glass material
    │   └── README.md                       # how the mockups are structured
    ├── 1-global-shell/    mockup.html · NOTES.md          # D1 D3 D4 D5
    ├── 2-reader/          mockup.html · mockup-v2.html · NOTES.md   # D8 D9 D10 (player A/B)
    ├── 3-library/         mockup.html · NOTES.md          # D11 arXiv search
    ├── 4-visualizer/      mockup.html · NOTES.md          # D12 Bloch + interference
    ├── 5-toolbox/         mockup.html · NOTES.md          # D7 rename
    ├── 6-settings/        mockup.html · NOTES.md          # D2 settings screen
    └── 7-home-notes-profile/  mockup.html · NOTES.md      # D1/D3/D4 re-render
```

## What each mockup proves
- **Interactive** in-browser: shell drawer + 5s toast; reader player play/scrub;
  library arXiv expand + Add; visualizer Bloch scrubber + live θ/φ/⟨σ⟩ readout;
  settings live typography preview. Open any `mockup.html` (internet on for
  Google Fonts + KaTeX).

## Directive → file
D1/D3/D4/D5 → `1-global-shell` · D2 → `6-settings` · D7 → `5-toolbox` ·
D8/D9/D10 → `2-reader` · D11 → `3-library` · D12 → `4-visualizer` ·
re-render → `7-home-notes-profile`. D6 (keyboard-aware) is behavioral (noted in NOTES).

## Not included / by design
- No app source edits, no git changes, no secrets. Backend endpoints (D9 extraction,
  D11 arXiv, D12 templates, Module 1/2/4/5/6/7 routes) are **specified** in the build
  brief for Claude Code to implement — not pre-written here.
