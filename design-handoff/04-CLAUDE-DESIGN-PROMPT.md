# NeuroPal — Claude Design kickoff prompt + steps

## Quick steps (rush mode)

1. Drop your app screenshots into `design-handoff/screenshots/`.
2. Open **Claude Design** (claude.ai) → new chat/project.
3. **Upload:** `03-LOCKED-DESIGN-DIRECTIVES.md`, `01-DESIGN-SYSTEM.md`, `02-SCREENS-AND-ELEMENTS.md`, and your screenshots.
4. **Paste the MASTER PROMPT below.** It starts you on the global shell.
5. Iterate screen-by-screen in the given order (shell → Reader → Library → Visualizer → rest). Use the FOLLOW-UP TEMPLATE for each next screen. Ask for 2–3 variations of key elements.
6. Export each screen's mockup (HTML/code or images) + the "what changed" notes.
7. Send it all back to me (this dev session) with screen names matching `02`/`03`. I do the build + backend + APK/web redeploy.

---

## MASTER PROMPT (paste into Claude Design with the files attached)

```
You are my product designer. Help me redesign the UI of NeuroPal, a WORKING
React Native (Expo) study app for a physics PhD student. Primary device:
Samsung Galaxy S24 Ultra (Android, ~412 dp wide); it also runs on web and
iPhone. Design PHONE-FIRST.

I've uploaded 4 documents + screenshots of the current app:
- 03-LOCKED-DESIGN-DIRECTIVES.md — the EXACT changes to make (D1–D12). THIS IS
  THE SCOPE. Nothing outside these directives changes.
- 01-DESIGN-SYSTEM.md — the color tokens, fonts, and material to use.
- 02-SCREENS-AND-ELEMENTS.md — every screen/element and the data each is wired
  to (must be preserved). Rows touched by a directive are tagged → D#.
- Screenshots — the current "before".

TASK: redesign the app per directives D1–D12. For any screen/element NOT named
by a directive, keep the current design. I'll iterate with you on visual
variations WITHIN each directive.

HARD RULES:
1) Colors = the semantic tokens in 01. Design in the default DARK + RUBY theme:
   background #131313, card #1F2020, raised #2A2A2A, text #E4E2E1, muted
   #D0C6C8, ACCENT/primary #FF7F8E, deep #8E1030, secondary #FFAFC1, gold
   #F3C77B, error #FFB4AB, warn #FFD27A, hairline rgba(83,67,71,.5). Never
   invent raw hexes for themeable UI; if you need a new color role, name it and
   flag it (the app has 4 themes × 4 accents from these token names).
2) Fonts: Space Grotesk (titles/display/buttons), Inter (body/UI), JetBrains
   Mono (numbers/timers). Reader body may also offer Atkinson Hyperlegible,
   Lora, Fraunces.
3) Material = Apple "Liquid Glass" but MORE TINTED (D3): real blur + a stronger
   ruby-tinted overlay + soft edge highlight, content dimly visible through —
   for the drawer, reader player, sheets, toasts, and floating buttons.
4) Keep every element's JOB and the DATA it's bound to (right-hand columns in
   02) and keep ACCESSIBILITY (screen-reader labels, dyslexia font, contrast
   theme, adjustable size/spacing). You change look & layout, not behavior —
   unless a directive explicitly says so.
5) Safe area on every screen; status-bar strip filled with a theme color, never
   under content (D4).

HOW TO WORK:
- One screen/directive at a time, in THIS ORDER:
  (1) GLOBAL SHELL — left slide-in drawer replacing the bottom tab bar (D1),
      liquid-glass material (D3), safe area + tinted status bar (D4),
      dismissible + auto-hide-5s toasts (D5).
  (2) READER (the flagship) — Google Play Books immersive layout with
      tap-to-toggle chrome + Table-of-Contents (D8); equations rendered PROPERLY
      like the Claude/ChatGPT/Gemini chat UI, inline + block (D9); Tidal-style
      player = progress scrubber on top, ◀ ⏯ ▶ centered (jump-back / play /
      skip-ahead), voice/tone selector at the bottom, and "Ask" as a
      translucent glass button in the top-right corner (D10). Keep the
      "Original pages" PDF view too.
  (3) LIBRARY — add a search icon that expands a collapsible arXiv search box →
      results (title/authors/abstract/id/year) → "Add to Library" (D11).
  (4) VISUALIZER — Manim-animation / Qiskit-docs / physics-textbook quality:
      labeled axes, LaTeX labels, refined motion. Bloch sphere: dotted
      trajectory arcs + a LIVE interactive coordinate readout (θ, φ, ⟨σx,y,z⟩)
      as you scrub/drag (D12).
  (5) THE REST — Toolbox (renamed from Anchors, D7), Settings screen (the old
      Tweaks content, reached from the drawer, D2), Notes, Home, Profile.
- For each screen, produce a HIGH-FIDELITY, self-contained HTML/CSS mockup in a
  412 × 915 phone frame that I can preview and click, using the tokens/fonts
  above. Make it look real, not a wireframe.
- Under each mockup, add a short note: "what changed / which D# / which
  elements" so my developer can map it back to the code.
- Offer 2–3 VARIATIONS of the key element on each screen so I can choose.

START NOW with the GLOBAL SHELL (D1, D3, D4, D5): show the drawer (open and
closed states over the Home screen), the liquid-glass material, the safe-area
framing with the tinted status bar, and a sample dismissible toast. Ask me
anything you need first.
```

---

## FOLLOW-UP TEMPLATE (reuse for each next screen)

```
Now design [SCREEN / DIRECTIVE, e.g. "the Reader — D8, D9, D10"]. Same rules,
tokens, fonts, and phone frame. Show: [the specific views, e.g. "the immersive
reading view with a rendered block equation, the Table-of-Contents, and the
Tidal-style player"]. Give me 2 variations of [the key element, e.g. "the
player"]. Keep every control's job + data per 02, and keep accessibility.
```

---

## When you're done → hand back to development

Send me (in the dev session): each screen's mockup (HTML/code preferred, or
images) + the "what changed" notes, with screen names matching `02`/`03`. I'll
build the new component kit, re-wire every element to its exact
selectors/actions/network calls, extend the theme palette for any new roles,
implement the backend the new UI needs (equation extraction D9, arXiv fetch
D11, Manim-grade viz templates D12), then rebuild the APK + web and verify.
```
