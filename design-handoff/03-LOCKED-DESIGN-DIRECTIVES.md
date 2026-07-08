# NeuroPal — Locked Design Directives (owner-specified)

> **Read this first. This document is the scope.** Everything here is
> **decided** — Claude Design should implement each directive as specified,
> and the owner iterates only on *visual variations within* each. Anything NOT
> listed here **stays as it is today** (the "redesign notes" in `02` are
> background/context, not a mandate — do not change screens or elements this
> document doesn't touch).
>
> Where this document conflicts with a note in `01` or `02`, **this document
> wins.** Each directive lists the elements it affects, the wiring/behavior to
> preserve, and any backend work it implies (some is deferred to a later push).

Reference UIs named below are concrete targets — pull them up alongside:
**Google Play Books** (reader), **Tidal** now-playing (audio player), **Apple
"Liquid Glass"** (material), **Manim** + **Qiskit docs** + applied-physics
textbooks (visualizer).

---

## A. GLOBAL (affects every screen)

### D1 — Bottom tab bar → LEFT NAVIGATION DRAWER
Replace the floating 7-item bottom tab bar entirely with a **left slide-in
navigation drawer**.
- **Open by:** tapping the **hamburger (top-left)**, OR **swiping right** from the left edge.
- **Close by:** tap-outside / swipe-left / selecting a destination.
- **Drawer contents (in order):** Home · Library · Reader · Notes · Visualizer · **Toolbox** (was Anchors) · Profile · **Settings** (see D2). Active destination highlighted with `accent`.
- Drawer panel is **tinted liquid glass** (D3), full app height, respecting safe area (D4).
- Affects: `02` → "Global shell / AppTabBar" (that bottom bar is removed) and `AppHeader` (hamburger now opens the drawer, not the Tweaks sheet).
- **Keep wired:** every destination stays reachable; the Reader still hides nav chrome while reading (drawer still available via edge-swipe/hamburger).

### D2 — Hamburger/Tweaks content → a "Settings" drawer destination
The content currently in the **Tweaks sheet** (Theme, Accent, Reader font,
Reader layout, Density, Font size, Line spacing, WPM, Voice) moves into a
**Settings** screen opened from the drawer (D1).
- It may present as a full screen or a sheet launched from the drawer item — your call — but it's reached via **Drawer → Settings**, not the header hamburger anymore.
- Affects: `02` → "Tweaks sheet". **Keep every control and its dispatch** (all the `setTheme/setAccent/…` actions) — these are accessibility-critical.

### D3 — Material: Apple "Liquid Glass", MORE TINTED
The whole app's floating chrome adopts an **Apple Liquid-Glass aesthetic —
but more tinted** than Apple's near-neutral glass.
- Applies to: the **drawer**, the **reader player**, **bottom sheets** (Settings, Study), **toasts**, **floating buttons** (FAB, Ask), **cards where appropriate**.
- Recipe: real background blur + a **stronger color tint** drawn from the theme (ruby-tinted in the default). Think frosted glass with a visible warm/accent tint and soft specular edge highlight, content dimly visible through it — not a flat opaque panel, not a barely-there clear glass.
- This extends the existing `GlassPanel` primitive (already at 0.82 tint) into the app-wide material language. Keep it token-driven so all 4 themes tint correctly.

### D4 — Safe-area everywhere; tinted (colored-out) status bar
All screen content lives inside the **safe area** (notch, status bar, home
indicator, Android nav bar) on every screen.
- The **status-bar strip is "colored out"** — filled with a solid theme color (e.g. `surface` or the tinted glass), not transparent/overlapping content.
- Main content never sits under the status bar, the drawer, the player, or the home indicator.
- Implementation intent for the dev push: `SafeAreaView` / safe-area insets wrapping every screen + a themed status-bar background; bar style follows theme (light icons on dark).

### D5 — Error pop-ups: dismissible + auto-hide 5s
Every error/toast pop-up must be **dismissible AND self-clearing**:
- a **✕ dismiss button** on the toast, **and**
- **swipe-to-dismiss** (swipe it away), **and**
- **auto-dismiss after 5 seconds** if untouched.
- Applies to all `Toast.show(...)` usages (connection errors, upload failures, rename/delete results, crash-report toast, etc.). Success toasts may auto-hide faster; errors get the full treatment.

### D6 — `KeyboardAwareScrollView` for all text-input screens
Every screen/sheet with a `TextInput` must scroll the focused field above the
keyboard (no keyboard covering the input).
- Wrap with `KeyboardAwareScrollView` (react-native-keyboard-aware-scroll-view or keyboard-controller equivalent).
- Affects: Library **rename** sheet, Library **arXiv search** (D11), **Reminders** input, **Notes** title, Doc-actions sheet, Settings — any field.

### D7 — Rename "Anchors" → "Toolbox"
The **Anchors** tab/screen (Pomodoro + Reminders) is renamed **"Toolbox"**
everywhere (drawer label, screen title, route). Same contents for now; the
name signals it's the home for study tools (timers, reminders, future tools).
- Affects: `02` → "Anchors" section, drawer label (D1), `TAB_CONFIG`/route name.

---

## B. READER (the flagship overhaul)

### D8 — Reader UI → Google Play Books
Overhaul the Reader into a clean, immersive, **Google Play Books–style**
reading experience. The current heavy chrome (busy header, `‹ Part 1/25 ›`
nav, left minimap, cramped bottom bar) is replaced.
- **Immersive reading:** content-first, generous margins, comfortable measure; **tap the center to toggle chrome** (top bar + player) on/off; chrome auto-hides while reading/playing.
- **Top bar (when shown):** back · document title · a small action set — **Contents/TOC**, **Display options** (font/size/theme — pulls the reader-relevant Settings), **overflow**. Style it Play-Books-clean, liquid glass (D3).
- **Chapters/TOC:** replace `‹ Part N/M ›` with a proper **Table of Contents drawer/list** (chapter titles, jump on tap). The section/chapter data already exists (`reader` sections). A bottom **position scrubber with chapter ticks** may accompany it (Play Books shows position + chapter).
- **Reading themes:** honor the existing themes (dark/sepia/light/contrast) and reader fonts/size/spacing as Play Books does with its display options.
- **Keep wired (contract):** the **word-level karaoke** (tap-a-word-to-seek + current-word highlight), the **two view modes** (text ⇄ **Original pages** — keep the original-pages PDF view, it's the equation-fidelity fallback), long-press/selection → **Explain**, and the Q&A thread.
- Cut the placeholder **citation graph** (it's dead).

### D9 — Proper equation rendering (like Claude / ChatGPT / Gemini)
In the text reading view, mathematics must render **properly and beautifully**,
the way equations render in the Claude / ChatGPT / Gemini chat UIs (i.e.
**KaTeX/MathJax-quality** typesetting), inline and as block equations.
- Today PDF-extracted text turns equations into garbage (`Ψ R (P a −P b )/ √ 2`). That must be replaced by real math typesetting.
- **Pipeline (design intent; backend work in a later push):** accept math as **MathML** (EPUBs often carry it) → convert to LaTeX → render with KaTeX; for **PDF/scanned** equations, crop the equation image region → **image-to-LaTeX** (math OCR) → render. The app should be able to **take MathML or an equation image, convert to LaTeX, and render** it.
- **Rendering:** KaTeX in a lightweight WebView (or an RN math renderer). Inline math flows with text; display math is centered on its own line.
- **Not read aloud:** TTS **skips** equations (or speaks a neutral placeholder like "equation"); the karaoke highlight steps over them. Rendering ≠ narration.
- Design deliverable now: show **how equations should look** in the reading flow (inline vs block, spacing, in each theme) so the dev push knows the target. Mark this as **backend-dependent** (extraction/conversion is a later implementation step).

### D10 — Reader audio player → Tidal now-playing layout
Rebuild the cramped playback bar into a **Tidal-style vertical player**. Exact
layout (top → bottom):
1. **Progress scrubber on top** — draggable position bar (reading position); include chapter/section ticks and/or a small position label. Dragging seeks.
2. **Transport row in the center** — **◀ (jump back)** · **⏯ Play/Pause (large, center)** · **▶ (skip ahead)**. Prev/next = jump back / skip ahead (by paragraph, or a set increment).
3. **Tone selector at the bottom** — the voice profile (**Soft / Natural / Deep**).
4. **"Ask" button** — moved OUT of the bar to the **top-right corner of the screen** as a **translucent (liquid-glass) floating button** (D3). Tapping it opens the doc Q&A / Ask flow.
- **Reading speed (WPM)** must stay accessible — place it as a **compact speed control** (e.g. a small "1.0×"/wpm pill near the transport or beside the tone selector). Don't drop it; it's a reading-speed/accessibility control. (Owner: pick where it reads best.)
- The player is **tinted liquid glass** (D3), presented Play-Books/Tidal-style (a bottom "now-playing" panel, optionally expandable to full-screen now-playing). It hides with the reader chrome on center-tap (D8).
- **Keep wired:** play/pause, jump/skip, voice select, WPM, and the Ask entry — all currently exist; only their **placement/'look** changes.

---

## C. LIBRARY

### D11 — arXiv search (collapsible) in the Library
Add a **search affordance** to the Library that finds and pulls papers from
**arXiv** directly into the app.
- **Entry:** a **search icon/button** in the Library header. Tapping it **expands a collapsible search box** (slides/animates open); tapping again or clearing collapses it.
- **Search box:** query field (title / author / arXiv id) with `KeyboardAwareScrollView` (D6); optional simple filters.
- **Results list:** each result shows **title, authors, abstract snippet, arXiv id, year**; a per-result **"Add to Library"** action.
- **On add:** the paper downloads + ingests into the library (shows the normal ingesting → ready progress on its card).
- Design the full flow now (button → expanded search → results → add → appears in library). **Backend later:** the arXiv query + fetch + ingest endpoint is a follow-up implementation once the design is set — design it as if it works.

---

## D. VISUALIZER

### D12 — Visualizer quality → Manim / Qiskit / textbook grade
Elevate the visualizations from the current simple canvases to
**Manim-animation / Qiskit-documentation / applied-physics-textbook** visual
quality.
- **Aesthetic targets:** Manim's crisp vector geometry, LaTeX-typeset labels, elegant smooth motion, coordinate axes, tasteful color-coding; Qiskit docs' clean technical Bloch spheres with labeled axes and state annotations; textbook-diagram clarity (labeled axes, legends, annotations).
- Apply across all templates (pendulum, interference, standing waves, Lissajous, **Bloch sphere**): proper labeled axes, LaTeX labels, refined palette (theme-tinted), smoother animation, legends/readouts.
- **Bloch sphere specifically (called out):**
  - Track the qubit's motion as **dotted trajectory arcs** on the sphere (the path the state traces, drawn as dotted arcs).
  - Make the state **interactive at any point in time**: scrub/hover/tap to read the **exact coordinates live** — θ, φ and ⟨σx⟩,⟨σy⟩,⟨σz⟩ (and the |ψ⟩ amplitudes), updating as you move through time or drag the state.
- **Note for the dev push:** the sim controls (sliders) currently live **inside each template's HTML/CSS** (`data/vizTemplates.js` `BASE_CSS`), rendered in a WebView/iframe — so this redesign's styling of sim UI is applied in that template CSS, not RN. Design the target look; the dev pass reworks the templates (and can bring in a math/animation lib for Manim-grade output).

---

## Scope reminder
Implement **A–D above** and leave everything else visually as-is. The other
"redesign notes" scattered in `02` (mock Home data, dead Profile buttons, etc.)
are **not in scope** for this pass unless the owner explicitly adds them.
