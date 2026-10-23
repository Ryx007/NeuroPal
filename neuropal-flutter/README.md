# NeuroPal F — the Flutter app

The Flutter version of NeuroPal for Android and iOS. **M1 is reader-first**:
the library, the reader with synced text-to-speech ("karaoke"), Ask (questions
answered from the document), and both skins — **Classic** (calm glass, the
original look) and **Signal** (brutal glass). The Expo app leads; this app
catches up feature by feature (see `docs/PLATFORM-PLAN.md` §4).

It installs **next to** the Expo app: application id / bundle id
`io.neuropal.flutter`, home-screen name **NeuroPal F**.

## Run it

Requirements: Flutter **3.47.7 stable** (Dart 3.13.5), JDK 17, Android SDK 36.

```sh
cd neuropal-flutter
flutter pub get
flutter run                 # a connected phone or an emulator
```

The app looks for the backend (BRAIN.md §4) in this order and uses the
**first that answers** `GET /healthz`:

1. the custom address typed in **Settings → Backend connection**,
2. Tailscale: `http://ryx-mac-mini.tail73ed8.ts.net:4000`,
3. home Wi-Fi: `http://192.168.3.169:4000`.

If none answers, the Library says so (with each reason) and offers Retry —
it never shows fake data. To try the app without a backend, turn on
**Settings → Demo library (offline)**: two short physics samples, bundled.

## Build

```sh
# Android (arm64 phones like the S24 Ultra), signed with the debug key:
flutter build apk --release --target-platform android-arm64
# → build/app/outputs/flutter-apk/app-release.apk

# iOS (on a Mac with Xcode):
flutter build ios --release
```

Cleartext HTTP is allowed on purpose (the backend is plain HTTP on the
owner's own machines): `android/app/src/main/res/xml/network_security_config.xml`
and `NSAppTransportSecurity` in `ios/Runner/Info.plist`. Revisit both before
any store release.

## Design tokens (never edit the generated files)

All colours, shapes and type roles come from `packages/tokens` (shared with
the Expo app, the web platform and the iOS widget). These files are
**generated** — change `packages/tokens/src`, then from the repo root run:

```sh
node packages/tokens/scripts/sync.js
```

| Generated file | What it is |
|---|---|
| `lib/theme/tokens.g.dart` | token **data** (themes, accents, Signal bases, presets, type roles…) |
| `test/fixtures/token_cases.json` | JS-computed palettes the Dart port must reproduce exactly |
| `ios/NeuroPalWidget/NeuroPalTokens.swift` | fallbacks for the iOS widget (leave alone) |

The **logic** is hand-ported to Dart in `lib/theme/` (`color_math.dart`,
`classic_palette.dart`, `signal_palette.dart`, `appearance.dart`, `pal.dart`).
`test/tokens_parity_test.dart` checks every Classic, Signal and Pal case in the
fixtures against it, value for value. If it fails after a tokens change, fix
the Dart port, never the fixtures.

## How the code is organised

```
lib/
├── main.dart               start-up: preferences, services, font licences
├── app.dart                providers + MaterialApp (theme from the appearance)
├── app_routes.dart         Library (root) · Reader · Settings, drawer rule
├── services.dart           the long-lived objects (backend, settings, TTS…)
├── theme/                  tokens → palette → NpStyle (colours, shapes, fonts)
├── data/                   backend connection, models, document sources
├── library/                Library screen + controller
├── reader/                 tokenizer, TTS player, reader screen + player
├── ask/                    Ask sheet + controller
├── settings/               Settings screen
└── widgets/                skin-aware building blocks (panel, buttons, …)
```

State is **provider + ChangeNotifier only**. Widgets read colours from
`NpStyle.of(context)` (never hard-coded), and everything tappable goes through
`NpPressable` (screen-reader label, focus ring, ≥ 44 px target).

## How the reader works

- **Words.** `/text` is split into paragraphs on blank lines; long paragraphs
  are split at 180 words without cutting inside `$…$`. Every token has a
  global **word index** — what the highlight shows, what tapping a word seeks
  to, and what is saved as `lastWordIndex`. Equations (`$…$`, `$$…$$`, PDF
  "math salad") are **one token**, shown prettified and spoken as "equation".
- **Speech.** Words are spoken in ≤ 3000-character utterances chained on
  completion (Android rejects ~4000+). The engine reports the character range
  it is speaking (Android 8+ / iOS); a per-chunk offset table turns that into
  the word index. When an engine reports no ranges, a timer **estimates** the
  position from elapsed time × pace (in characters, so long words take
  longer), learns the engine's real pace from each finished chunk, and retires
  for good on the first real range event.
- **Speed.** WPM 120–400 (default 225) maps to the engine rate through one
  constant, `kEngineNormalWpm = 175` in `lib/reader/wpm.dart` (the WPM a voice
  speaks at rate 1.0). If speech is consistently faster or slower than the WPM
  shown on a device, adjust that constant. Tone: Soft / Natural / Deep =
  pitch 1.1 / 1.0 / 0.85 (same as the Expo app).
- **Progress.** Saved with `PATCH /api/documents/:id/progress` on pause, seek,
  finish, app backgrounding, and every 30 s while listening; restored from
  `GET …/progress` on open. Listening continues while you visit the Library or
  Settings (a "now playing" bar brings you back).

## Accessibility

Every control has a screen-reader label; paragraphs are announced as text
with "read aloud from here" as the tap action; touch targets are ≥ 44 px;
system text size is respected (layouts wrap instead of overflowing); colours
come only from the tokens (AA contrast is guaranteed there); the OS
"remove animations" setting forces motion **Still** (no pulsing, sliding or
spinning); warnings never rely on colour alone (hazard stripes / icon + words).

## Tests

```sh
flutter analyze
flutter test
```

Covers: token parity with the JS, the tokenizer (equations, word indexes,
chapters), TTS chunking and the player (range sync, stale events, the
estimator), backend address selection and errors, appearance persistence,
and end-to-end widget tests in demo, offline and real (mocked) modes.

## M1 and M2

| | M1 (this) | M2 (next) |
|---|---|---|
| Library | list, status, progress, pull to refresh | upload, rename, delete, filters |
| Reader | karaoke TTS, WPM / tone / voice, tap to seek, chapters on the scrubber, text settings | EPUB publisher view, original PDF pages, real math typesetting, highlights & bookmarks |
| Ask | grounded answers with citations | chat history, study tools (summaries, quizzes, flashcards) |
| Look | Classic theme × accent, Signal presets, grid / grain / scanlines | "Make it yours" studio (fine-tune, Ask Pal, saved looks), animated Chladni / interference fields |
| Sync | appearance saved on the device, best-effort `PUT /api/me/appearance` | read it back from the backend; Pal, Home |

Known M1 limitations:

- Resume positions are shared with the Expo app through `lastWordIndex`. Both
  apps count words the same way for documents with a real table of contents;
  for documents without one, the Expo reader drops detected headings from its
  word count, so a position saved there can land a few words off here.
- TOC entries that only carry a page number (no paragraph anchor) are not
  shown as chapters yet.
- iOS speed mapping is approximate (AVSpeechSynthesizer's rate is not
  linear); the highlight stays exact because iOS reports word ranges.
