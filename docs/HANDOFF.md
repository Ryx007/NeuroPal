# NeuroPal — Session Handoff

> **Who this is for:** a fresh Claude Code session (or human) picking up with
> **zero chat history**. It captures what's in-flight, what was decided and
> why, and the traps — so nothing already-established gets re-derived.
>
> Read order: this file → `docs/BRAIN.md` (how the system actually works) →
> `docs/PROJECT-STATUS.md` (phase table + Next actions). `BUILD-BRIEF.md` is
> the original spec but predates most of what's below.
>
> _Written 2026-08-04 after the port-split + collaborator-prep session._
> _Author: Claude (Opus/Sonnet/Fable across the session), owner "Ryx"._

---

## 1. Where things stand RIGHT NOW

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
