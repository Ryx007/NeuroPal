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
├── neuropal-ios/          ◆ native SwiftUI app — iPhone + iPad (XcodeGen + two Swift packages)
├── neuropal-platform/     ★ Next.js platform site (static export) + ◆ the web app at /app/
├── neuropal-mathserve/    Nougat microservice (unchanged)
├── docs/                  BRAIN · HANDOFF · PROJECT-STATUS · this plan
└── .github/workflows/     ★ CI for all of the above
```
★ = new in v2. ◆ = new in round 3 (2026-10-29, branch `v3-apple-web`, PR #3).

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

| Feature | Expo (Android/iOS/web) | Flutter (Android/iOS) | Platform site | Native iOS + iPadOS ◆ | Web app `/app/` ◆ |
|---|---|---|---|---|---|
| Module 0: library, upload, reader + karaoke TTS, Ask (RAG), study tools | ✅ (pre-v2) | 🟡 M1: library with ingest status, reader + TTS highlight, Ask with sources (no upload or study tools yet) | — | 🟡 library, upload, reader + word-by-word read-aloud, PDF original (PDFKit), EPUB, Ask with sources — no study tools yet | 🟡 the same, desktop-first — no study tools yet |
| Two skins (Classic + Signal) with auto-contrast | ✅ M1 | ✅ M1 | ✅ M1 (Signal default) | ✅ (Swift port of the tokens, fixture-proven) | ✅ |
| Make it yours: studio, vibes, fine-tune, Ask Pal, saved looks, undo | ✅ M1 | 🟡 M1: skin, vibes, Classic theme/accent in Settings | ✅ M1 (/appearance) | ✅ Settings → Make it yours (incl. Ask Pal, undo) | 🟡 core controls in Settings; the full studio is the site's /appearance |
| Appearance sync (GET/PUT `/api/me/appearance`, 409 → adopt) | ✅ M1 (two-way) | 🟡 M1 (push only) | ✅ M1 (save; asks on 409) | ✅ two-way | 🟡 saved from the studio; no automatic pull on sign-in yet |
| Build your Pal | ✅ M1 | ⬜ M2 | — | 🟡 Settings → Pal's look | ⬜ |
| Arrange Home + day rules (Classic keeps its original Home until arranged) | ✅ M1 | ⬜ M2 (no Home yet) | — | 🟡 follows the saved layout + rules (no arrange screen yet) | 🟡 follows the saved layout + rules (no arrange screen yet) |
| Signal Home (S-Today board) and Signal player (S-Reader board) | ✅ M1 | 🟡 M1: Signal player | — | ✅ | ✅ |
| Signal background fields (Chladni / interference) | ✅ M1 (expo-gl) | ⬜ M2 (fragment shader) | ✅ M1 (WebGL) | ✅ (Canvas, still when motion is off) | ✅ (site WebGL field) |
| Signal layouts for Library, Notes, Toolbox (tokens apply already) | ⬜ M2 | — | — | 🟡 Library (no Notes/Toolbox yet) | 🟡 Library (no Notes/Toolbox yet) |
| Focus soundscapes with evidence badges | ⬜ M2 | ⬜ M3 | — | ⬜ | ⬜ |
| Science-for-anyone lessons | — | — | 🟡 M1: lesson shell + two-source interference | — | — (the site's /learn) |
| iOS widgets + focus Live Activity (Swift) | — | 🟡 M1: built for the simulator in CI; not run on a device | — | 🟡 check-in (App Intents), next anchor, continue reading, lock screen — no Live Activity; simulator only | — |
| Sign-in to the public server (invite code, sessions, sign out everywhere) | ✅ 0.3.0 (opens offline without a session) | ✅ 0.2.0 (Cloud first) | 🟡 M1 page (/sign-in) | ✅ (Keychain, host-bound) | ✅ (this tab, or kept on this device) |
| Check-in slider (drag/tap; thirds decide the state; history) | ✅ 0.3.0 | ⬜ (no Home yet) | — | ✅ | ✅ |
| Pal assistant: bubble + sheet (What now?, Break it down, Brain dump, Sit with me, Talk; `/api/pal/*`) | ✅ 0.3.0 | ⬜ | — | ✅ (bubble on iPhone, sidebar on iPad) | ✅ (a page, no bubble) |
| Android home-screen widget "Pal" (check-in, next anchor, Ask Pal) | ✅ 0.3.0 (react-native-android-widget; not yet run on a device) | — | — | — | — |
| Modules 1–2 (SCAFFOLD, state system) backend routes | ⬜ M3 | ⬜ M4 | — | ⬜ | ⬜ |
| Module 7 AI companion | ⬜ M4 | ⬜ M5 | — | ⬜ | ⬜ |
| Calming steps (TIPP), usable signed out and offline | ✅ (Emergency) | ⬜ | — | ✅ | ✅ |
| Original PDF download (`GET /documents/:id/file`) | — | — | — | ✅ PDFKit view | — (page images) |

The Dart port covers the palette logic (parity-tested against
`token_cases.json`); the Ask-Pal interpreters and Home rules are ported in M2
(their fixture groups are skipped until then).

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
| Native iOS | `cd neuropal-ios && xcodegen generate && open NeuroPal.xcodeproj`, or `scripts/mac-build.sh build iphone` + `shot …` | Xcode archive (needs an Apple team) |
| Web app checks | `node scripts/qa/dev-api.cjs 4420` + `npm run build && npm run serve` | `node scripts/qa/web-reader.mjs --web http://127.0.0.1:4321 --api http://127.0.0.1:4420` (and `web-shell.mjs`) |

## 7. Ground rules (all clients)

- Accessibility is architectural: WCAG 2.1 AA, 44 px targets, screen-reader
  labels on every control, reduce-motion honoured (motion → Still), no
  colour-only meaning (Signal warnings use hazard stripes + words, never red
  alone), captions for audio.
- Motion lives in the frame, never in reading or lesson content.
- No streaks, no ads, no data selling; user data never trains models.
- Mock/demo data is explicit opt-in; real mode surfaces every failure.
- App IDs so the apps install side by side: Expo `io.neuropal.app`,
  Flutter `io.neuropal.flutter`, native iOS `io.neuropal.ios` (widgets
  `io.neuropal.ios.widgets`, App Group `group.io.neuropal.ios`).
