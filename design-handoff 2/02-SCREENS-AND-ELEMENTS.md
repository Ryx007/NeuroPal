# NeuroPal — Screens & Elements (redesign brief + wiring contract)

> **⚠️ Read `03-LOCKED-DESIGN-DIRECTIVES.md` first.** The owner has locked
> specific changes (drawer nav, Play-Books reader, Tidal player, liquid-glass
> material, safe area, dismissible toasts, arXiv search, Toolbox rename,
> equation rendering, Manim-grade visualizer). Where a directive (`D#`) covers
> an element, **`03` governs** and the notes below are just wiring context.
> Rows touched by a directive are tagged **→ D#**.

> **How to use this document.** For every screen and every element it lists:
> what the element does, the data/logic it's wired to, what MUST survive a
> redesign (the "contract" — break these and the dev pass has to rewire), and
> redesign notes / known problems. Redesign visuals freely; keep the contract.
>
> **Three golden rules for the redesign (so the dev push is fast, not a rewrite):**
> 1. **Colors = semantic tokens**, never raw hex. Use the names in `01-DESIGN-SYSTEM.md` (`accent`, `surfaceContainer`, `onSurfaceVariant`, …).
> 2. **Keep every element's job and its data.** You can move/restyle/merge a checkbox, but the "toggle task done" action still needs a control. The right column tells you what data each element is bound to.
> 3. **Keep accessibility labels** (every interactive element has `accessibilityLabel`) — screen-reader support is a hard product requirement, not polish.
>
> Files referenced are in `source/`. Screenshots are in `screenshots/` (or
> grab live ones per `00-README.md`).

---

## ★ Top redesign priorities (the real problems)

The owner has **decided** the big moves — they're specified in
`03-LOCKED-DESIGN-DIRECTIVES.md`. Mapped to the problems below:

1. **7-tab bottom bar overcrowded** → **DECIDED: left navigation drawer** (hamburger + swipe-right). See **D1**.
2. **No shared component kit** — cards/chips/rows/buttons are hand-rolled inline, so nothing's quite consistent. Not a standalone directive, but the redesign will naturally produce a reusable kit (Card, ListRow, Chip, IconButton, Stat, Field, Sheet, SegmentedControl); the dev push builds it.
3. **Reader chrome heavy + player cramped** → **DECIDED: Google Play Books reader (D8) + Tidal player (D10) + equation rendering (D9).** The flagship of this pass.
4. **Material language** → **DECIDED: Apple Liquid Glass, more tinted (D3)**, applied to drawer, player, sheets, toasts, floating buttons.
5. **Structure & correctness** → **DECIDED: safe-area everywhere + tinted status bar (D4), dismissible/auto-hide toasts (D5), keyboard-aware inputs (D6).**
6. **New capabilities** → **DECIDED: arXiv search in Library (D11), Manim/Qiskit-grade Visualizer incl. interactive Bloch sphere (D12), "Anchors" → "Toolbox" (D7), Tweaks → Settings drawer item (D2).**

Everything else below (mock Home data, dead Profile buttons, Library filter
chips, etc.) is **context, not in scope** for this pass unless the owner adds it.

---

## Global shell — `navigation/AppNavigator.jsx`

**`AppHeader`** (top, every tab)

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Hamburger icon **→ D1, D2** | **CHANGED:** now **opens the left navigation drawer** (was: opened the Tweaks sheet). Tweaks content moves to a **Settings** drawer item. | An entry point to the drawer | The drawer also opens by **swipe-right from the left edge**. |
| `● NeuroPal` wordmark | Brand; the `●` is a live `DataPulse` accent dot | — | Free to restyle; keep it lightweight. |
| Profile avatar | `navigation.navigate("Profile")` | Profile also reachable from the drawer (D1) | Keep or fold into the drawer. |

**Navigation drawer** (replaces the bottom tab bar) **→ D1**

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Drawer destinations | Home · Library · Reader · Notes · Visualizer · **Toolbox** (D7) · Profile · **Settings** (D2); each `navigation.navigate(routeName)`; active = accent | All destinations reachable; active-state highlight | **DECIDED (D1):** left slide-in drawer, opened by hamburger or edge-swipe-right, tinted liquid glass (D3), safe-area respected (D4). `TAB_CONFIG` (name→`{label,icon}`) becomes the drawer item list. The old floating bottom bar is **removed**. Reader still hides chrome while reading; drawer stays available via edge-swipe. |

**Global interaction patterns (apply on every screen):**
- **Safe area + tinted status bar (D4):** all content inside the safe area; status-bar strip filled with a theme color, never under content.
- **Toasts (D5):** every error pop-up has a **✕**, is **swipe-to-dismiss**, and **auto-hides after 5s**.
- **Keyboard (D6):** every screen/sheet with a `TextInput` uses `KeyboardAwareScrollView` so the field floats above the keyboard.
- **Material (D3):** floating chrome (drawer, player, sheets, toasts, FAB/Ask) is **tinted liquid glass**.

---

## Home — `screens/HomeScreen.jsx`

Purpose: daily landing / check-in. **Currently mostly mock data.**
Data in: `selectTasks`, `selectRemainingTasks`, `selectNervousState`,
`selectNextAnchor`, `selectResumeDocument`, `auth.userName`.
Data out: `dispatch(setNervousState(...))`, `dispatch(toggleTask(id))`.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| "Hello, {name}" | `useSelector(s => s.auth.userName)` (from `/auth/me`), fallback "Ryx" | The real-name binding (don't hardcode) | Greeting/subtitle free to restyle. |
| Mood check (3 cards: okay / a bit off / overwhelmed) | `dispatch(setNervousState('green'|'yellow'|'red'))`; changes some conditional UI | If kept, keep the 3-state set + dispatch | **Half-wired / placeholder.** Decide: real regulation check-in, or cut. |
| "Minimum viable day" tasks (checkbox rows) | `selectTasks` + `dispatch(toggleTask(id))`; `selectRemainingTasks` count | If kept, keep toggle + count | **Mock data** (`homeSlice` seed). Could become real study tasks or be replaced by "today's pomodoro + reminders". |
| "Next Anchor" card | `selectNextAnchor` (mock anchors) | — | Mock. Could show the next reminder from `remindersSlice` instead (real data). |
| "Resume reading" (peeking) | `selectResumeDocument` → tap navigates to Reader | The resume-doc → Reader jump (genuinely useful) | Promote this; it's the one real, high-value element here. |

---

## Library — `screens/LibraryScreen.jsx`

Purpose: the document/book shelf. **Fully wired to the backend.**
Data in: `selectDocuments`; live poll while any doc is ingesting.
Data out: `fetchData("documents")`, `uploadDocument(asset)`,
`renameDocument(id,title)`, `deleteDocument(id)` (all in `store/network.js`);
`dispatch(addDocument/hydrateLibrary)`.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Title + subtitle | static | — | Free. |
| **arXiv search (NEW) → D11** | **NEW:** search icon in the header → **collapsible search box** → searches **arXiv** → results (title/authors/abstract/id/year) → **"Add to Library"** downloads + ingests. | — | **DECIDED (D11):** design the full flow now (icon → expand → query → results → add → appears ingesting). Field uses keyboard-aware scroll (D6). **Backend endpoint is a later push** — design as if it works. |
| Filter chips (All / In progress / Unread / PDF / EPUB / arXiv) | `setActiveFilter(index)` — **currently visual only, no filtering** | — | Context only (not in this scope). Dead control today; wire real filtering or cut, owner's call later. |
| Connection error banner + Retry | Shows when backend unreachable; `refresh()`; also "no backend configured" state | This visible-error surface (product principle: never fail silently) | Restyle freely; must stay prominent. |
| Doc card (`DocCard`) | Tap → `navigate("Reader",{id})`; long-press → opens `DocActionsSheet` | Both the open action AND the long-press→manage affordance | Redesign the card. Shows: type badge, title, status/subtitle, page count, **ingest progress bar** (while processing), "Ready", "Continue Reading". |
| — type badge / icon | `document.type` (pdf/epub/docx/txt) | type is meaningful | |
| — progress bar + label | `document.progress` (INGEST %, only while processing) + `progressLabel` ("Ingesting 43%" / "Ready" / "Ingest failed") | Don't render ingest % as *reading* %; keep the distinction | Reading progress isn't wired to UI yet — opportunity to add a real reading-progress ring. |
| — "Continue Reading" button | `navigate("Reader",{id})` | — | Could merge into the whole-card tap. |
| Upload card + FAB (`+`) | `pickDocument()` → `DocumentPicker` → `uploadDocument()` | The upload entry point (picker crash is already guarded) | Two upload affordances today (dashed card + FAB); consolidate if you like. |
| `DocActionsSheet` (long-press) | Rename (`TextInput` → `renameDocument`) + Delete (two-tap confirm → `deleteDocument`) | Rename + delete-with-confirm | Centered modal today; could be a bottom sheet or swipe actions. |

---

## Reader — `screens/ReaderScreen.jsx` (the flagship — most work here)

Purpose: read a document with synchronized TTS "karaoke" + Q&A + study tools.
Two view modes: **text** (karaoke) and **pages** (rendered original PDF).
Data in: `selectDocumentById`, `selectReaderDoc` (fetched text→sections),
`selectReaderPlayback`, `selectReaderMessages`, `selectUiState` (wpm/voice/layout),
`useTheme()` (reader font/size/spacing). Text via `fetchDocumentText(id)`;
pages via `documentPageUrl(id, n)`.
Data out: TTS engine (`services/tts.js`), `dispatch(setReaderWord/play/pause/…)`,
`requestReaderAnswer(...)` (Q&A / explain), study endpoints via `StudySheet`.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Top progress hairline | reading position `wordIndex / totalWords` | a progress indicator | Folds into the player scrubber (D10) / Play-Books position bar (D8). |
| `ReaderHeader` **→ D8** | back (→ Library) · title · view toggle (text ⇄ original pages) · **Study** (🎓) · citation graph (hub) | back, **view-toggle (keep both modes)**, study entry, title | **DECIDED (D8): Play-Books top bar** — clean, tap-center to toggle chrome; actions become Contents/TOC · Display options · overflow. **Cut the citation graph** (dead). |
| `PartNav` (‹ Part 1/25 ›) **→ D8** | Big docs split into sections/chapters; prev/next moves section AND seeks cursor | jumping to a chapter/section | **DECIDED (D8): replace ‹ › with a Table-of-Contents drawer/list** + a bottom position scrubber with chapter ticks. |
| Reader body — paragraphs | Rendered from fetched text → `sections`; each word is tappable | tap-a-word-to-seek, and the karaoke highlight | Play-Books reading surface (D8): generous margins, comfortable measure. Respects Settings font/size/spacing/family. |
| **Equations (in-body) → D9** | Currently PDF-extracted math renders as garbage text | — | **DECIDED (D9): render math properly (KaTeX/MathJax quality)** like Claude/ChatGPT/Gemini — inline + block; MathML/image → LaTeX → render; **not read aloud** (TTS skips). Backend extraction is a later push; **design the target look now**. |
| `ParagraphText` (per-word) | `onWordPress(globalIndex)` → `seekTo` (moves TTS cursor); current word = accent underline+bg; read words dimmed | **word tap-to-seek** + current-word highlight + read/unread styling | Karaoke core — mechanism (per-word index) must stay; highlight style free to restyle to a Play-Books-clean look. Equations are skipped by the highlight (D9). |
| Long-press paragraph | → `onAsk(pid, "Explain…", text, "explain")` → `/explain` grounded answer | a way to ask about a passage | Keep; make the "explain on selection" affordance more visible (Play-Books selects text → actions). |
| `PlaybackBar` **→ D10** | prev · play/pause · next · WPM · voice (Soft/Natural/Deep) · Ask | play/pause, jump/skip, WPM, voice, Ask entry | **DECIDED (D10): Tidal now-playing layout** — **scrubber on top → ◀ ⏯ ▶ centered → tone/voice at bottom**; **Ask moves to a translucent top-right floating button**; keep WPM as a compact speed control; whole player is tinted liquid glass (D3), hides with chrome. |
| — Ask button **→ D10** | seeds a Q&A about the current paragraph → `requestReaderAnswer` | the Q&A entry | **Moves to top-right translucent floating button** (D10). Answers render as margin notes today — a proper doc-chat thread is the better target (data: `reader.messages`; persists via `/documents/:id/chat`). |
| `MarginNote` (Q&A answers) | `chat` messages filtered by paragraph; shows answer + citation chips (`p. N`) | display of answers + citations | Only shown in "split" layout. Q&A UX is weak — redesign as a proper doc-chat thread (data: `reader.messages`, thread persists server-side via `/documents/:id/chat`). |
| `Minimap` (left rail) **→ D8** | thin progress rail | — | **Cut** — replaced by the Play-Books position scrubber / TOC (D8). |
| **Original pages view** (`PdfPagesView`) | `FlatList` of `documentPageUrl(id, n)` JPEGs — true PDF fidelity incl. equations | **KEEP this view mode** (it's the equation-fidelity fallback alongside D9) | Play-Books-style page view; could add pinch-zoom + page jump. |
| `CitationGraphDialog` (hub icon) **→ D8** | **Placeholder** — fake node graph, not wired | — | **Cut it** (dead), per D8. |

Also lives here (opened from the 🎓 header button):

**`StudySheet`** — `components/StudySheet.jsx` (bottom sheet)
Data: `requestStudyMaterial(id, kind, opts)` (summary/quiz/cheatsheet, Markdown)
+ `requestFlashcards(id, count)`; decks persist in `flashcardsSlice`.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Action tabs: Summary · Quiz · Cheatsheet · Cards | each generates via backend; cached per-kind; in-flight guarded | the 4 generators + per-doc caching | Restyle tabs; keep the 4 actions. |
| Summary/Quiz/Cheatsheet result | Markdown rendered as plain selectable text | selectable text output | **Markdown is shown raw** (no heading/bold rendering) — a real markdown renderer is a clear win. |
| Flashcards deck (`FlashcardsDeck`) | tap to flip; "Again" requeues, "Got it" retires; progress; shuffle-restart | flip + Again/Got-it + progress | Nice candidate for a proper card-stack/swipe UI (swipe left=again, right=got it). Deck persists per document. |
| Regenerate | force re-generate (re-bills) | — | |

---

## Notes — `screens/NotesScreen.jsx` (handwritten / S-Pen)

Purpose: freehand ink notes (S-Pen/stylus/finger). **Fully local.**
Data in: `s.notes.items`. Data out: `createNote`, `saveNote({id,strokes,title})`,
`deleteNote`. Ink is an SVG `<Path>` list; strokes are point arrays.

**List view**

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Note row | tap → open editor; shows title, stroke count, updated time | open + delete | Add thumbnails/previews of the ink (none today). |
| Delete icon | `deleteNote(id)` | delete | |
| FAB `+` | `createNote()` → opens editor | create | |

**Editor view (`NoteEditor`)**

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Title field | `saveNote({title})` | editable title | |
| Ink canvas | responder handlers capture strokes → SVG paths (midpoint-quadratic smoothing) | the drawing surface + stroke model | v1 ink. **Wishlist to design toward:** pressure/tilt width (S-Pen), palm rejection, lasso/select, pan/zoom, PDF/page background to annotate on. |
| Undo / Clear (header) | slice/replace strokes | undo + clear | |
| Toolbar: 3 colors × 3 widths + eraser | sets pen `color/width`/tool; eraser hit-tests strokes | pen color/width + eraser | Restyle the toolbar (floating palette? pen tray?). Colors come from tokens (`onSurface`, `accent`, `tertiary`). |

---

## Visualizer — `screens/VisualizerScreen.jsx`

Purpose: interactive offline physics simulations. Data: `data/vizTemplates.js`
(each template is self-contained HTML rendered in `VizView` — WebView native /
iframe web).

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Gallery rows (5) **→ D12** | tap → open template fullscreen; icon + title + blurb | open action + the 5 templates | **DECIDED (D12): Manim/Qiskit/textbook-grade visuals.** Richer gallery (per-sim preview thumbnails). Templates: pendulum, interference, standing waves, Lissajous, Bloch sphere. |
| Template view **→ D12** | back + `VizView` (canvas + its own sliders, inside the HTML) | back + the WebView/iframe host | **DECIDED (D12):** proper labeled axes, LaTeX labels, refined motion/palette. **Bloch sphere:** dotted trajectory arcs + **live interactive coordinate readout** (θ, φ, ⟨σx,y,z⟩, amplitudes) as you scrub/drag. Sim controls live in the template **HTML/CSS** (`BASE_CSS` in `vizTemplates.js`), not RN — dev pass reworks the templates (may add a math/animation lib). |

---

## Toolbox — `screens/AnchorsScreen.jsx` (Pomodoro + Reminders) **→ D7**

> **DECIDED (D7): renamed "Anchors" → "Toolbox"** (drawer label, screen title,
> route). Same contents for now.

Purpose: focus timer + reminders. Data: `s.focus`, `s.reminders.items`;
schedules OS notifications (`services/notify.js`).

**Pomodoro (`PomodoroCard`)**

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| MM:SS display | derived from `focus.endsAt` (timestamp-based; survives restart) | the countdown | Big mono number today; a ring/progress-circle is the obvious upgrade. |
| Play/Pause · Reset | `startPhase/pausePhase` (+ schedules/cancels notification); `resetFocus` | start/pause/reset + notification scheduling | |
| FOCUS/BREAK phase + "N done" | `focus.phase`, `focus.cyclesDone` | phase state + cycle count | |
| Focus/Break steppers (− min +) | `setDurations({workMin/breakMin})` | adjustable durations | |

**Reminders (`RemindersCard`)**

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| "Remind me to…" field | text input | the field | |
| Quick chips (15m/30m/1h/3h/Tmrw 9:00) + custom min | `add(minutes)` → `scheduleAt` → OS notification + `addReminder` | quick-add + custom time | No arbitrary date/time picker today — add one if you want scheduled-for-a-date reminders. |
| Reminder list rows | done toggle (`toggleReminderDone`), delete (`removeReminder`, cancels notification); overdue shown in `warn` | done + delete + overdue state | |

Reminders input + any field here uses keyboard-aware scrolling (D6).

---

## Profile — `screens/ProfileScreen.jsx`

Data: `selectOnboardingState` (conditions/energyPattern/primaryUse).

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Profile cards (Conditions / Energy / Primary use) | from onboarding answers; edit pencil is **non-functional** | the displayed values | **Edit pencils do nothing** — wire or cut. |
| Privacy card + "Export my data" / "Delete account" | **both are no-op stubs** (`onPress={() => {}}`) | — | Dead buttons — wire (export/delete via backend) or cut. |

---

## Onboarding — `screens/OnboardingScreen.jsx`

Purpose: first-run questionnaire (neurotype, energy pattern, primary use).
Data out: `onboardingSlice` (+ `completed`). Uses `PagerView` (platform-split).
Shown once (before `completed`); "Skip for now" bypasses.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Pager pages (conditions / energy / use / summary) | multi-select chips + continue; writes onboarding answers | the answers it collects (feed Profile + could tailor UX) | Free to fully reimagine the flow; keep it skippable and keep writing the same answer fields. |

---

## Settings (was "Tweaks") — `components/TweaksSheet.jsx` (+ `.web.jsx`) **→ D2**

> **DECIDED (D2): this becomes the "Settings" destination in the drawer** (D1),
> no longer opened by the header hamburger (which now opens the drawer). Full
> screen or drawer-launched sheet — your call. Keep every control + dispatch.

Purpose: appearance + reader settings (theme, accent, reader font/layout,
density, size, spacing, WPM, voice). Some of these (font size, theme, reader
font) may also be surfaced in the Reader's Play-Books "Display options" (D8).
Data: `selectUiState`; dispatches `setTheme/setAccent/setReaderFont/
setReaderLayout/setDensity/setFontSize/setLineSpacing/setWpm/setVoice`.

| Element | Function & binding | MUST preserve | Redesign notes |
|---|---|---|---|
| Theme (Dark/Sepia/Light/Contrast) | `setTheme` | the 4 themes | |
| Accent (Ruby/Cyan/Purple/Green) | `setAccent` | the 4 accents | |
| Reader font (Inter/Atkinson/Dyslexic/Lora/Fraunces) | `setReaderFont` | the 5 reader fonts (accessibility) | |
| Reader layout (Split/Focus/Paginated) | `setReaderLayout` | the layouts (or consciously drop "split" if you rework Q&A) | |
| Density (Calm/Dense) | `setDensity` | | Currently barely affects anything — wire or cut. |
| Font size / Line spacing / WPM sliders | `setFontSize/setLineSpacing/setWpm` | adjustable size/spacing/wpm (accessibility) | |
| Voice (Soft/Natural/Deep) | `setVoice` | voice profiles | |

> These settings are **accessibility-critical** (dyslexia font, contrast
> theme, size/spacing). The redesign should arguably surface some of them
> (font size, theme) more prominently than a buried sheet.

---

## Emergency / Login — deprioritize

- `EmergencyScreen.jsx` — a calm/grounding screen reachable outside tabs; low priority, restyle only if you touch regulation features.
- `LoginScreen.jsx` — **not routed anywhere** (single-user app has no login). Ignore unless multi-user is ever added.
