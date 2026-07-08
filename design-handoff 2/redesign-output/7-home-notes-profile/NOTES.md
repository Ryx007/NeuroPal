# 7 — Home / Notes / Profile — NOTES

**Directives:** D1 / D3 / D4 re-render only (NOT redesigns)
**File:** `mockup.html` (3 frames: Home · Notes · Profile)

## What changed
- **Nothing content-wise.** Each screen is re-rendered inside the new shell: drawer
  header (D1), tinted liquid-glass chrome (D3), safe area + colored-out status bar
  (D4). The floating bottom tab bar is removed. **Current content and layout are
  kept as-is**, per the brief (“these are NOT redesigns”).

## Elements preserved (→ `02`)
- **Home** (`HomeScreen`): greeting bound to `auth.userName`; mood check
  (`setNervousState` green/yellow/red); minimum-viable-day tasks (`selectTasks` +
  `toggleTask`, `selectRemainingTasks`); Next Anchor (`selectNextAnchor`); Resume
  reading (`selectResumeDocument` → Reader). Still mock data by design — not rewired.
- **Notes** (`NotesScreen`): ink-note list (title, stroke count, updated time),
  delete, FAB → editor. `createNote`/`saveNote`/`deleteNote` + SVG stroke model
  unchanged; editor untouched.
- **Profile** (`ProfileScreen`): Conditions / Energy pattern / Primary use from
  `selectOnboardingState`; Privacy card + Export/Delete. Edit pencils and
  Export/Delete are **still stubs** (as in `02`) — wiring them is out of this pass.

## Recommended default
- Straight re-render, no layout change. This is the default and the whole point of
  the queue item.

## Choices left for owner
- Whether to later rewire Home’s mock data (real tasks/anchors), the Notes editor
  wishlist (pressure/tilt, lasso, PDF background), and Profile’s stub buttons — all
  **out of scope** for this design pass; flagged for a future push.

## Backend / behavioral notes
- No new behavior. These screens inherit D5 toasts / D6 keyboard-aware from the shell
  where relevant (e.g., Notes title field is keyboard-aware).
