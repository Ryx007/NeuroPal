# NeuroPal — UI Redesign Handoff Package

This package is everything you need to redesign the NeuroPal front-end in
Claude Design (or any design tool) and hand the result back for a clean
development push — **without breaking any of the working backend wiring**.

NeuroPal is a **React Native + Expo** study app. Primary target: **Samsung
Galaxy S24 Ultra** (Android). It also runs as a web app and on iPhone. Design
**phone-first**.

---

## What's in here

| File / folder | What it is | Upload to Claude Design? |
|---|---|---|
| **`03-LOCKED-DESIGN-DIRECTIVES.md`** | **The owner's decided changes = the scope of this redesign.** Drawer nav, Play-Books reader, Tidal player, liquid-glass material, equation rendering, arXiv search, Manim/Qiskit visualizer, safe area, dismissible toasts, Toolbox rename, etc. | **Yes — read this FIRST; it defines what to change** |
| `01-DESIGN-SYSTEM.md` | Color tokens, typography, spacing, primitives, the global shell | **Yes** — the vocabulary the redesign must speak |
| `02-SCREENS-AND-ELEMENTS.md` | Every screen/element: what it does, what it's wired to, what to preserve. Rows touched by a directive are tagged **→ D#** | **Yes** — the per-element wiring contract |
| `screenshots/` | Current-state screenshots (see "Screenshots" below) | **Yes** — visual "before" |
| `source/` | The actual current front-end code (screens, components, theme, nav, store, API layer) | Optional — great for the designer to understand structure; **required for the dev push (me)** |

**Scope:** `03` is what changes. Everything `03` doesn't mention **stays as it
is** — iterate only on visual *variations within* each directive. Treat `02`'s
other "redesign notes" as background, not a to-do list.

`source/` mirrors the app layout: `screens/`, `components/`, `theme/`,
`navigation/`, `store/` (+ `slices/`), plus `app.json` / `package.json`.

---

## Screenshots — grab these (2 minutes)

I couldn't export device screenshots into files from here, so capture them
yourself — real screenshots are the best reference anyway. Two easy ways:

- **On your phone:** open the app, screenshot each screen.
- **In a browser (fastest):** open **`http://192.168.3.169:4000/`** on the Mac
  Mini, open DevTools (⌘⌥I) → device toolbar (⌘⇧M) → pick "Galaxy S24" or 412
  px wide → screenshot each screen.

Capture at least: **Home, Library, Reader (text view), Reader (Original pages
view), Reader → Study sheet (Cards), Notes (list + editor), Visualizer
(gallery + one sim), Anchors (Pomodoro+Reminders), Profile, Tweaks sheet.**
Drop them in `screenshots/`. (You've also already seen most of these rendered
in our chat — same views.)

---

## How to run the redesign

1. Start a Claude Design (or Claude.ai) conversation. Upload
   `03-LOCKED-DESIGN-DIRECTIVES.md`, `01-DESIGN-SYSTEM.md`,
   `02-SCREENS-AND-ELEMENTS.md`, and your screenshots.
2. Work directive by directive from `03` (D1–D12). Each names its reference UI
   (Google Play Books, Tidal, Apple Liquid Glass, Manim/Qiskit) and the
   elements it touches. You iterate on **visual variations within** each
   directive; the *what* is already decided.
3. Keep the **three golden rules** (top of `02`): semantic color tokens (not
   raw hex), keep each element's job + data (right-hand columns in `02`), keep
   accessibility labels. Leave anything `03` doesn't mention unchanged.

---

## How to hand it back to me (so the dev push is fast)

Send back **whatever Claude Design produces** — any of these works, best-first:

1. **New component code / artifacts** (React/RN or even HTML/React mockups) — I'll port to the RN screens.
2. **Annotated screens + a written spec** per screen (what changed, new layout, new component kit).
3. **Just the visuals + notes**, screen by screen.

Whatever the format, please keep **screen names matching `02`** (Home,
Library, Reader, Notes, Viz, Anchors, Profile, Tweaks, StudySheet) so I can map
each redesign to its current file and preserve the wiring.

**What I'll do on the dev push:**
- Build the new shared component kit (Card/Chip/Row/Button/etc.) if the redesign introduces one.
- Re-implement each screen's visuals in React Native, wiring every element back to the exact selectors / dispatch actions / network functions listed in `02`.
- Update `theme/palette.js` if you add color roles; keep all 4 themes × 4 accents working.
- Do any **backend changes** the new UI implies (you mentioned some will be needed) — e.g. new endpoints, new fields, reading-progress persistence.
- Rebuild the APK + redeploy the web app, and verify each screen.

**The invariant:** the redesign changes how it *looks* and is *laid out*; the
data each element is bound to (right-hand columns in `02`) is the contract I'll
keep intact. If you intend to change an element's *behavior or data* (not just
its look), call that out explicitly and I'll wire the new behavior + backend.

---

## Quick facts for the designer

- **Platform:** React Native (Expo SDK 55). Not web-first — components are RN primitives (`View`, `Text`, `Pressable`, `ScrollView`, `FlatList`), icons are `@expo/vector-icons` MaterialIcons.
- **Theming:** 4 themes (dark default, sepia, light, contrast) × 4 accents (ruby default, cyan, purple, green), all from semantic tokens. Design in **dark + ruby**; the rest follow.
- **Accessibility is a core requirement**, not polish: dyslexia-friendly font, high-contrast theme, adjustable font size / line spacing, screen-reader labels on every control. Don't design these away.
- **Fonts available:** Space Grotesk, Inter, JetBrains Mono (+ reader fonts Atkinson Hyperlegible, Lora, Fraunces). Only these are loaded.
- **The app is functional today** — this is a visual/UX overhaul of a working product, not a greenfield. Every "dead control" flagged in `02` is a chance to either wire it or cut it.
