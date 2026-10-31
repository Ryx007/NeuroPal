# NeuroPal — Session Handoff

> **Who this is for:** a fresh Claude Code session (or human) picking up with
> **zero chat history**. It captures what's in-flight, what was decided and
> why, and the traps — so nothing already-established gets re-derived.
>
> Read order: this file → `docs/BRAIN.md` (how the system actually works) →
> `docs/PROJECT-STATUS.md` (phase table + Next actions). `BUILD-BRIEF.md` is
> the original spec but predates most of what's below.
>
> _Written 2026-08-04 after the port-split + collaborator-prep session;
> §0 added 2026-10-23 for the v2 platform branch, round 2 on 2026-10-24,
> round 3 (native iOS + iPadOS app, web app) on 2026-10-29; the owner's
> priority (Android + web first, native iOS last) on 2026-10-31._
> _Author: Claude (Opus/Sonnet/Fable across the session), owner "Ryx"._

---

## 0. v2 PLATFORM BUILD-OUT (branches `v2-platform` → `v3-apple-web`, 2026-10-23…29) — read first

### Round 3 (2026-10-29): native iPhone + iPad app and the web app — branch `v3-apple-web`, PR #3

The owner asked for an iOS + iPadOS app and a web version **now**, in
parallel, while the cross-platform choice (Expo vs Flutter) stays open. The
branch is stacked on `v2-platform` (PR #3 → base `v2-platform`). There are now
four clients to keep in step: Expo, Flutter, native iOS, web.

How it was built: I wrote the foundation (both skeletons, shared contracts,
build tooling), then six agents worked in parallel, each owning its folders
(iOS: core/account/shell, tokens/theme/Settings, Library/Reader/Ask,
Home/Pal/widgets; web: shell/Home/Pal/Settings, Library/Reader/Ask).
Independent reviews followed (see "Reviews" below).

- **Native app — `neuropal-ios/`** (SwiftUI, iOS 18+, iPhone + iPad; README in the folder):
  - The project is **generated**: `brew install xcodegen && cd neuropal-ios && xcodegen generate`.
    Never commit `NeuroPal.xcodeproj`.
  - `Packages/NeuroPalCore` (macOS + iOS, `swift test`): `NPTokens` (Swift
    port of `packages/tokens`, proven against `cases.json` + ~2 000 extra
    JS-computed cases), `NPCore` (models, `NeuroPalAPI` = HTTP + offline
    mock, `AppSession` with every Expo boot rule, Keychain session bound to
    the server address, `ServerAddress` — http only on local networks,
    `AppNavigator`, `neuropal://` links, App Group files), `NPDay` (check-in
    rules, anchors, minimum day, Pal's offline logic; the crisis pattern is
    byte-identical to the backend's — a test reads both files).
  - `Packages/NeuroPalUI`: `NPTheme` (both skins, fonts per role,
    Signal's living field, primitives, look sync with the server),
    `NPAccount` (sign-in, invite sign-up, server form, account settings),
    `NPReader` (library; TextKit 2 reader with word-by-word read-aloud
    on AVSpeechSynthesizer + lock-screen controls; PDFKit "Original" view;
    sandboxed EPUB WKWebView with a strict CSP; Ask with citation chips),
    `NPHome` (Home tiles, check-in slider, anchors, calming steps, widget
    views), `NPPal` (the assistant's five tools, the bubble), `NPSettings`.
  - iPhone: tab bar + Pal bubble. iPad: sidebar (`TabView .sidebarAdaptable`),
    Library as a split view with Ask in an inspector, ⌘1–⌘4 / ⌘⇧P.
  - Widgets (`NeuroPalWidgets/`): check-in (App Intent buttons; Overwhelmed
    opens `neuropal://calm`), next anchor, continue reading, lock-screen
    accessories. They read `day.json` / `appearance.json` / `reading.json`
    in the App Group `group.io.neuropal.ios`.
  - **Mac loop:** `scripts/mac-build.sh build iphone|ipad`, `test`,
    `shot <name> iphone|ipad <launch args>`, `ui-test`. One machine-wide
    `lockf` lock serialises Xcode work. Screenshots never need a server:
    `-NPMock 1 -NPScreen home|library|reader|ask|pal|calm|settings|widgets`
    (all options in `NeuroPal/LaunchOptions.swift`, debug builds only).
  - CI: `ios.yml` job "Native iOS app (simulator)" (XcodeGen, unsigned
    simulator build, `swift test`: 212 tests — NPTokens 21, NPDay 57,
    NPCore 134). `workflow_dispatch` on a `wip/*` branch builds a snapshot
    when the Mac is unreachable.
- **Web app — `neuropal-platform` `/app/`** (desktop-first, works at 390 px):
  - The public site moved into the route group `src/app/(site)/` (same URLs);
    `/app/` has its own frame: `src/app/app/*`, screens in
    `src/components/app/*`, logic in `src/lib/neuropal/*`.
  - Routes: `/app/` Home, `/app/library/`, `/app/read/?doc=<id>` (reader +
    Ask; a query parameter because the export is static), `/app/pal/`,
    `/app/settings/`, `/app/calm/` (works signed out).
  - Sign-in inside the app; the session is per tab by default, or kept on
    this device (localStorage) when the user ticks it. Every end of a
    session goes through `lib/neuropal/localData.endSession()`, which
    clears that account's local data; the look syncs both ways
    (`lib/neuropal/lookSync.ts`, merge rule `lookForServer` in
    `lib/appearanceStore.ts`, shared with the studio).
  - Read-aloud uses the Web Speech API (`onboundary` word events, a WPM
    estimate when a voice sends none). EPUB chapters render in a sandboxed
    iframe (no same-origin, a nonce'd runtime only).
  - Checks: `scripts/qa/dev-api.cjs <port>` starts a real public-mode API
    on an in-memory MongoDB with seeded documents and a **labelled fake AI**;
    `scripts/qa/web-reader.mjs` and `web-shell.mjs` drive Chromium through
    every screen (both skins, 1440 and 390, axe on each state);
    `web-shell-crisis.mjs` checks the crisis pattern against the backend;
    `markdown-timing.mjs` keeps the answer renderer linear. CI job "Web app
    (browser checks, real backend)" runs them all (reader 179 checks,
    shell 127). Poppler must be installed for the page-image checks.
  - Hosting: it's static (`npm run build` → `out/`). Served from
    `https://ryx007.work/app/`, it is already allowed by the VPS
    `CORS_ORIGINS`; any other origin must be added there.
- **Backend:** `GET /api/documents/:id/file` (the original PDF for native
  viewers; pdf/arxiv only; attachment, `private, no-store`, CSP sandbox,
  only from inside STORAGE_ROOT); `/api/pal/breakdown` answers a
  crisis-sounding task with `{steps:[], crisis:true, reply}`. Backend 47/47.
- **Tokens:** `sync.js` now also writes the Swift port's constant tables
  (`NPTokens/Resources/tokens-data.json`) and its fixtures
  (`cases.json` + `extra-cases.json` from `scripts/extra-cases.mjs`);
  `--check` covers them.

**Reviews (round 3):** three independent reviews (iOS core; iOS features; the web app),
then three fix agents. Everything rated high is fixed:
  - **Crisis safety, every client + the server:** "Break it down" never
    ran the crisis check, so "I want to end my life" could become steps
    (offline: template steps). The apps now check first, and the server's
    `/api/pal/breakdown` answers `{steps:[], crisis:true, reply}` without
    the model. The apps' check also skipped whitespace variants ("kill
    myself" with two spaces, a tab or an NBSP) that the server catches;
    they now normalise like the server.
  - **iOS session:** a sign-in reply arriving after a server switch could
    bind the token to the wrong server (now dropped); a percent-escaped
    server address crashed every launch (fixed, and a new address is only
    saved after it answers); http addresses get an "isn't encrypted"
    warning and the token goes over http only to the kind of address it
    was saved for; the debug launch options are compiled out of Release
    (`DebugLaunch`, process arguments only).
  - **Web, shared browsers:** sign-out (and a forced 401) now clears the
    previous account's day data, Pal chat and upload queue; a queued
    upload can no longer land in the next account's library; personal data
    carries a hashed owner, so another account's session wipes it first.
    Document tickets follow the token (a password change no longer breaks
    books); the Markdown renderer is linear on garbled input; and the web
    app now syncs the look both ways (`lookSync.ts`).
  - **iOS, other:** reading positions use the same word stream as Expo
    and the web (`ReaderWords`, fixture generated from the JS); sign-out
    purges Pal's chat, the reading snapshot, cached page images and
    downloaded PDFs (day.json stays, as on Expo); EPUB sanitiser moved to
    `EpubSanitizer` with tests (strips until stable, only the exact
    chapter URL may load), next chapters are read ahead so read-aloud
    carries on with the screen locked; "Sit with me" schedules an end
    notification; lock-screen widgets redact personal text and the
    check-in intent needs an unlocked device; day.json writes are
    file-coordinated between app and widget.
  Residual risks, documented: http to a private address can still meet the
  same address on another network (warned); the app and widget were only
  tested as two threads, not two processes; no real-device run yet.

**Owner's priority (2026-10-31):** keep all four clients. New work goes to
**Android (Expo + Flutter) and the web app first**. The native iOS app is the
lowest priority until the Apple Developer account is sorted: features are
ported to it later, and its CI job stays as it is.

**Waiting on the owner (round 3):**
- **VPS access** (from round 2). The owner runs `ssh-copy-id -i
  ~/.ssh/neuropal_vps.pub root@161.97.154.212` on the MacBook Air. The key
  has been there since 2026-10-24 (ED25519, comment
  `neuropal-deploy@ryxs-macbook-air`). The cloud workspace can't make SSH
  connections, so Claude reaches the server only through the Mac. The Mac
  must be awake, with the desktop app open.
- **Where the web app lives** (e.g. `https://ryx007.work/app/`).
- **Later, for iOS:**
  - An **Apple Developer team**: set `DEVELOPMENT_TEAM` in
    `neuropal-ios/project.yml`, and register the App Group
    `group.io.neuropal.ios` for `io.neuropal.ios` and
    `io.neuropal.ios.widgets`.
  - **`sudo DevToolsSecurity -enable` once on the Mac.** Until then the UI
    test target (`ui-test`, accessibility audits) can't start ("failed to
    bless service hub").
- **Still from round 2:** the friend's exposed databases, free Gemini vs
  "never trains models", Classic's primary-button gradient.

**Traps from round 3 (don't re-derive):**
- XcodeGen: add the shared fonts as a **folder** (`type: folder`) and list
  them in `UIAppFonts` as `fonts/<file>.ttf`; `includes:` + `group:` doubled
  the path.
- Simulator builds use ad-hoc signing (`CODE_SIGN_IDENTITY=-`), which embeds
  the entitlements, so the App Group works without a team. Unsigned builds
  (`CODE_SIGNING_ALLOWED=NO`, CI) have no App Group: `SharedContainer`
  falls back to Application Support.
- A freshly booted simulator sometimes refuses the first `simctl install`
  ("Failed to create promise"); `mac-build.sh` retries once.
- `swift test` prints one "Test run with N tests" line PER test target.
- Several `next dev` servers can share the folder with
  `NP_DIST_DIR=.next-<name>`; `next dev` then rewrites `tsconfig.json`
  (restore it) and writes `AGENTS.md` (git-ignored).
- Turbopack/Next 16: `useSearchParams` in a statically exported page needs a
  `<Suspense>` boundary.
- The Mac link drops now and then; a long build keeps running there. Poll
  with `read_process_output` again instead of restarting it.

### Round 2 (2026-10-24): cloud server, sign-in, keyboard, check-in slider, Pal assistant + widget

The owner is travelling (India) and the Mac Mini in Italy is unreachable, so
the backend moves to the **Contabo VPS** (161.97.154.212, shared with a
friend). Owner's choices: public HTTPS now · start with an empty database ·
set NeuroPal up alongside the friend's services and change nothing of theirs ·
a sign-up key (invite code) · react-native-keyboard-controller.

- **VPS stack — `deploy/vps/`** (commit `a19ca09`). Compose project
  `neuropal-v2`:
  - **api**: Node 22 image with poppler, tesseract and djvulibre.
  - **mongo 8**: the app user has readWrite on `neuropal` only.
  - **qdrant v1.20**, with an API key.
  - **ollama 0.40.10**: the embedder only; `OLLAMA_CHAT_MODEL=off`.
  - **backup**: a nightly dump.
  - **cloudflared**: behind profile `tunnel`.

  No host port is published: the only way in is the Cloudflare Tunnel at
  **https://api.ryx007.work** (DNS for ryx007.work is on Cloudflare). The
  scripts:
  - `install.sh`: the one-line installer. It clones to `/opt/neuropal`, then
    runs the next two.
  - `bootstrap.sh`: writes the secrets to `deploy/vps/.env` (chmod 600; the
    invite code is `SIGNUP_INVITE_CODE`) and asks for the Gemini key.
  - `tunnel.sh`: Cloudflare login, tunnel + DNS route, then starts
    cloudflared.

  **Not deployed yet.** It needs either SSH access (the owner runs
  `ssh-copy-id -i ~/.ssh/neuropal_vps.pub root@161.97.154.212` on the Mac) or
  the owner running `install.sh` as root on the VPS.
- **Backend for a public server** (`a19ca09`; BRAIN §4 has the endpoints):
  - Sessions: JWT, 30 days, refreshed by `/auth/me` up to 90 days from
    sign-in. Sign out everywhere and password change both bump
    `tokenVersion`.
  - Sign-up is by invite only.
  - Scoped document tickets for EPUB files and page images.
  - scrypt passwords; rate limits per network and per account.
  - Extraction and EPUB unpacking run in child processes with memory caps
    and timeouts.
  - SSRF-safe arXiv import.
  - Daily AI budget per user.
  - Pal routes `/api/pal/*`.
- **Expo app 0.3.0:**
  - **Sign-in screen and gate.** Only a 401 from the server shows sign-in.
    Offline, or with the server down, the app still opens: everything on the
    phone works. Settings → Account has sign out, sign out everywhere and
    change password. The server address can be changed on the sign-in
    screen and in Settings.
  - **Keyboard:** react-native-keyboard-controller. `KeyboardProvider` sits
    in App.js; `components/KeyboardSafeScrollView.jsx` is on every screen
    with a text field, Home included (a plain ScrollView on web); modals use
    its `KeyboardAvoidingView`. react-native-keyboard-aware-scroll-view is
    gone: its measurements are no-ops on the New Architecture with
    edge-to-edge.
  - **Check-in slider** on Home (`components/home/StateSlider.jsx`,
    `stateScale.js`): drag or tap.
    - The region decides the state: 0–33 okay, 34–66 bit off, 67–100
      overwhelmed.
    - History lives in `home.checkins`: cap 200, and a move within 60 s
      refines the last entry.
    - Moving into overwhelmed opens the calming steps.
  - **Motion** (`components/motion/`): entrances, press feedback, a state
    pulse, Pal's mood hop and haptics. All of it stops at motion "Still" and
    with the OS reduce-motion setting.
  - **Pal assistant** (`components/pal/`, `services/pal*.js`,
    `store/slices/palSlice.js`):
    - A floating bubble (`PalBuddyHost` in AppNavigator's NavOverlay; not on
      Reader or Studio) and a sheet with What now?, Break it down, Brain
      dump, Sit with me and Talk.
    - Home's Pal tile and Signal's header Pal open the sheet too.
    - Settings → "Pal's bubble" hides the bubble. Screens pad their last row
      clear of it (`usePalBubbleClearance`).
    - Messages that sound like a crisis never leave the phone.
  - **Android widget "Pal"** (`src/widgets/`, react-native-android-widget
    0.24):
    - Shows the state, the next anchor and three check-ins.
    - Okay and Bit off record in the background. Overwhelmed opens the
      calming steps through `neuropal://calm` and checks in there.
    - Ask Pal opens the sheet through `neuropal://pal`.
    - The app writes a snapshot about 1 s after a change
      (`useWidgetBridge`). Widget check-ins join the check-in history at the
      time they were tapped.
- **Flutter 0.2.0** (`e78a575`): sign-in to the public server, Cloud first.

**Review fixes (round 2).** Three independent reviews (security,
correctness, accessibility) of the Expo diff; fixed before commit:
- **Sessions.** A session is stored with the server that issued it
  (`neuropal.session.v2`: `{host, token}`) and only ever sent there, so
  "Change server" or a fallback address never carries it to another host.
  - It lives in expo-secure-store (Keystore/Keychain) on the phone and in
    localStorage on the web.
  - A 401 only ends the session when it answers a request that carried the
    current token (`isCurrentSession401`).
  - After a sign-out the app no longer opens offline without signing in
    again (`neuropal.signed-out`). A phone that never signed in still opens
    offline.
  - Local data is not separated per account: signing out keeps check-ins,
    anchors, the brain dump and Pal's chat on the phone.
- **Book chapters.** A strict Content-Security-Policy and
  `referrer: no-referrer` come before any of the book's markup
  (`buildChapterHtml`):
  - only the reader's own two scripts run (per-chapter nonce);
  - the book's CSS, images and fonts load only from the API host;
  - no forms, frames or fetches.

  The regex stripping is now only a second layer. Checked in Chromium
  against the reviewer's bypasses: none ran, and the external beacon was
  blocked.
- **Widget link.** `neuropal://calm` from the widget carries a secret key
  (`?k=`, stored in the app's private storage and in the snapshot). Only
  with the key does it also check in as red; any other app's
  `neuropal://calm` just opens the calming steps.
  - Pending widget check-ins are applied first.
  - A widget tap older than the app's newest check-in only joins the
    history (in time order) and never changes the state.
  - The calming steps open at once on a cold start (no wait behind
    "Connecting…").
  - Their close button always leads somewhere, even when there is nothing
    to go back to.
- **Crisis check.** The on-device and server crisis check covers more
  phrasings and Italian, Spanish, French, German and romanised
  Hindi/Bengali. The app no longer claims it catches everything.
- **Smaller fixes:**
  - A 200 that isn't a user is treated as no answer (never a sign-out);
    a 404 with no session shows the sign-in screen.
  - The account loads when the server comes back after an offline start.
  - The document pass is retried on dropped connections.
  - The Pal sheet closes when the session ends.
  - The brain dump is capped as items are added.
  - Widget buttons keep their words with enlarged text (≥ 300 dp), and
    TalkBack hears Pal's line.
- **Accessibility:**
  - Slider steps commit after a pause and never jump into the calming
    steps; red offers a button instead.
  - Announcements go through `services/announce.js` (native
    announceForAccessibility plus web live regions).
  - Sign-in errors stay on screen.
  - Radio semantics for the state options and the Settings segments.
  - Dialogs scroll above the keyboard.
  - Visible field edges.
  - A "Reduce motion" setting.
  - Pal's bubble hides while a note is open.

  Details are in the commit.

Left by decision:
- **`usesCleartextTraffic` stays on.** LAN and Tailscale servers are http;
  the cloud default is https.
- **No purge of local data on sign-out.** Check-ins, anchors and the brain
  dump exist only on the phone, so purging would destroy them. A sign-out
  now blocks the offline open instead.
- **The widget's "handled once" launch-link guard stays module-level.** It
  only matters if Android recreates the Activity while the JS runtime
  lives on.
- **Home still dispatches `setNervousState` after `recordCheckin`.**
  Existing listeners depend on that action.
- **Ask Pal stays 42 dp tall at the 4×2 minimum.** That is AA; 48 dp is
  the app's own goal.

Also found and left for M2: AnchorEditor, AskSheet and the colour picker
still label their fields only in placeholders. Classic's primary-button
gradient (predates v2) fails text contrast at its far end in every Classic
theme except Contrast; changing it changes Classic's look, so it's the
owner's call. `readerMargin` isn't persisted.

**Waiting on the owner (round 2):**
1. VPS access (above).
2. Ask the friend about their MongoDB (:27017) and Qdrant (:6333), which
   are open to the internet, and about the shared Mongo password. NeuroPal
   uses its own containers and leaves theirs alone.
3. The free-Gemini privacy decision (below), which now also covers Pal's
   Talk.
4. Optional: a Cloudflare rate-limit rule for `/api/auth/*`.
5. Install both APKs.

Known limits: uploads over 100 MB fail through the tunnel (a Cloudflare
limit), and there is no Nougat math tier on the VPS (pdf-parse instead).

**Traps from round 2 (don't re-derive):**
- Widget files start with `"use no memo"`: the React Compiler would break the
  library's plain-function rendering.
- The widget's native wiring exists only after a full `expo prebuild` run
  from `neuropal-expo-app`; `NO_PREBUILD=1` builds lack it.
- keyboard-controller's scroll-view ref spreads the instance, which loses
  react-native-web's `scrollTo`. That is why web gets a plain ScrollView.
- Metro caches inlined `EXPO_PUBLIC_*` values: use `expo export --clear` when
  switching env.
- The React Compiler skips components with `try/finally` and no `catch`.
- `net.BlockList` with `::ffff:0:0/96` blocks every IPv4 address.
- `pdftoppm --version` exits 1, so find it on PATH instead.
- `pkill -f` / `pgrep -f` also match the shell running them; write the
  pattern as `name[.]cjs`.
- The review-council reviewer agents refuse to run on this branch because
  the CI workflow files differ from main. Use general-purpose reviewers.

### v2 build-out (2026-10-23)

The owner signed off the v2 render (two skins: **Classic** = the original
look, untouched; **Signal** = brutal glass, red on graphite by default, every
token adjustable) and asked for the apps + platform. Locked decisions and the
full plan: **`docs/PLATFORM-PLAN.md`** (repo layout, the appearance object,
parity table, milestones). What exists on the branch:

- **`packages/tokens/`** — the single source of truth for both skins:
  colour maths with auto-contrast (any accent on any Signal base keeps text ≥
  4.5:1 — tested), `resolveClassicPalette` (byte-identical to the old
  `palette.js` — tested against it), `resolveSignalPalette`,
  `normalizeAppearance`, the Ask-Pal keyword interpreters, Home day rules,
  Pal options. `node packages/tokens/scripts/sync.js` regenerates every copy
  (Expo, platform, backend vendor dir, Dart `tokens.g.dart` + fixtures, Swift
  widget fallbacks, CSS); CI runs `--check`. **Never edit a generated copy.**
- **Backend:** `GET/PUT /api/me/appearance` (BRAIN §4), `User.appearance`
  (Mixed), last write wins by `updatedAt`, stale → 409 + stored copy.
  `npm test` (node:test + mongodb-memory-server).
- **Expo app (leads, v0.2.0):** `ThemeProvider` now resolves either skin into
  the SAME token names, plus `palette.fonts.<role>` (a codemod replaced ~300
  hard-coded font names), `palette.shape`, motion/field/texture.
  `ThemeOverride` previews a proposed look in a subtree. Signal primitives:
  hard-shadow panels, press-into-shadow buttons, mono labels, expo-gl
  Chladni/interference field (Home only) + grid/grain/scanline backdrop.
  New screens: **Make it yours** (`StudioScreen` — skin, vibes, fine-tune,
  any-hue slider, Ask Pal preview→apply→undo, saved looks), **Build your
  Pal**, **Arrange home** (order/size/hide + weekday/weekend rules). Home
  renders the user's tile layout; Signal Home follows the S-Today board
  (state dial, countdown anchor, focus scope, M tiles pair up). The Reader's
  expanded player has a Signal version after the S-Reader board. Appearance
  syncs through `services/appearanceSync.js` (local-first, debounced PUT,
  409 → adopt). Library/Notes/Toolbox/etc. follow the skin's colours and
  fonts but keep their Classic layouts (a Signal pass for them is M2).
- **Flutter app (`neuropal-flutter/`, follows; "NeuroPal F",
  `io.neuropal.flutter`):** reader-first M1 — library with ingest status,
  reader with TTS highlight and a Signal player, Ask with sources, both
  skins, settings (backend address with Tailscale → LAN fallback, demo
  library opt-in). Dart port of the palette logic, parity-tested against the
  JS fixtures. Speed calibration constant: `kEngineNormalWpm` in
  `lib/reader/wpm.dart` (check on the S24). Screenshot harness:
  `flutter test tool/screenshots_test.dart` (not run by CI). README has the
  rest, including known limits.
- **Web platform (`neuropal-platform/`):** Next.js 16 static export —
  landing (WebGL hero), `/learn` + the two-source interference lesson,
  `/appearance` (Make it yours on the web, saves to the server), `/sign-in`,
  `/privacy`. Typed token layer: `src/lib/appearance.ts`. QA: `npm run
  serve`, then `npm run qa:shots` / `qa:axe` (needs `npx playwright install
  chromium` once).
- **iOS extras:** WidgetKit extension in `neuropal-flutter/ios/NeuroPalWidget/`
  (check-in widget with App Intents, resume-reading widget, focus Live
  Activity), wired by `ios/scripts/add_widget_target.rb`; the app side is
  `ios/Runner/NeuroPalIOSExtras.swift` + `lib/platform/ios_extras.dart`.
  Verified only by the macOS CI build — never run on a device yet.
- **CI:** `.github/workflows/ci.yml` (tokens, backend, Expo bundles, Flutter
  analyze/test, platform lint/typecheck/build), `android.yml` (both APKs as
  artifacts; manual or on main), `ios.yml` (simulator builds of both apps on
  macOS runners).

**Builds done in the cloud workspace:** Android SDK 36 + JDK 17 + Gradle with
a Maven Central mirror (`~/.gradle/init.d/maven-mirror.gradle` — Central
rate-limits to 429). The box has 8 GB and no swap: **never run two Gradle
builds at once** (they were serialised with `flock` on a shared lock file).
APKs are signed with the React Native template's debug key (same as the
Mini's local builds), so they update the installed app in place.

**Waiting on the owner (v2):**
1. Install and try both APKs on the S24 (Expo 0.2.0 updates the current
   app in place; "NeuroPal F" installs alongside).
2. **AI provider vs "your data never trains models".** The default provider
   is the free Gemini tier, whose terms let Google use submitted content to
   improve its products (paid use doesn't). Choose: paid Gemini, Claude, or
   Ollama-only.
3. iOS on a device needs an Apple developer team and the App Group
   `group.io.neuropal.flutter` registered; CI only builds for the simulator.

**Review fixes already in (from an independent review of the v2 diff):**
prototype-safe normalisers, clock-safe last-write-wins on the server,
never-dropped sync edits, Classic Home restored pixel-for-pixel until
arranged, live reduce-motion, scoped studio undo, screen-reader-settable
sliders, error boundary with "Reset the look". Each has a test or a check.

**Traps found in v2 (don't re-derive):**
- RN-web: SVG `<Pattern id>`s are document-global — two mounted backdrops
  sharing an id made the visible one blank. Ids now come from `useId()`.
- RN-web: `Image resizeMode="repeat"` draws the tile once; the grain is a CSS
  background on web (`expo-asset` resolves its URL).
- Pal talk templates take a complete phrase (`{task}` = "the CPI notes" or a
  quoted task title) — they no longer contain "the".
- The RN Gradle plugin does not support `-x createBundleReleaseJsAndAssets`
  (it fails resolving generated res) — native-only warm-up builds don't work.
- Reanimated 4's `useReducedMotion()` is fixed at start-up; ThemeProvider
  follows `AccessibilityInfo`'s `reduceMotionChanged` instead.
- The community slider's `onSlidingComplete` never fires for TalkBack or
  VoiceOver adjustments — never commit a value only there.
- A single-branch clone only fetches `main`; add a fetch refspec for a
  feature branch or `git status` claims it was never pushed.

## 1. Where things stand RIGHT NOW (pre-v2 — still true for `main`)

`main` HEAD is **`884e395`** (owner's travel scripts), on top of my
**`4e0bcb0`** (docs/readme) — clean, pushed, `Ryx007/NeuroPal` (PUBLIC repo).
This handoff commit lands on top of `884e395`.
All three backend services are up on the Mac Mini under pm2 and have been for
~10h: `neuropal-api` :4000, `neuropal-web` :8081, `neuropal-mathserve` :8077.
`/healthz?deps=1` is green (mongo/qdrant/ollama/extractor all up).

**The single most recent architectural change** (commits `4cf6d07`,
`cb13821`, `0c8e0c6`): the web front-end and the API now run as **separate
processes on separate ports**, where before one Express process on :4000
served both.

- `neuropal-backend/src/server.js` → the API, port 4000, **API-only** now
  (`GET /` returns `{"error":"Not found"}`).
- `neuropal-backend/src/webServer.js` → **new file**, the web app, port 8081.
  Serves `WEB_DIST` and **proxies** `/api`, `/healthz`, `/katex`, `/apk` to
  the API. Hand-rolled on `node:http`, no new dependency.

## 2. THE EXACT NEXT STEP

**DONE — the queue is clear. Pick from PROJECT-STATUS "Next actions".**

The equation-height fix that was pending here is **landed and verified**
(`d1d3088`). My earlier doubt — whether it changed the *measurement source*
or only the clamp — is resolved: it does both. `measure()` now reads
`el.getBoundingClientRect().height` on `#eq`, and `ResizeObserver` +
`fonts.ready` catch layout that arrives after the old fixed 60ms/300ms
timeouts. Evidence: all 19 equation frames in the nougat slice report real
heights (110,112,103,…,**188**,…) with **zero** left at the 64px default; the
188px one was previously squeezed into 64. Stable across three samples 5s
apart, so no ratcheting. The local worktree
`.claude/worktrees/fervent-sammet-be592e` still holds the same edits
uncommitted and can now be deleted.

**Remaining work is owner-gated** (see §6): S24 on-device acceptance, the
DHCP reservation, collaborator access. Nothing is blocked on code.

⚠️ **The native half is unverified.** `mathViewHtml.js` is shared, but
`MathView.js`'s WebView `postMessage` host was only verified by reading. If
equations look wrong on the S24, check that path first.

## 3. ROOT CAUSES ALREADY ESTABLISHED — do not re-derive

**(a) Backend was "unreachable" 3× — it was never the server.** The Mini was
healthy every time. Cause: the S24's baked API addresses died. DHCP drifted
the Mini's LAN IP (`192.168.3.169 → .229`; it's `.229` again right now, so
the reservation still isn't set — see §6) and Tailscale was toggled off on
the phone, killing MagicDNS. Fixed permanently by making the backend address
**runtime-editable in Settings** (AsyncStorage, no rebuild) plus an offline
banner. Commit `c002f5e`.

**(b) EPUB equations vanished / "un<em>likely</em>" → "un likely".** Publisher
math EPUBs (verified on Griffiths) embed equations as `<img class="math_">`
JPEGs with a useless `alt="image"`; the old `htmlToText()` stripped every tag
to a space. Fixed two ways: `htmlToText` now strips inline tags with NO space
and turns `<img>`/`<math>` into `[equation]`/`[alt]` placeholder tokens (the
`class*=math` is the signal, not the alt); AND EPUBs get a whole second
representation — served as the publisher's own XHTML in a WebView so
equations render exactly as typeset. Commit `410924a`.

**(c) The relative-path / any-domain property.** On production web the client
resolves the API with a **bare relative path `''`** (`ApiLink.js` candidate
list), so the bundle contains **zero backend URLs** and deploys at any
domain. This only works because everything the page needs is same-origin —
which is why the port split had to **proxy** rather than let the browser call
:4000 cross-origin. Three things resolve relative URLs against the page origin
and never see an axios baseURL, so plain CORS would silently break them:
KaTeX (`mathViewHtml.js` injects `${apiHost}/katex/...` into a sandboxed
srcdoc iframe), the EPUB reader's injected `<base href="/api/documents/:id/
epub/<dir>/">`, and `/healthz` (fetched directly by `ConnectionStatus.jsx`).
Commits `4cf6d07`, `cb13821`.

**(d) Three real proxy bugs, found by adversarial review, all fixed &
reproduced first-hand on Node 20.20:**
1. No `error` listener on `upstreamRes` → an API death mid-response left the
   browser **hanging forever** (measured 3s+ → now aborts in 155ms).
2. Only `req.on('aborted')` was handled, which never fires when the client
   disconnects during the RESPONSE → every abandoned download leaked a socket
   and left the API generating a body nobody reads. Fixed with
   `res.on('close')` (measured: upstream saw abort `0 → 1`).
3. Forwarding a client `Trailer` header onto a **bodyless** request throws an
   uncatchable `ERR_HTTP_TRAILER_INVALID` that **kills the process**. One
   unauthenticated line:
   `printf 'GET /api/documents HTTP/1.1\r\nHost: h\r\nTrailer: X\r\n\r\n' | nc host 8081`
   Fixed by stripping hop-by-hop headers (RFC 7230 §6.1) both directions.
   **NOTE for the record:** I first (wrongly) called this a false positive
   because it wouldn't reproduce — my tests all sent a request BODY, and the
   crash only fires bodyless. The reviewer's netcat vector against a replica
   of the pre-strip code produced the crash. Corrected in `0c8e0c6`. Lesson:
   a curl-shaped test cannot exercise the bodyless path.

**(e) MongoDB "not running" after a reboot.** Root cause was Docker Desktop's
own `AutoStart` preference being `false` (despite being a login item), so its
`restart: unless-stopped` containers never came back. Set `AutoStart: true`
in `~/Library/Group Containers/group.com.docker/settings-store.json`, verified
it survives a Docker Desktop restart. **NOT verified across a full Mac reboot**
(didn't want to reboot the always-on host without asking).

**(f) Tall web equations clip.** `mathViewHtml.js`'s injected `report()`
measures `document.body.scrollHeight`, which returns **0** inside the
`sandbox="allow-scripts"` srcdoc iframe. Both hosts guard with
`if (h && ...)`, so 0 is rejected and the frame keeps its 64px default —
single-line math fits, taller math clips. Reproduced identically with a
relative AND an absolute KaTeX host, so it is NOT related to the port split /
relative-path work — it predates all of it. This is what task `task_a3165175`
(the §2 pending patch) targets.

## 4. HOW TO VERIFY THINGS IN THE BROWSER (the setup is non-obvious)

- Production web (what the split serves): open **`http://localhost:8081`**.
  Settings → "Backend connection" should read **"Connected · this server"** —
  that literal string only renders when `apiHost === ''`, so it's the proof
  the relative candidate won the probe (not a coincidence of same-port).
- Dev server: **`npx expo start --web --port 8082`** — port **8082**, because
  8081 now belongs to `neuropal-web` and 8081 is also Metro's default. Dev
  does NOT proxy, so ApiLink deliberately guesses `<hostname>:4000` there.
- The Griffiths EPUB (doc id `6a527db9a38f10b69b84e459`) is the math test
  fixture: §1.1 has 20 equation JPEGs. Filter Library → EPUB.
- The math iframes are `sandbox="allow-scripts"` (opaque origin) so you CANNOT
  read their `contentDocument` from the parent. To check KaTeX rendered,
  either screenshot, or measure the frame's parent height (64px = the default,
  i.e. nothing was reported; anything else means it measured).
- ⚠️ **THE BIG MEASUREMENT TRAP — this cost me three wrong conclusions.**
  The Browser pane **skips iframe layout while the pane is hidden**:
  `window.innerWidth/innerHeight` inside the iframe come back `0x0` and every
  `getBoundingClientRect()` is 0. That is **indistinguishable from the bug**
  — I twice concluded "the fix doesn't work" from all-64px readings that were
  purely an artifact, and once got a *non-deterministic* result where the
  same byte-identical test iframe reported `300x64` in one run and `0x0` in
  the next. A screenshot **forces a paint**; take one, then measure
  immediately, and the real heights appear. Same caveat for a screenshot that
  shows equations as blank gaps — that is paint timing, not a regression;
  take a second one.
- Browser quirks that cost time: RN-web `Pressable` press events lack
  `locationX` (fall back to `offsetX`); a page reload can drop the preview
  server (re-`preview_start`); `expo export` / prebuild running alongside
  Metro has killed the dev server mid-verify.

## 5. DECISIONS MADE — and explicitly REJECTED

- **Proxy, NOT cross-origin CORS**, for the port split. Rejected direct CORS
  because it would force a baked API URL back into the bundle, undoing the
  any-domain property (c), and would silently break KaTeX/EPUB/healthz. If a
  future session is tempted to "simplify" to CORS, that's why it's wrong.
- **Hand-rolled `node:http` proxy, NOT a dependency** (http-proxy-middleware
  etc.). None was installed; the proxy is ~40 lines; no new supply-chain.
- **No upstream timeout in the proxy** — deliberate. Long ingest uploads are
  legitimate; the client sets its own axios timeouts; and bug-(d)(2)'s fix
  reaps the upstream when the client gives up. Don't add one reflexively.
- **`SERVE_WEB_FROM_API=true`** kept as an escape hatch: the API can still
  serve the bundle at `/` (old single-process mode) if ever wanted. Default
  off.
- **The 8 legacy books stay deleted** (owner: "build the library properly
  moving forward"). They were soft-deleted by the owner on Jul 11, recoverable
  30 days. Don't "helpfully" restore them.
- **Nougat-only for math extraction** (owner §12 decision), MagicDNS primary
  for sync, 3D only where physics needs it.
- **`neuropal2-api`** (a foreign Codex checkout on :4100 sharing the Mongo)
  was stopped and removed from pm2; re-enable steps are in BRAIN §3.
- **Two-pass ingest is AUTO** (owner decision): fast pdf-parse pass reaches
  `ready` in seconds, a background Nougat pass upgrades math later and never
  degrades what's already there.

## 6. WAITING ON THE OWNER

1. **Router DHCP reservation** — the Mini is on `.229` again right now, so
   this still isn't done. Reserve it: router `192.168.3.1` → Address
   Reservation → MAC `1c:f6:4c:3d:e9:3b` → `192.168.3.169`. Until then any
   APK with a baked LAN fallback keeps dying on IP drift (the Settings
   override is the workaround).
2. **S24 on-device acceptance of Issues 0/1/2** — everything is
   browser-verified but these need the physical phone: EPUB reader (instant
   open, exact equations, karaoke, tap-to-seek), the unified notes canvas
   **S-Pen `pointerType` routing** (pen always inks in Type mode, finger
   scrolls in Pen mode, pressure→width — the ONE path I could not verify from
   here), and share-sheet exports. Install the current APK from
   `http://<mini>:4000/apk`.
3. **Collaborator write access** — the repo is public so a friend can already
   clone/fork. To let them PUSH, owner adds them at
   `github.com/Ryx007/NeuroPal/settings/access` (or give me their GitHub
   username; my `gh` CLI has `repo` scope).

## 7. RECENTLY TOUCHED FILES & WHY

- `neuropal-backend/src/webServer.js` — **NEW.** The :8081 front-end server +
  proxy. Read its header comment; it explains the proxy rationale inline.
- `neuropal-backend/src/app.js` — the web static mount is now gated behind
  `SERVE_WEB_FROM_API === 'true'` (was unconditional).
- `neuropal-backend/.env` (gitignored) + `.env.example` — added `WEB_PORT`,
  `API_PROXY_TARGET`, `SERVE_WEB_FROM_API`.
- `neuropal-expo-app/src/store/ApiLink.js` — production-web candidate is now
  `''` (relative); dev-web is `<hostname>:4000`. `labelForCandidate()` renders
  `''` as "this server". Everything is gated on `candidates.length`, never on
  a host string's truthiness (`''` is a VALID host, not "unconfigured").
- `neuropal-expo-app/src/components/{ConnectionStatus,OfflineBanner}.jsx` —
  use `labelForCandidate` so the same-origin candidate shows a label, not a
  blank row.
- `neuropal-expo-app/src/services/network.js` — `describeHost()` distinguishes
  "" (same-origin, "this server") from truly unset.
- `.claude/launch.json` — dev server moved to **8082**; added a `neuropal-web`
  attach entry for 8081.
- `README.md`, `docs/BRAIN.md`, `docs/PROJECT-STATUS.md` — de-staled for the
  split and for collaborators (README had pointed at a dead
  `ApiLink.js#API_HOST` symbol and a retired `local.ryx007.science` nginx).
- `scripts/pack-for-travel.sh` / `unpack-on-laptop.sh` — **owner-authored**
  (commit `884e395`), NOT mine. They move the Mini's data (Mongo dump, Qdrant
  snapshots, `storage/`, `.env`) to a MacBook Air for travel and bring up all
  three services there. `unpack` already knows about `neuropal-web` :8081. If
  you touch serving/ports, keep these in sync.

## 8. KNOWN-BROKEN / OPEN

- ~~Equation height~~ — **FIXED and verified** in `d1d3088` (see §2). Native
  (S24 WebView) half still unverified.
- **Full-reboot persistence of Docker AutoStart (§3e)** — set and
  restart-verified, but not reboot-verified.
- Nothing else is known-broken. The port split, EPUB reader, notes canvas,
  relative-path resolution, and equation sizing are all browser-verified
  end-to-end.

## 9. HOUSE RULES (so you match the codebase)

Barrel model imports; `asyncHandler`; `{error}` response envelope; soft-delete
via `deletedAt`; `readerSlice` owns reader state; TidalPlayer is the ONE
player; WCAG 2.1 AA on touched code; LOCAL_MODE single-user (WebView GETs need
no auth header). `.env` is gitignored — never commit it (history was scanned,
it's clean). Commits end with a `Co-Authored-By: Claude ...` trailer. Verify
in the browser before claiming something works; report failures with the
actual output. The owner runs the pm2/sudo/reboot steps — surface them, don't
assume them.
