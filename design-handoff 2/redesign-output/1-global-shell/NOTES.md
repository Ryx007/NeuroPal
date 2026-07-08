# 1 — Global Shell — NOTES

**Directives:** D1 (left drawer), D3 (tinted liquid glass), D4 (safe area + tinted status bar), D5 (dismissible/auto-hide toast)
**File:** `mockup.html` (two live 412×915 frames: Home w/ drawer **closed** + toast, and drawer **open**)

## What changed
- **D1 — Bottom tab bar → left navigation drawer.** The floating 7-item
  `AppTabBar` is removed entirely. A left slide-in drawer replaces it, opened by
  the top-left **hamburger** or a **swipe-right from the left edge** (edge
  affordance shown), closed by scrim tap / swipe-left / selecting a destination.
  Drawer order exactly per D1: **Home · Library · Reader · Notes · Visualizer ·
  Toolbox · Profile · Settings**. Active destination = accent tint + left accent
  bar. Interactive in the mockup (click hamburger / items).
- **D3 — Tinted liquid glass.** `.glass` / `.glass--deep` = real `backdrop-filter`
  blur + a ruby-tinted overlay + a soft specular top edge; content dimly visible
  through (scroll the Home content under the header to see it). This is the
  extended `GlassPanel` (was a flat 0.82 tint) applied to the header, drawer, and
  toast — and reused for the player/sheets on later screens.
- **D4 — Safe area + colored-out status bar.** Content lives inside safe insets;
  the status strip is filled with a solid theme tint (not transparent over
  content), light icons on dark. Header sits below it; body scroll padding clears
  both bars and the (now-absent) bottom bar.
- **D5 — Toast.** Error toast has a **✕ dismiss**, **swipe-to-dismiss**
  (drag it away — real pointer handling), and **auto-hide after 5s** (the shrinking
  progress line). "Replay toast" re-arms it. Success variant included (auto-hides
  faster in practice).

## Elements touched (→ `02-SCREENS-AND-ELEMENTS.md`)
- Global shell / `AppNavigator.jsx`: `AppTabBar` (removed), `AppHeader` (hamburger
  now opens drawer, not Tweaks), `TAB_CONFIG` → drawer list.
- Preserved: `● NeuroPal` wordmark w/ live `DataPulse` dot; profile avatar →
  Profile; all `accessibilityLabel`s (aria-labels on every control).
- Home content behind the shell is the **current** Home (unchanged; see queue 7) —
  shown only to frame the shell.

## Recommended default
- Single drawer style (no variations needed for the shell itself). Drawer width
  300px, `.glass--deep` tint. This is the default.

## Choices left for owner
- **Avatar placement:** kept in the header **and** reachable from the drawer
  (Profile). If you'd rather remove the header avatar and rely on the drawer only,
  that's a one-line change — flagged, default keeps both.
- **New `success` color role:** the success toast currently borrows `--secondary`.
  If you want a dedicated `success` token across all 4 themes, name it and the dev
  adds it to `palette.js`. Default: reuse `--secondary` (no new role).

## Backend / behavioral notes
- D6 (keyboard-aware inputs) is behavioral — no field on this shell; enforced on
  Library/Toolbox/Settings.
