# NeuroPal v2 — platform plan

> Authoritative brief for the v2 build-out (two skins, personalization, the
> Flutter version, the web platform). Read with `docs/BRAIN.md` (how the
> existing system works) and `docs/HANDOFF.md` (what is in flight).
> _Started 2026-10-23._

## 1. Decisions (owner, 2026-10-23 — locked)

| Question | Decision |
|---|---|
| Second app version | **Flutter for Android and iOS.** Swift only for iOS-native extras Flutter cannot do (WidgetKit widgets, Live Activities, later the Apple Watch app). |
| Order | **Expo leads.** The existing Expo app gets the v2 design and new modules first; the Flutter app starts with the reader (Module 0) and catches up feature by feature. |
| Web | **Two web surfaces:** the existing Expo web build (the NeuroPal app in a browser, served by `neuropal-web` on :8081) **plus** a separate Next.js platform site (`neuropal-platform/`): landing, accounts, the science-for-anyone lessons, WebGL/WebGPU. |
| Where work happens | Coded in a cloud workspace, pushed as branches/PRs to `Ryx007/NeuroPal`. Android APKs are built there and handed over; iOS builds are verified on GitHub's macOS runners and installed from a Mac. |
| Look | Two skins, one system: **Classic** (the original, unchanged: 4 themes × 4 accents) and **Signal** (brutal glass, red on graphite by default, every token user-adjustable). Signed off from the v2 render. |

## 2. Repo layout

```
NeuroPal/
├── packages/tokens/       ★ design tokens + appearance logic (single source of truth)
├── neuropal-backend/      Node/Express API (+ webServer.js for the Expo web build)
├── neuropal-expo-app/     Expo SDK 55 app — Android (primary), iOS, web   [LEADS]
├── neuropal-flutter/      ★ Flutter app — Android + iOS, reader-first      [FOLLOWS]
│   └── ios/NeuroPalWidget/  Swift WidgetKit extension (iOS extras)
├── neuropal-platform/     ★ Next.js platform site (static export)
├── neuropal-mathserve/    Nougat microservice (unchanged)
├── docs/                  BRAIN · HANDOFF · PROJECT-STATUS · this plan
└── .github/workflows/     ★ CI for all of the above
```
★ = new in v2.

## 3. Shared contracts

### 3.1 Design tokens — `packages/tokens`
- `src/tokens.js` holds every value (Classic themes copied verbatim from the
  original `palette.js`; Signal bases, accents, presets, saved looks, Pal
  options, Home tiles). `src/*.js` holds the pure logic: colour maths with
  auto-contrast, `resolveClassicPalette`, `resolveSignalPalette`,
  `normalizeAppearance`, the Ask-Pal interpreters, Home day rules.
- **Never edit generated copies.** Edit `packages/tokens`, then run
  `node packages/tokens/scripts/sync.js`. CI runs `--check`.
- Generated: Expo + platform JS copies, Flutter `tokens.g.dart` (data) +
  `test/fixtures/token_cases.json`, Swift widget fallbacks, platform CSS.
- The Dart port of the logic is hand-written and must pass every case in
  `token_cases.json` (classic, signal, interpreters, Home rules, Pal).
- Contrast guarantee (tested): any accent hue on any Signal base keeps
  accent text and text-on-accent at ≥ 4.5:1.

### 3.2 The appearance object (stored per user, synced by every client)
```js
{
  v: 1,
  skin: "classic" | "signal",
  classic: { theme: "dark"|"sepia"|"light"|"contrast", accent: "ruby"|"cyan"|"purple"|"green" },
  signal:  { acc: "#RRGGBB", base: "Graphite"|"Concrete"|"Black"|"Warm",
             motion: "Still"|"Calm"|"Lively"|"Wild", field: "Chladni"|"Interference"|"Grid"|"None",
             brutality: 0-3, corners: "Sharp"|"Soft"|"Round", texture: "Grain"|"Scanlines"|"None",
             type: "Wide"|"Condensed"|"Grotesk" },
  suggestLooks: true,                      // Pal may SUGGEST a saved look; only the user switches
  pal:  { name, shape, colour, eyes, mouth, extra, talk, voice, people },
  home: { tiles: [{ id, size: "S"|"M"|"L", hidden }], rules: [{ scope: "Weekdays"|"Weekends", tile, act: "first"|"last"|"hide" }] },
  updatedAt: ISO-8601 string
}
```
`normalizeAppearance()` repairs anything invalid; the backend validates the
same shape.

### 3.3 API
Everything in BRAIN §4 is unchanged. New in v2:

| Endpoint | In | Out |
|---|---|---|
| `GET /api/me/appearance` | — | `{appearance}` (`null` when never saved) |
| `PUT /api/me/appearance` | `{appearance}` | `{appearance}` — validated + normalised; last write wins by `updatedAt` |

`GET /api/auth/me` also carries `appearance`.

## 4. Feature parity

Legend: ✅ done · 🟡 partial · ⬜ not started · — not planned for that client.

| Feature | Expo (Android/iOS/web) | Flutter (Android/iOS) | Platform site |
|---|---|---|---|
| Module 0: library, upload, reader + karaoke TTS, Ask (RAG), study tools | ✅ (pre-v2) | 🟡 M1: library, reader + TTS highlight, Ask | — |
| Two skins (Classic + Signal) with auto-contrast | ✅ M1 | ✅ M1 | ✅ M1 (Signal default) |
| Make it yours: studio, vibes, fine-tune, Ask Pal, saved looks, undo | ✅ M1 | ⬜ M2 | — |
| Build your Pal | ✅ M1 | ⬜ M2 | — |
| Arrange Home + day rules | ✅ M1 | ⬜ M2 | — |
| Signal background fields (Chladni / interference) | ✅ M1 (expo-gl) | ⬜ M2 (fragment shader) | ✅ M1 (WebGL) |
| Focus soundscapes with evidence badges | ⬜ M2 | ⬜ M3 | — |
| Science-for-anyone lessons | — | — | 🟡 M1: lesson shell + 1 interactive lesson |
| iOS widgets (Swift) | — | 🟡 M1 scaffold | — |
| Modules 1–2 (SCAFFOLD, state system) backend routes | ⬜ M3 | ⬜ M4 | — |
| Module 7 AI companion | ⬜ M4 | ⬜ M5 | — |

## 5. Milestones

- **M1 (this branch):** tokens package; backend appearance endpoints; Expo
  two-skin system + Make it yours + Signal Home; Android APK; Flutter app
  reader-first with both skins + Android APK; iOS widget scaffold + macOS CI;
  Next.js platform shell with one lesson; CI for everything.
- **M2:** Focus soundscapes (real audio, evidence badges, body double, red-state
  calming) in Expo; Flutter catches up on Make it yours, Pal, Home.
- **M3:** Modules 1–2 backend routes (anchors, daily log, state check-ins) wired
  into Expo Home; Flutter soundscapes; platform accounts + lesson library.
- **M4+:** AI companion (Module 7), Flutter Modules 1–2, Apple Watch, store
  submission.

## 6. Running each client

| Client | Dev | Build |
|---|---|---|
| Tokens | `cd packages/tokens && npm test` | `node packages/tokens/scripts/sync.js` |
| Backend | see BRAIN §6 | — |
| Expo | `cd neuropal-expo-app && npx expo start` | BRAIN §6 "Build the Android APK" |
| Flutter | `cd neuropal-flutter && flutter run` | `flutter build apk --release` / `flutter build ios` |
| Platform | `cd neuropal-platform && npm run dev` | `npm run build` (static export to `out/`) |

## 7. Ground rules (all clients)

- Accessibility is architectural: WCAG 2.1 AA, 44 px targets, screen-reader
  labels on every control, reduce-motion honoured (motion → Still), no
  colour-only meaning (Signal warnings use hazard stripes + words, never red
  alone), captions for audio.
- Motion lives in the frame, never in reading or lesson content.
- No streaks, no ads, no data selling; user data never trains models.
- Mock/demo data is explicit opt-in; real mode surfaces every failure.
- Two app IDs so both apps install side by side: Expo `io.neuropal.app`,
  Flutter `io.neuropal.flutter`.
