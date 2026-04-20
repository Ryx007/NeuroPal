# NeuroPal — Expo app

React Native + Expo SDK 55 build of NeuroPal (web prototype lives at
`../index.html` and `../NeuroPal (standalone).html`). This is Branch A
from
[`📍 NeuroPal — App Development Plan`](../_unpacked/idea/idea_file_0__%20NeuroPal%20_%20App%20Development%20Plan%20(1)%2090f3f89fce56836a931f0119fc039697.md),
covering Phase 1 (NeuroReader MVP) + Phase 2 onboarding skeleton.

## Stack

- **Expo SDK 55** (`expo ~55.0.0`) · React 19 · React Native 0.81 · New
  Architecture on by default
- **Expo Router 6** with typed routes and a `(tabs)` group for the shell
- **TypeScript** — `strict` mode, `@/*` and `@app/*` path aliases
- **NativeWind 4** (Tailwind for RN) for quick styling, with a JS-side
  palette object for runtime theme + accent switching
- **Zustand 5** + `zustand/middleware/persist` over `AsyncStorage` for
  all app state — same philosophy as Riverpod: no HOC boilerplate,
  compile-time safety, pairs with async/server state the moment FastAPI
  comes online
- **expo-speech** for TTS with a simulated fallback timer calibrated to
  WPM, so karaoke highlighting works even when the OS engine doesn't
  emit progress events
- **expo-document-picker** for document ingestion — hooked straight into
  the `useDocuments` store
- **expo-blur** for glassmorphism (`GlassPanel`)
- **expo-linear-gradient** for the gradient primary CTA
- **react-native-reanimated 4** for the Data Pulse animation
- **react-native-svg** for the citation graph
- **react-native-pager-view** for the onboarding pager
- **@expo-google-fonts/\*** for Space Grotesk / Inter / Atkinson
  Hyperlegible / JetBrains Mono / Lora / Fraunces — all runtime-fetched
  via `useFonts`

## Directory layout

```
neuropal-app/
├── app/
│   ├── _layout.tsx              Root Stack, theme + gesture handler,
│   │                            onboarding-complete redirect gate
│   ├── onboarding.tsx           Full-bleed 4-step onboarding
│   ├── emergency.tsx            Full-bleed TIPP protocol card deck
│   └── (tabs)/
│       ├── _layout.tsx          Glass top bar + glass bottom nav + Tweaks sheet
│       ├── index.tsx            Home — greeting, check-in, MVD, anchor, resume
│       ├── library.tsx          Bento grid, upload card, FAB
│       ├── reader.tsx           Karaoke TTS, minimap, margin Q&A, 3 layouts
│       ├── anchors.tsx          Vertical timeline of the day's anchors
│       └── profile.tsx          Onboarding answers + privacy stub
├── src/
│   ├── components/
│   │   ├── primitives.tsx       GlassPanel, DataPulse, NpPrimaryButton,
│   │   │                        NpGhostButton, SectionHeader, PhImage
│   │   └── TweaksSheet.tsx      Modal sheet mirroring the web prototype
│   ├── data/mock.ts             Seed library + MVD + anchors + chat
│   ├── models/types.ts          Domain models — 1:1 with eventual Supabase schema
│   ├── state/
│   │   ├── tweaks.ts            Persisted theme/accent/font/layout/WPM store
│   │   └── app.ts               Onboarding + nervous state + MVD + documents
│   │                            + reader chat/playback
│   └── theme/
│       ├── palette.ts           Full Clinical Visionary palette — 4 themes, 4 accents
│       └── ThemeProvider.tsx    Context + `usePalette` / `useTheme` hooks
├── app.json                     Expo config (bundle IDs, permissions, plugins)
├── babel.config.js              expo + NativeWind + Reanimated presets
├── metro.config.js              `withNativeWind` transformer
├── tailwind.config.js           Full palette + font families + radii
├── global.css                   NativeWind base/components/utilities
├── nativewind-env.d.ts          NativeWind types
├── tsconfig.json                Strict TS + path aliases
└── package.json
```

## Getting it running

Node / pnpm / Xcode / Android Studio setup is the standard Expo flow
— detailed in the [Expo docs](https://docs.expo.dev/get-started/installation/).

```bash
cd neuropal-app
npm install

# Run with a dev build (recommended — gives you full native modules):
npx expo prebuild --platforms ios android     # once
npm run ios                                   # or
npm run android

# Or run in Expo Go — but expo-blur / expo-speech / pager-view
# need a dev build, so prebuild first.
```

Web parity (useful during the branch bake-off described in the plan doc):

```bash
npm run web
```

## What's wired, what's stubbed

**Wired (functionally complete for the MVP):**

- 4-step onboarding with answers persisted via AsyncStorage.
- Onboarding-complete gate in `app/_layout.tsx#Gate` — users skip the
  flow on subsequent launches.
- State check-in (3-tap), with Red routing straight to `/emergency`.
- Minimum Viable Day task list with checkbox toggles.
- Next anchor card + anchors timeline.
- Library bento grid with `expo-document-picker` uploads feeding
  straight into the Zustand documents store.
- Reader: karaoke highlight via `expo-speech` **and** a simulated
  fallback timer calibrated to WPM.
- Reader layouts (Split/Focus/Paginated) switched from Tweaks.
- Long-press any paragraph → Ask pipeline → a margin note is appended
  below that paragraph.
- Citation graph preview dialog with an SVG node-link layout.
- TIPP protocol full-bleed screen with 4-step paced navigation.
- All tweaks persist through `zustand/middleware/persist` + AsyncStorage.

**Stubbed (Phase >=1.3 backend work required):**

- `useReaderChat.ask` returns a placeholder answer. Replace the body
  with a POST to the FastAPI `/documents/{id}/query` endpoint once the
  LlamaIndex + pgvector pipeline is live (Plan §Sprint 1.3).
- Documents are an in-memory Zustand list. Swap `MockDocuments` for a
  Supabase `documents` select once §Sprint 1.1 lands.
- No auth yet (Plan §Sprint 2.1). The onboarding gate redirects on
  `completed`; add an auth-session redirect alongside it.
- Smartwatch (Phase 10) — out of scope here.

## Accessibility (WCAG 2.1 AA, non-negotiable per plan doc)

Built in from the start, not bolted on:

- `accessibilityRole` + `accessibilityLabel` on every primary CTA
  (`NpPrimaryButton`, `NpGhostButton`, `StateOption`, `MvdRow`, etc.).
- Tap targets are 44x44+ on every interactive element — measured in
  the reader playback bar, the state check-in, the onboarding option
  cards.
- Dyslexia-friendly reader font toggle uses Atkinson Hyperlegible with
  `letterSpacing: 0.6` (≈ the Stitch `.dyslexia-friendly` CSS rule).
- No 1px solid section borders anywhere — boundaries come from surface
  tier shifts (per DESIGN.md "No-Line Rule").
- `ThemeChoice.contrast` gives a WCAG-AAA contrast theme for low-vision
  users.
- `<Text selectable>` on every paragraph in the reader gives full
  VoiceOver / TalkBack selection for free.

## Where this plugs into the rest of the stack

- `POST /documents/upload` → called from `app/(tabs)/library.tsx#pickDoc`.
- `POST /documents/{id}/query` → called from `useReaderChat.ask` in
  `src/state/app.ts`.
- `POST /tts/generate` + streaming → replaces the `Speech.speak` call
  in `reader.tsx#togglePlay` once ElevenLabs is behind the backend.
- Supabase Auth session → onboarding gate in `app/_layout.tsx` becomes
  a combined auth-session + onboarding-complete guard.

## Running the web prototype alongside

The original web prototype lives one directory up:

- `../index.html` — editable React 18 UMD + Babel prototype
- `../NeuroPal (standalone).html` — same prototype, bundled offline
- `../design_extract/neuropal/refs/` — Stitch PNG mocks for every screen

Use them as the visual source of truth while iterating the Expo screens.
