# NeuroPal for iPhone and iPad (native SwiftUI)

The native Apple app, built alongside the Expo and Flutter apps while the
cross-platform choice is open. Same server, same sign-in, same look (the
shared tokens in `packages/tokens`).

- **iPhone:** a tab bar (Home, Library, Pal, Settings) and Pal's floating bubble.
- **iPad:** a sidebar (TabView `.sidebarAdaptable`); Library splits into list + reader.
  Each window navigates on its own. Keyboard: ⌘1–⌘4 the tabs, ⌘⇧P Pal (menu "Go").
- **Widgets:** WidgetKit extension reading the App Group `group.io.neuropal.ios`.

## Build (a Mac with Xcode 26+)

```sh
brew install xcodegen
cd neuropal-ios
xcodegen generate            # writes NeuroPal.xcodeproj (git-ignored)
open NeuroPal.xcodeproj      # or: scripts/mac-build.sh build iphone|ipad
scripts/mac-build.sh test    # swift test on NeuroPalCore (macOS, no simulator)
scripts/mac-build.sh ui-test iphone   # every screen through the accessibility audit
scripts/mac-build.sh build-tests      # compile the app + UI tests without running them
```

The UI tests need Developer Tools access on the Mac (`DevToolsSecurity -status`;
enable once with `sudo DevToolsSecurity -enable`, or accept Xcode's prompt) — without
it the test runner never starts and `ui-test` stops after `NP_UITEST_TIMEOUT` seconds.

Screenshots without a server: `scripts/mac-build.sh shot <name> iphone|ipad -NPMock 1 -NPScreen reader`
(launch arguments in `NeuroPal/LaunchOptions.swift`: `-NPSignedOut 1` for sign-in, with
`-NPSignUp 1` / `-NPServerForm 1` (or `-NPServerForm http://192.168.1.20:4000` to show
an address typed in); `-NPOffline 1` for the offline banner; `-NPSkin signal`;
`-NPHost http://localhost:4100` for a backend running on the Mac, plus `-NPToken <jwt>`
to open signed in). Launch arguments exist only in DEBUG builds and are read from the
process arguments, never from saved settings: a Release build ignores them, and the
feature-level ones work only with `-NPMock 1`. `NP_TEXT_SIZE=accessibility-extra-large` for
Dynamic Type; `scripts/mac-build.sh reboot-sim iphone` clears a stuck system alert.

The reader's word stream (`NPCore/ReaderWords.swift`) is a port of the web and Expo
readers' tokenizers, so `lastWordIndex` means the same word on every client. Its
fixture `NPCoreTests/Fixtures/reader-words.json` is GENERATED from their code by
`scripts/make-reader-words.sh` (Node 22+); regenerate it when either tokenizer changes.

Against a real backend (public mode, invite `np-e2e`, in-memory MongoDB):
`NP_E2E_HOST=http://localhost:4100 scripts/mac-build.sh test` also runs the
real-server round trip in `NPCoreTests/RealServerTests.swift`.

CI (`.github/workflows/ios.yml`, job "Native iOS app (simulator)"): generates the
project, builds for the simulator without signing, checks the widget extension is
embedded, and runs the NeuroPalCore tests.

A device build needs an Apple Developer team (set `DEVELOPMENT_TEAM` in
`project.yml`) and the App Group registered for both bundle ids
(`io.neuropal.ios`, `io.neuropal.ios.widgets`).

## Server and session

- The address lives in UserDefaults (`np.apiHost`; default `https://api.ryx007.work`),
  changeable on the sign-in screen ("Server") and in Settings → Account. A new
  address is used only after a NeuroPal server answers there (`GET /api/auth/config`,
  else `/api/auth/me`), and saved only once it has. Plain `http://` is accepted only
  on the local network (localhost, private IPv4, link-local, `*.local`, Tailscale
  100.64.0.0/10) — `ServerAddress` in NPCore — and the form says, before it's saved,
  that such a connection isn't encrypted.
- The session is ONE Keychain record `{host, token, user, kind}`
  (`io.neuropal.ios.session`, after-first-unlock, this device only), bound to the
  server origin it came from: a token is never sent to another host, never follows a
  redirect to another origin, and goes over `http://` only to the kind of address it
  was saved for (`StoredSession.kind`: loopback, private network, link-local, `.local`,
  Tailscale). A fresh install starts signed out (Keychain items outlive an uninstall).
- What's left over `http://`: the app can't tell which network it's on, or where a
  local name really points. The same private address on another network (a café's
  192.168.1.x), or a Tailscale address with Tailscale off, gets the token in the clear,
  and anyone on that network can read it. Give the server an `https://` address
  (Tailscale HTTPS, or a reverse proxy with a certificate) to close this.
- Signing out (or the server ending the session) clears what the account left on
  the device: the reading position and Pal's chat in the App Group, downloaded
  originals and upload files in the temporary folder, cached responses (memory only),
  read-aloud; the widgets reload. The day (check-ins, anchors) stays: it's the
  person's, not the account's.
- Boot (`AppSession`): saved session → `/api/auth/me` (200 signed in, a refreshed
  token swapped in; 401 sign-in; no answer → open offline with the cached user).
  No session → 200 is a single-user server; 401 sign-in; no answer opens offline
  unless the user signed out on this device. Only a 401 on a request that carried
  the CURRENT token ends a session (a wrong password never does).

## Layout

| Path | What |
|---|---|
| `project.yml` | XcodeGen spec: the app (iOS 18+, iPhone + iPad), the widget extension, the UI tests |
| `NeuroPal/` | App target — composition root (`AppModel`), boot gate, the shell (tabs / sidebar, Pal bubble and sheet, offline banner, commands), launch options |
| `NeuroPalWidgets/` | WidgetKit extension |
| `NeuroPalUITests/` | Accessibility audit of every screen on the fixtures, and the sign-in flow |
| `Packages/NeuroPalCore` | Platform-neutral, `swift test`-able on macOS |
| ↳ `NPTokens` | Palette + appearance logic ported from `packages/tokens`; `Resources/tokens-data.json` and `Tests/…/Fixtures/cases.json` are GENERATED by `packages/tokens/scripts/sync.js` |
| ↳ `NPCore` | Server models, `NeuroPalAPI` (HTTP + mock), `AppSession` (host-bound session), `KeychainSessionStore`, `ServerAddress`, `AppNavigator`, deep links, `SharedContainer` |
| ↳ `NPDay` | Today: check-ins, anchors, minimum day, Pal's offline logic (shared with the widgets) |
| `Packages/NeuroPalUI` | SwiftUI features: `NPTheme`, `NPAccount` (sign-in, Settings → Account), `NPReader`, `NPHome`, `NPPal`, `NPSettings` |

## Rules

- The views read shared objects from the environment: `AppSession`,
  `AppNavigator`, `ThemeStore`, `DayStore` (`@Environment(AppSession.self)`),
  and the resolved look as `@Environment(\.npTheme)`.
- Cross-feature navigation goes through `AppNavigator.open(_:)`; only the
  shell turns it into navigation.
- Colours, fonts and shapes come from `NPTheme` — no literal colours in features.
- Every control: an accessibility label, ≥ 44 pt hit area, Dynamic Type
  (`theme.font(_:size:relativeTo:)`), and no motion when `theme.animates` is false.
- The calming steps never wait for the network or a sign-in.
- Never log tokens, passwords or document text.
