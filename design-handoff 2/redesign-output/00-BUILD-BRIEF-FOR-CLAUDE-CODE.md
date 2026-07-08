# NeuroPal Redesign — Build Brief for Claude Code

> **Purpose.** This is the engineering handoff for implementing the approved
> NeuroPal UI redesign **and** the backend it depends on. Hand this whole
> `redesign-output/` folder (plus the sibling docs `01`–`03`) to Claude Code in
> the NeuroPal repo. It contains high-fidelity, self-contained mockups + a
> per-element wiring contract + this plan. Build the mockups faithfully; wire
> every element to its existing data; add the backend the new UI needs.

---

## 0. How to use this package (read order)

1. **`03-LOCKED-DESIGN-DIRECTIVES.md`** — the scope. Only D1–D12 change; everything else stays.
2. **`01-DESIGN-SYSTEM.md`** + **`redesign-output/_shared/tokens.css`** — semantic color tokens, fonts, the liquid-glass material.
3. **`02-SCREENS-AND-ELEMENTS.md`** — the wiring contract: every element, the selector/action/network call it's bound to. **Preserve these.**
4. **`redesign-output/<n>-*/mockup.html` + `NOTES.md`** — the target look per screen and a "what changed / D# / elements / recommended default / open choices" note. Open the HTML in a browser; the interactive ones (drawer, toast, Bloch sphere, sliders, player) actually respond.
5. **`redesign-output/REDESIGN-INDEX.md`** — chosen defaults + the handful of choices left to the owner. **`DECISIONS.md`** — why things were done this way.

**Golden rules (from `02`):** colors = semantic tokens (never raw hex); keep every element's job + its data binding; keep accessibility labels. Change look & layout, not behavior — unless a directive says so.

---

## 1. Confirmed stack (do not swap)

| Layer | Tech |
|---|---|
| Frontend | React Native 0.83 + Expo SDK 55 · React Navigation · Redux Toolkit · NativeWind 4 |
| Backend | Node 20 + Express 4 (`neuropal-backend`) |
| DB / Vector / Embeddings | MongoDB 8 (Mongoose) · Qdrant · Ollama `nomic-embed-text` (768-d) |
| AI | Claude API (`claude-sonnet-4-5`) |
| Auth | JWT (bcrypt) |

**Config, not code:** the frontend must read `EXPO_PUBLIC_API_BASE_URL` (the current gap — `network.js` falls back to mock). All backend secrets stay in the backend `.env`. **Never hardcode credentials, IPs, or keys in committed source.**

**Backend patterns to keep** (already in the codebase): barrel model imports; `asyncHandler` on every route; soft-delete via `deletedAt` (always filter `deletedAt:null`); auth middleware loads the full `User` doc per request; `Document.status` state machine (`pending→parsing→chunking→embedding→ready|failed`) with ingest timestamps; `DocumentChunk` ↔ Qdrant via `vectorId` (UUID) + `vectorCollection` (= model name); error handler mapping (validation→422, dup→409, cast→400, multer→413).

---

## 2. Design-system mapping (tokens → `usePalette()`)

Author in **Dark + Ruby**; the same token names produce all 4 themes × 4 accents.

| mockup CSS var | `palette.js` token | Dark+Ruby |
|---|---|---|
| `--surface` | `surface` | `#131313` |
| `--surface-lowest` | `surfaceLowest` | `#0E0E0E` |
| `--surface-container` | `surfaceContainer` (card) | `#1F2020` |
| `--surface-high` | `surfaceHigh` | `#2A2A2A` |
| `--on-surface` | `onSurface` | `#E4E2E1` |
| `--on-surface-variant` | `onSurfaceVariant` | `#D0C6C8` |
| `--accent` / `--primary` | `accent` / `primary` | `#FF7F8E` |
| `--primary-container` | `primaryContainer` | `#8E1030` |
| `--secondary` / `--tertiary` | `secondary` / `tertiary` | `#FFAFC1` / `#F3C77B` |
| `--error` / `--warn` | `error` / `warn` | `#FFB4AB` / `#FFD27A` |
| `--hairline` | `withAlpha(outlineVariant,.15)` | — |

Fonts (already loaded): **Space Grotesk** (display/titles/buttons), **Inter** (body/UI), **JetBrains Mono** (numbers/timers), reader faces **Atkinson Hyperlegible / Lora / Fraunces / OpenDyslexic**. **No new color roles introduced** — if you add `success`, add it to all 4 themes in `theme/palette.js` (see D5 note).

**Material (D3):** extend `GlassPanel` into the app-wide language — real `BlurView` + a stronger ruby tint + soft specular edge (mockups use `.glass`/`.glass--deep`; on-device use the experimental Android blur already in the primitive). Apply to drawer, reader player, sheets, toasts, floating buttons.

---

## 3. Frontend — build the shared component kit first

Today screens hand-roll cards/chips/rows. Define these once, then have every screen consume them:

`GlassPanel` (extend, D3) · `NavigationDrawer` (D1) · `Toast` (D5: ✕ + swipe + 5s) · `AppHeader` (hamburger→drawer) · `Card` · `ListRow` · `Chip`/`Pill` · `IconButton` · `Stat` · `Field` (keyboard-aware, D6) · `Sheet` · `SegmentedControl` · `ReaderTopBar` (D8) · `TableOfContents` (D8) · `EquationView` (D9, KaTeX-in-WebView) · `TidalPlayer` (D10, docked+expanded) · `AskButton` (D10) · `ArxivSearch` (D11, collapsible) · `DocCard` (restyle) · `VizTemplateHost` + `BlochSphere` (D12).

---

## 4. Per-directive implementation checklist (D1–D12)

Each references its mockup. **FE** = React Native; **BE** = backend; **AC** = acceptance criteria.

### D1 — Left navigation drawer  · `1-global-shell/mockup.html`
- **FE:** remove `AppTabBar`; add a left slide-in `NavigationDrawer` opened by the header hamburger **or** edge-swipe-right, closed by scrim/swipe-left/select. `TAB_CONFIG` → drawer items in order **Home · Library · Reader · Notes · Visualizer · Toolbox · Profile · Settings**; active = accent. Reader still hides chrome; drawer stays reachable.
- **BE:** none.
- **AC:** every destination reachable via `navigation.navigate(routeName)`; drawer is `.glass--deep`, inside safe area; no bottom bar remains.

### D2 — Settings drawer destination  · `6-settings/mockup.html`
- **FE:** move all `TweaksSheet` controls to a **Settings screen** reached from the drawer (full screen). Keep every dispatch: `setTheme/setAccent/setReaderFont/setReaderLayout/setDensity/setFontSize/setLineSpacing/setWpm/setVoice` from `selectUiState`. Header hamburger no longer opens it.
- **BE:** none (client `uiSlice`).
- **AC:** all 9 controls present & wired; reachable via Drawer → Settings only; font/size/theme also surfaced in Reader Display options (D8).

### D3 — Tinted liquid glass  · all mockups
- **FE:** extend `GlassPanel`; apply to drawer, player, sheets, toasts, FAB/Ask. Token-driven so all 4 themes tint.
- **AC:** real blur + visible ruby tint + edge highlight; content dimly visible; not flat/opaque.

### D4 — Safe area + tinted status bar  · all mockups
- **FE:** wrap every screen in safe-area insets; fill the status strip with a solid theme color (bar style follows theme, light-on-dark). Content never under status bar/drawer/player/home indicator.
- **AC:** no content clipped by insets on the S24 Ultra; status strip colored, not transparent.

### D5 — Dismissible + auto-hide toasts  · `1-global-shell/mockup.html`
- **FE:** every error `Toast.show(...)` gets **✕** + **swipe-to-dismiss** + **auto-hide 5s** (progress line). Success toasts may hide faster.
- **BE:** none. **AC:** all three dismissal paths work on connection/upload/rename/delete/crash toasts.
- *If you want a dedicated `success` color, add a `success` token to all 4 themes; default reuses `secondary`.*

### D6 — Keyboard-aware inputs  · Library/Toolbox/Settings NOTES
- **FE:** wrap every `TextInput` screen/sheet in `KeyboardAwareScrollView` (Library rename + arXiv, Reminders, Notes title, doc-actions, Settings).

### D7 — Rename Anchors → Toolbox  · `5-toolbox/mockup.html`
- **FE:** rename everywhere — drawer label (D1), screen title, route/`TAB_CONFIG`, file (`AnchorsScreen`→`ToolboxScreen`). **Contents unchanged** (Pomodoro + Reminders). Re-render on new material.
- **AC:** no "Anchors" string remains in nav/labels/routes; Pomodoro (`focus`) + Reminders (`reminders`) behavior identical.

### D8 — Play-Books reader  · `2-reader/mockup.html`
- **FE:** immersive surface, tap-center toggles chrome (auto-hide while reading). Top bar = back · title · **Contents/TOC** · **Display options (Aa)** · overflow (holds Study 🎓). Replace `‹ Part N/M ›` with a `TableOfContents` (from `reader` sections) + a position scrubber with chapter ticks. Keep **both** view modes (text karaoke ⇄ Original pages). **Cut** the citation graph + left `Minimap`.
- **Preserve:** word tap-to-seek + current-word highlight (per-word index), long-press → Explain (`/explain`), Q&A thread, reader font/size/spacing/theme.
- **BE:** none new (uses existing text/pages/chat).
- **AC:** karaoke intact; TOC jumps + seeks; Original pages still renders `documentPageUrl`.

### D9 — Equation rendering  · `2-reader/mockup.html` (before→after card)
- **FE:** render inline + block math with **KaTeX** in a lightweight WebView (`EquationView`) — the mockup shows the exact target. TTS **skips** equations (neutral placeholder / step-over in the karaoke index).
- **BE (later push, required for real data):** extraction pipeline — **EPUB MathML → LaTeX**; **PDF/scanned → crop equation region → image-to-LaTeX (math OCR) → LaTeX**. Store `latex` (+ `isEquation`, TTS-skip marker) on `DocumentChunk`/segment; extend `services/textExtractor.js` + `chunker.js`; add a `mathExtractor` service. Keep Original-pages as the fidelity fallback.
- **AC:** `Ψ R (P a −P b )/ √ 2`-style garbage replaced by typeset math; equations not read aloud; highlight steps over them.

### D10 — Tidal player (2 variations)  · `2-reader/mockup.html` (A, default) + `mockup-v2.html` (B)
- **FE:** rebuild `PlaybackBar` → **scrubber (chapter ticks) on top → ◀ ⏯ ▶ centered → tone (Soft/Natural/Deep) at bottom**; keep **WPM** as a compact control; move **Ask** to a translucent top-right glass button. Tinted glass; hides with chrome. Ship **Variation A (docked)** as default, **B (full now-playing)** as its expand state.
- **Preserve:** play/pause, jump/skip, WPM, voice, Ask entry (`requestReaderAnswer`).
- **BE:** none new (Ask uses existing `/documents/:id/query`; optional `/chat` thread persistence per `02`).

### D11 — arXiv search in Library  · `3-library/mockup.html`
- **FE:** header 🔍 → collapsible `ArxivSearch` box (title/author/id, keyboard-aware D6) → results (title · authors · abstract · id · year) → **Add to Library** → shows ingesting→ready on a `DocCard`. Restyle the shelf to the book-cover grid (keep ingest% ≠ reading%). Keep connection-error banner + Retry prominent.
- **BE (later push, required):** `GET /arxiv/search?q=&cat=` (proxy the arXiv API) and `POST /library/arxiv/add {arxivId}` → download the PDF into `storage/documents/<userId>/` → `Document.create(status:'pending')` → run the existing `ingestDocument()`. Reuse the current ingest pipeline verbatim.
- **AC:** full flow works end-to-end against the design; added paper appears with normal ingest progress.

### D12 — Manim/Qiskit-grade visualizer  · `4-visualizer/mockup.html`
- **FE (template HTML/CSS, not RN):** rework `data/vizTemplates.js` `BASE_CSS` + each template (pendulum, interference, standing waves, Lissajous, Bloch) → labeled axes, LaTeX labels (KaTeX), refined theme-tinted palette, smoother motion, readouts. Gallery gets preview thumbnails. **Bloch sphere:** dotted trajectory arcs + a live coordinate readout (θ, φ, ⟨σx,y,z⟩, |ψ⟩ amplitudes) as you scrub/drag — the mockup's math (Rodrigues precession; θ=arccos z, φ=atan2(y,x)) is a correct reference. Consider Three.js/`expo-three` for production motion.
- **BE:** none (offline). Optional: a Claude (Module 7) → viz-JSON-spec contract the renderer consumes.
- **AC:** Bloch readout updates live on scrub/drag; arcs render; all 5 templates upgraded.

### Re-render only (D1/D3/D4) — Home · Notes · Profile  · `7-home-notes-profile/mockup.html`
- **FE:** drop into the new shell; **keep content & bindings as-is** (Home mock data, Notes ink model, Profile stub buttons unchanged — out of scope).

---

## 5. Backend — to be "full-stack ready"

**5.0 Connect FE ↔ BE (do first):** set `EXPO_PUBLIC_API_BASE_URL`; make `network.js` use it (drop the mock fallback in real mode). Verify `/auth/me`, `/documents`, `/documents/:id/text`, `/documents/:id/query` against the live server. Build an APK via EAS for S24 Ultra testing.

**5.1 Directive-driven (above):** D9 math extraction · D11 arXiv search+add.

**5.2 Routes the UI now needs (schemas exist, routes don't — from the project's own "routes needed next"):** build CRUD/endpoints reusing the established patterns:
1. **Anchor** CRUD + **DailyLog** state check-in (Modules 1+2).
2. **FrameworkConfig** CRUD (Module 1).
3. **CompanionMessage** + Claude companion route (Module 7) — inject condition profile / framework state / study context.
4. **Resource** CRUD + search (Module 4) — `evidenceLevel` filter.
5. **Professional** CRUD + search/filter (Module 5) — location/condition/approach/cost/language.
6. **SpendingLog** CRUD + state-spending correlation endpoint (Module 6).
7. **AuditLog** writes on sensitive actions.

Each: `asyncHandler`, JWT-guarded, soft-delete where the schema has `deletedAt`, validation → 422.

---

## 6. Recommended build order

1. **Component kit + Global shell** (D1/D3/D4/D5) + **connect FE↔BE** (5.0). → APK smoke test.
2. **Reader** (D8, D10) FE; **D9** KaTeX FE, then the extraction BE.
3. **Library** (D11) FE + arXiv BE.
4. **Visualizer** (D12) templates.
5. **Toolbox** (D7) + **Settings** (D2).
6. **Home/Notes/Profile** re-render (7).
7. **Module routes** (5.2): Anchor/DailyLog → FrameworkConfig → Companion → Resource → Professional → SpendingLog.
8. **Ship:** rebuild APK (EAS) + web; verify.

---

## 7. Acceptance / QA checklist

- [ ] Every directive AC above passes; nothing outside D1–D12 changed visually.
- [ ] No raw themeable hex in screens — only `usePalette()` tokens; all 4 themes × 4 accents render.
- [ ] Accessibility: WCAG 2.1 AA; screen-reader labels on every control; dyslexia font, contrast theme, adjustable size/spacing/WPM, reduced motion all function.
- [ ] FE↔BE connected (no mock in real mode); ingest state machine + Qdrant retrieval verified.
- [ ] D9 equations not narrated by TTS; karaoke steps over them; Original-pages fallback intact.
- [ ] D11 add-from-arXiv ingests via the existing pipeline; D5 toasts dismiss 3 ways.
- [ ] No secrets committed; `.env`-driven config.

---

## 8. Guardrails

Change only what D1–D12 name; preserve every element's job + data binding (`02`); privacy-first (no data selling, no training on user data); free-core / premium boundaries unchanged; accessibility is architectural, not polish.
