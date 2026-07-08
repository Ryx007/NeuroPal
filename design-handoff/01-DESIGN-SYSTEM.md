# NeuroPal — Design System Reference

> This is the vocabulary the redesign MUST speak. Every color in the app is a
> **semantic token** resolved at runtime from `usePalette()` — nothing is a
> hardcoded hex in a screen (that's deliberate: it's how 4 themes × 4 accents
> work from one component tree). When you redesign, express colors as these
> token names, not literal hexes, or the dev pass has to reverse-engineer the
> mapping and theming breaks.

Platform: **React Native + Expo (SDK 55)**. Primary target: **Samsung Galaxy
S24 Ultra** (Android, ~412 dp wide). Also runs as a web app and on iPhone.
Design at **phone width first**.

---

## 1. Color tokens (semantic — theme-independent names)

Every screen reads these off `const palette = usePalette()`. There are 4
themes (`dark`, `sepia`, `light`, `contrast`) and 4 accents (`ruby` default,
`cyan`, `purple`, `green`). **You design once in the default (dark + ruby);
the same token names automatically produce every other theme.**

| Token | Role | Dark + Ruby value |
|---|---|---|
| `surface` | app background | `#131313` |
| `surfaceLowest` | deepest wells (reader page, inputs behind) | `#0E0E0E` |
| `surfaceLow` | subtle raised | `#1B1C1C` |
| `surfaceContainer` | **card background** (the workhorse) | `#1F2020` |
| `surfaceHigh` | raised control / chip background | `#2A2A2A` |
| `surfaceHighest` | highest raised (badges) | `#353535` |
| `onSurface` | primary text | `#E4E2E1` |
| `onSurfaceVariant` | secondary/muted text, icons | `#D0C6C8` |
| `outline` | strong dividers | `#9F8D91` |
| `outlineVariant` | hairlines, faint borders (usually via `withAlpha`) | `#534347` |
| `primary` | filled-button base | `#FF7F8E` |
| `primaryContainer` | filled-button gradient end / deep fill | `#8E1030` |
| `onPrimary` | text/icon on primary | `#4A0316` |
| `accent` | **the brand highlight** — active states, links, focus | `#FF7F8E` |
| `accentGlow` | shadow/glow rgba for accent | `rgba(255,127,142,0.25)` |
| `secondary` | secondary highlight (progress, alt accents) | `#FFAFC1` |
| `tertiary` | tertiary highlight (break-phase, gold notes ink) | `#F3C77B` |
| `error` | destructive / failure | `#FFB4AB` |
| `warn` | caution (overdue, "Again") | `#FFD27A` |

**Alpha helper:** `withAlpha(token, 0.14)` → rgba. Common recipe for a
"selected/active" pill: `background = withAlpha(accent, 0.12–0.16)`,
`border = withAlpha(accent, 0.4)`, `text/icon = accent`.

> ⚠️ If you introduce a genuinely new color role the tokens don't cover, name
> it (e.g. `success`, `info`) and flag it — the dev pass will add it to all 4
> themes in `theme/palette.js`. Don't smuggle raw hexes into screens.

---

## 2. Typography

Three families are loaded (plus reader-only fonts). Weights are baked into the
font name (RN doesn't do `fontWeight` reliably with custom fonts).

| Family | `fontFamily` values in use | Used for |
|---|---|---|
| **Space Grotesk** | `SpaceGrotesk_700Bold`, `_600SemiBold`, `_500Medium`, `_400Regular` | Screen titles, card titles, display, buttons |
| **Inter** | `Inter_700Bold`, `_600SemiBold`, `_500Medium`, `_400Regular` | Body text, labels, UI copy |
| **JetBrains Mono** | `JetBrainsMono_400Regular` | Numbers, timers, page counts, timestamps, citations |
| Reader body fonts | `AtkinsonHyperlegible_400Regular`, `Lora_400Regular`, `Fraunces_400Regular` | User-selectable reader typeface only |

Type scale currently in use (dp): screen title **34** (SpaceGrotesk_700, letter-spacing −0.8), card title **16–18**, body **13–16**, label/eyebrow **10–12** (often UPPERCASE, letter-spacing 1.2–2), timer display **64** (mono).

Keep these family names available (they're the only loaded fonts). You may
restyle sizes/weights freely.

---

## 3. Shape, spacing, elevation

- **Radii:** cards `18–24`, pills/chips `999` (full) or `12–14`, buttons `12–14`, FAB `18`, modals/sheets `20–28` (top corners for bottom sheets).
- **Spacing rhythm:** screen horizontal padding `20–24`, card padding `16–20`, gaps `8–16`. Bottom scroll padding is `160` everywhere to clear the floating tab bar.
- **Elevation** is done with `shadowColor: accent` + low opacity glow, not Material elevation. Cards are mostly flat (background contrast only).
- **No borders by default** — separation is by `surfaceContainer` vs `surface` contrast. Hairlines use `withAlpha(outlineVariant, 0.15)`.

---

## 4. Reusable primitives (`components/primitives.jsx`)

The redesign should route through these (or their successors) rather than
re-styling ad hoc — inconsistency today comes from screens NOT using shared
components. Current set:

| Primitive | What it is | Notes |
|---|---|---|
| `GlassPanel` | frosted translucent container (blur + tinted overlay) | **The seed of the "Liquid Glass — more tinted" material (D3).** Extend it to the **drawer**, **reader player**, sheets, toasts, floating buttons. Already at 0.82 tint. |
| `NpPrimaryButton` | gradient filled button (`primary → primaryContainer`) | Underused — most CTAs are hand-rolled. |
| `NpGhostButton` | outlined text button | Used in Tweaks/Profile. |
| `SectionHeader` | eyebrow row with optional live `DataPulse` + trailing label | |
| `DataPulse` | pulsing accent dot (the "live" indicator, also the wordmark dot) | |
| `withAlpha(color, a)` | hex/rgba → rgba with alpha | The theming glue. |

**Biggest system-level opportunity:** most screens hand-roll cards, chips,
list rows, and buttons inline. A redesign is the moment to define a real
component kit (Card, ListRow, Chip, Pill, IconButton, Stat, Field, Sheet) and
have every screen consume it. Call the components out in your redesign and the
dev pass will build them as shared primitives.

---

## 5. Global shell — **CHANGING per `03` directives**

- **Material (D3):** the app adopts an **Apple "Liquid Glass" — more tinted** language for all floating chrome (drawer, reader player, sheets, toasts, floating buttons): real blur + a **stronger theme tint** + soft edge highlight, content dimly visible through. `GlassPanel` is the seed of this (already at 0.82 tint) — extend it, keep it token-driven so every theme tints correctly.
- **Navigation (D1):** the floating bottom tab bar is **replaced by a left slide-in drawer**, opened by the top-left **hamburger** or **swipe-right from the edge**. Destinations: Home · Library · Reader · Notes · Visualizer · **Toolbox** (was Anchors, D7) · Profile · **Settings** (D2). Tinted liquid glass, safe-area respected.
- **`AppHeader`**: `● NeuroPal` wordmark (pulsing accent dot) + hamburger (now opens the **drawer**) + profile avatar. Frosted, full-bleed, inside the safe area.
- **Safe area + status bar (D4):** every screen's content sits **inside the safe area**; the status-bar strip is filled with a solid theme color (not transparent over content). Bar style follows theme.
- **Toasts (D5):** `react-native-toast-message`, top of screen. Errors must be **dismissible (✕ button + swipe)** and **auto-hide after 5 s**.
- **Keyboard (D6):** any screen/sheet with a `TextInput` wraps in `KeyboardAwareScrollView`.
- **Sheets:** Settings (was Tweaks) and Study are bottom sheets; document actions and card menus are centered modals. All tinted liquid glass.
