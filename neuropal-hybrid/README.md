# NeuroPal — Hybrid Expo + Redux Toolkit app

Third mobile build in the folder. Picks the best of both prior cuts:

| Concern      | Codex (`../Codex/neuropal-expo-app`) | Claude (`../neuropal-app`) | **Hybrid (this dir)** |
|--------------|--------------------------------------|----------------------------|-----------------------|
| Language     | JavaScript (`.jsx`)                  | TypeScript strict          | **TypeScript strict** |
| Routing      | React Navigation v7                  | Expo Router 6              | **Expo Router 6**     |
| State        | Redux Toolkit + `react-redux`        | Zustand                    | **Redux Toolkit + `react-redux`** |
| Persistence  | `redux-persist` (AsyncStorage)       | `zustand/persist`          | **`redux-persist`**   |
| UI library   | MUI (web-only) + RN primitives       | RN primitives + NativeWind | **RN primitives + NativeWind** (no MUI — wrong layer for mobile) |
| Palette      | Runtime JS object                    | Runtime JS object          | Runtime JS object     |
| TTS          | `expo-speech` + sim timer            | `expo-speech` + sim timer  | Same                  |
| SVG buffer fix | Patched in place                   | Patched in place           | **Baked in from day 0** |

The goal is the best developer experience for the NeuroPal codebase
specifically: strict types (catch schema drift against the eventual
Supabase tables), file-based routing (cheap to add new screens), and
the Redux Toolkit store the plan doc + earlier project chat agreed on.

## Why Redux Toolkit won for the hybrid (even though I pushed Zustand earlier)

Zustand is simpler to write. Redux Toolkit is simpler to **scale and
debug** once the backend starts flowing real data:

1. **Time-travel debugging.** Redux DevTools shows every action with a
   full state diff. For a neurodivergent-first app where the nervous
   state machine routes the entire UI, that reproducibility is worth
   the boilerplate.
2. **Slice isolation.** Each concern — tweaks, onboarding, nervous,
   MVD, documents, reader chat, reader playback — lives in its own
   slice file. A new Sprint 1.3 RAG endpoint slots into
   `slices/readerChat.ts` as a thunk without touching the other six
   slices.
3. **Thunks > promises in stores.** When Claude API / Supabase calls
   land, `createAsyncThunk` gives you pending/fulfilled/rejected states
   for free. Zustand can do it, but you end up reinventing half of RTK.
4. **Team alignment.** The plan doc, the project chat, and Codex all
   went this direction. Going back to Zustand would fork the state
   model between three branches for no technical gain.

The **typed hooks** (`useAppSelector` / `useAppDispatch`) in
`src/store/hooks.ts` give us the same ergonomics as Zustand selectors
without the HOC overhead of the classic `connect(mapStateToProps)`
pattern.

## Directory

```
neuropal-hybrid/
├── app/                          Expo Router file-based routes
│   ├── _layout.tsx               Buffer polyfill · ReduxProvider · PersistGate · ThemeProvider · Stack
│   ├── onboarding.tsx            Full-bleed 4-step onboarding
│   ├── emergency.tsx             Full-bleed TIPP protocol card deck
│   └── (tabs)/                   Tab group
│       ├── _layout.tsx           Glass top bar · glass tab bar · Tweaks sheet
│       ├── index.tsx             Home — greeting · state check-in · MVD · anchor · resume
│       ├── library.tsx           Bento grid · upload · FAB
│       ├── reader.tsx            Karaoke TTS · minimap · margin Q&A · citation graph · 3 layouts
│       ├── anchors.tsx           Vertical timeline of today's anchors
│       └── profile.tsx           Onboarding answers + privacy stub
├── src/
│   ├── components/
│   │   ├── primitives.tsx        GlassPanel · DataPulse · NpPrimaryButton · NpGhostButton · SectionHeader · PhImage
│   │   └── TweaksSheet.tsx       Modal sheet driven by Redux tweaks slice
│   ├── data/mock.ts              Seed library + MVD + anchors + chat
│   ├── models/types.ts           Domain models — 1:1 with the eventual Supabase schema
│   ├── store/
│   │   ├── index.ts              configureStore + redux-persist
│   │   ├── hooks.ts              Typed useAppSelector / useAppDispatch
│   │   └── slices/
│   │       ├── tweaks.ts         Theme · accent · reader font/layout · density · size · spacing · WPM · voice
│   │       ├── onboarding.ts     Conditions · energy · primary use · completed
│   │       ├── nervous.ts        Green/Yellow/Red nervous state check-in
│   │       ├── mvd.ts            Minimum Viable Day task list
│   │       ├── documents.ts      In-memory document library
│   │       ├── readerChat.ts     Margin Q&A log (stub until RAG is live)
│   │       └── readerPlayback.ts Karaoke TTS word index
│   └── theme/
│       ├── palette.ts            Full Clinical Visionary palette — 4 themes × 4 accents
│       └── ThemeProvider.tsx     Context + usePalette / useTheme hooks (reads from Redux)
├── app.json · babel.config.js · metro.config.js · tailwind.config.js · global.css
├── nativewind-env.d.ts · tsconfig.json · package.json · .gitignore
└── README.md                     You are here
```

## Persistence policy

Only two slices are whitelisted for `redux-persist`:

- `tweaks` — user preferences that should survive app restart
- `onboarding` — answers + `completed` flag so the root `Gate` can skip
  the flow on subsequent launches

Everything else is intentionally transient:

- `nervous` — a state check-in is "how I feel **now**"; persisting it
  across cold starts would lie to the user
- `mvd` — belongs in Supabase (framework log, Phase 3)
- `documents` · `readerChat` — server-owned once Phase 1 ships
- `readerPlayback` — window-local; reloads if you kill the reader

## Buffer polyfill, baked in

Unlike the Codex version where we patched the `react-native-svg`/Buffer
crash after the fact, this scaffold has the fix from the beginning:

1. `buffer` in `package.json`
2. `extraNodeModules` alias in `metro.config.js`
3. `global.Buffer = Buffer` at the very top of `app/_layout.tsx`,
   above every other import

If you ever drop `react-native-svg` you can remove all three with no
ripple effect.

## Getting it running

```bash
cd neuropal-hybrid
npm install
npx expo prebuild --platforms ios android   # one-time, generates native projects
npm run ios       # iOS simulator
npm run android   # Android emulator / device
npm run web       # Web parity
```

A dev build is required because `expo-blur`, `expo-speech`, and
`react-native-pager-view` need native bindings. Expo Go won't cut it.

## What's wired, what's stubbed

**Wired (functionally complete for the MVP):**

- 4-step onboarding with answers persisted via redux-persist.
- Onboarding-complete gate in `app/_layout.tsx#Gate` — users skip the
  flow on subsequent launches.
- State check-in (3-tap), with Red routing straight to `/emergency`.
- Minimum Viable Day task list with checkbox toggles.
- Anchors timeline + next-anchor card on Home.
- Library bento grid with `expo-document-picker` uploads feeding into
  the documents slice.
- Reader: karaoke highlight via `expo-speech` **and** a simulated
  fallback timer calibrated to WPM. Playback state lives in
  `readerPlayback` so the progress bar survives re-renders.
- Reader layouts (Split/Focus/Paginated) switched from Tweaks.
- Long-press any paragraph → Ask pipeline → margin note appears via
  the `readerChat.askReader` action.
- Citation graph preview dialog with an SVG node-link layout.
- TIPP protocol full-bleed screen with 4-step paced navigation.
- Tweaks (theme/accent/font/layout/density/font size/line spacing/WPM/voice)
  persist across launches.

**Stubbed (Phase >=1.3 backend work required):**

- `askReader` action returns a placeholder answer. Replace the reducer
  body with a `createAsyncThunk` that POSTs to `/documents/{id}/query`
  once the LlamaIndex + pgvector pipeline is live (Plan §Sprint 1.3).
  The pending/fulfilled/rejected handlers will give you the loading
  state for the margin note automatically.
- `documents` slice is populated from `MockDocuments`. Swap it for a
  RTK Query endpoint or a thunk that hits Supabase once §Sprint 1.1
  lands.
- No auth yet (Plan §Sprint 2.1). The onboarding gate handles
  onboarding-completed; add an auth-session guard next to it.
- Smartwatch (Phase 10) — out of scope here.

## Accessibility (WCAG 2.1 AA)

Every primitive from the Zustand version carries over verbatim:

- `accessibilityRole` + `accessibilityLabel` on every CTA.
- 44×44+ tap targets everywhere.
- Dyslexia-friendly reader font toggle uses Atkinson Hyperlegible with
  extra letter spacing (per the Stitch `.dyslexia-friendly` rule).
- No 1px solid section borders — boundaries come from surface tier
  shifts, per DESIGN.md "No-Line Rule".
- `ThemeChoice.contrast` → WCAG-AAA contrast theme for low-vision users.
- `<Text selectable>` on every reader paragraph gives VoiceOver /
  TalkBack selection for free.

## What plugs into the backend

| Frontend entry point                                 | Backend endpoint                    | Plan §  |
|------------------------------------------------------|--------------------------------------|---------|
| `app/(tabs)/library.tsx#pickDoc`                     | `POST /documents/upload`             | 1.1     |
| `slices/readerChat.ts#askReader` (future thunk)      | `POST /documents/{id}/query`         | 1.3     |
| `app/(tabs)/reader.tsx#togglePlay`                   | `POST /tts/generate` (stream)        | 1.2     |
| `app/_layout.tsx#Gate` + new auth slice              | Supabase Auth session                | 2.1     |

When any of those ship, the screens don't need restructuring — only
the relevant slice gets a thunk.
