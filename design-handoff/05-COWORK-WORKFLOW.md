# NeuroPal — Claude Cowork autonomous workflow

Paste the block below into **Claude Cowork**. Before you do, make sure:
1. Cowork can access this package — either the folder
   `/Users/ryx/Documents/Gitkraken/NeuroPal/design-handoff/` on this machine,
   **or** attach `design-handoff.zip` to the Cowork session.
2. The browser Cowork uses is **logged in to claude.ai** (Claude Design).
3. Your screenshots are in `design-handoff/screenshots/` (optional but helpful).

Scope note: Cowork's job is to **produce the redesign inside Claude Design**
(high-fidelity, coded mockups + specs for every directive) and save them
neatly. It does **not** edit the app's source code — that's the later
development push. You'll review/tinker with the saved designs first.

---

## PASTE THIS INTO CLAUDE COWORK

```
MISSION
You are running autonomously while I'm away — I cannot answer questions, so
make sensible default decisions and keep going. Drive Claude Design to produce
a complete, high-fidelity redesign of my React Native app "NeuroPal" per a
LOCKED set of directives (D1–D12), and save every output neatly for my
developer. You are producing the DESIGN (high-fidelity mockups + specs) inside
Claude Design ONLY — do NOT edit my app's source code, do not push git, do not
share anything externally.

INPUTS (the "design-handoff" package)
- Prefer the local folder: /Users/ryx/Documents/Gitkraken/NeuroPal/design-handoff/
- If you don't have local access, unzip the attached design-handoff.zip.
Key files: 03-LOCKED-DESIGN-DIRECTIVES.md (THE SCOPE, D1–D12), 01-DESIGN-SYSTEM.md
(color tokens/fonts/material), 02-SCREENS-AND-ELEMENTS.md (per-element wiring to
preserve), 04-CLAUDE-DESIGN-PROMPT.md (the exact prompts to use), screenshots/
(current app — if empty, proceed using the docs and note it).

SETUP
1. Open a browser to claude.ai and confirm I'm logged in. If NOT logged in, do
   not attempt credentials — save a note in redesign-output/BLOCKERS.md and stop.
2. Start a new chat/Project named "NeuroPal UI redesign".
3. Attach to the first message: 03-LOCKED-DESIGN-DIRECTIVES.md,
   01-DESIGN-SYSTEM.md, 02-SCREENS-AND-ELEMENTS.md, and every image in screenshots/.
4. Open 04-CLAUDE-DESIGN-PROMPT.md, copy its "MASTER PROMPT" block verbatim,
   paste it as the first message, and send. (Do not attach file 04 — it's your
   instructions.)

WORK QUEUE (do in order; one screen per Claude Design turn; use the
"FOLLOW-UP TEMPLATE" from file 04 for each). SAVE after every screen.
1. GLOBAL SHELL — D1 left drawer (show open + closed over Home), D3 tinted
   liquid-glass material, D4 safe area + tinted status bar, D5 dismissible
   auto-hide-5s toast.
2. READER — D8 Google-Play-Books immersive view (include a properly RENDERED
   block equation, KaTeX-quality), the Table-of-Contents, and D10 the
   Tidal-style player (scrubber on top, ◀ ⏯ ▶ centered, tone/voice at bottom,
   translucent "Ask" button top-right). Get 2 player variations.
3. LIBRARY — D11 collapsible arXiv search: show collapsed, expanded, a results
   list, and "Add to Library"; plus the restyled document card grid.
4. VISUALIZER — D12 gallery + the Bloch sphere with DOTTED trajectory arcs and
   a LIVE interactive coordinate readout (θ, φ, ⟨σx,y,z⟩); also upgrade one more
   sim (interference) as a sample of the Manim/Qiskit look.
5. TOOLBOX — D7 (Pomodoro + Reminders, renamed from "Anchors"), on the new material.
6. SETTINGS — D2 (the old "Tweaks" content — theme/accent/reader font/layout/
   density/size/spacing/WPM/voice — as a screen reached from the drawer).
7. HOME, NOTES, PROFILE — these are NOT redesigns. Just re-render each inside
   the new shell/material/safe-area (D1/D3/D4) and keep their current content
   and layout.

RULES (enforce from the uploaded docs)
- Colors: ONLY the semantic tokens in 01 (design in dark + ruby: bg #131313,
  card #1F2020, text #E4E2E1, muted #D0C6C8, accent #FF7F8E, deep #8E1030, gold
  #F3C77B, error #FFB4AB, warn #FFD27A). Fonts: Space Grotesk / Inter /
  JetBrains Mono. Material: tinted Liquid Glass.
- Change ONLY what the directives name. Keep every element's job + the data it's
  bound to (right columns in 02) and keep accessibility (screen-reader labels,
  dyslexia font, contrast theme, adjustable size/spacing). For non-directive
  screens, only apply the new shell/material/safe-area.
- Where variations are requested, generate 2–3, pick a recommended DEFAULT, and
  keep them all — I'll choose later.
- Ask Claude Design for high-fidelity, self-contained HTML/CSS mockups in a
  412×915 phone frame + a short "what changed / which D# / elements" note.

SAVING (do this after EVERY screen so nothing is lost)
Create design-handoff/redesign-output/ with one folder per queue item:
  redesign-output/1-global-shell/  -> mockup.html (+ mockup-v2.html… for variations), NOTES.md
  redesign-output/2-reader/  ... 3-library/ ... 4-visualizer/ ... 5-toolbox/ ...
  6-settings/ ... 7-home-notes-profile/
NOTES.md per folder = which D#, what changed, elements touched, recommended
default, and any choice left for me. Optionally open each saved .html in the
browser to sanity-check it renders.
Maintain redesign-output/REDESIGN-INDEX.md as a running checklist: screens done,
defaults chosen, choices awaiting me, blockers.

GUARDRAILS
- I'm away: never block waiting for me. Decide, note the decision, continue.
- Do not modify app source, do not push git, do not share/publish anything.
- Save incrementally. If the session must end, leave everything saved and
  REDESIGN-INDEX.md current.
- If blocked (login, upload fails, tool error): save progress, write exactly what
  blocked in redesign-output/BLOCKERS.md, and stop. Never fabricate designs,
  never attempt credentials.
- Time-box each screen to a few iterations; if not converging, save the best +
  variations, note it, move on.

DEFINITION OF DONE
redesign-output/ contains a saved mockup + NOTES.md for all 7 queue items, plus
REDESIGN-INDEX.md summarizing chosen defaults, open choices, and any blockers —
ready for my developer to build. Write the final summary in REDESIGN-INDEX.md
when done or blocked.
```

---

## When Cowork finishes

Come back to the development session (me) and point me at
`design-handoff/redesign-output/`. I'll build the redesign into the React
Native app — new component kit, re-wire every element to its selectors/actions,
extend the theme palette, and implement the backend the new UI needs (equation
rendering D9, arXiv fetch D11, Manim-grade viz templates D12) — then rebuild the
APK + web and verify.
