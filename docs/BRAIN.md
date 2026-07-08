# NeuroPal — Project Brain

> **Purpose:** the single continuation document for this project. Any fresh
> session — human, Claude, or another model entirely — should be able to read
> this file and be productive in minutes, with zero chat history. It indexes
> the other docs, records everything that is NOT obvious from the code, and
> lists the exact runbooks for every recurring operation.
>
> **Maintenance rule:** whenever a session changes architecture, contracts,
> environment, or phase state, update this file and `PROJECT-STATUS.md` in
> the same commit. `git pull` is the only sync mechanism between machines.

_Last updated: 2026-07-08._

---

## 1. What this is

Single-user, local-first study tool. The owner (physics PhD student, oral
exam preparation) uploads papers/books → hears them read aloud with
word-by-word "karaoke" highlighting → asks questions answered strictly from
the document (RAG with citations) → generates summaries / quizzes /
cheatsheets. Everything runs on his own hardware except one optional cloud
call (Gemini free tier) for reasoning.

**Document authority chain** (on conflict, the earlier wins):
1. `docs/BUILD-BRIEF.md` — the spec: architecture decisions (locked, §2), phases (§4), AI provider interface (§6), TTS spec (§7), preserved patterns (§9), scope guards (§10).
2. `docs/PROJECT-STATUS.md` — current phase state + next actions.
3. This file — everything else: contracts, runbooks, gotchas, environment truth.
4. `neuropal-backend/docs/MAC-MINI-SETUP.md` — first-time backend host bring-up.

## 2. Topology & stack

```
 S24 Ultra (standalone APK — PRIMARY) ─┐
 iPhone 12 (Expo Go)                   ├─ HTTP ─► Mac Mini M4 (always-on host)
 MacBooks (Expo web in browser)        ┘           ├─ Node/Express  :4000   (pm2: neuropal-api)
                                                   ├─ Docker  MongoDB :27017 (neuropal-mongo)
                                                   ├─ Docker  Qdrant  :6333  (neuropal-qdrant)
                                                   ├─ Ollama          :11434 (nomic-embed-text, qwen2.5:7b)
                                                   └─ ~/NeuroPal-Inbox       (watched drop-folder)
                                       Gemini API (cloud, free) — default reasoning only
```

- Backend: Node 20 / Express, Mongoose (14 schemas), Qdrant JS client, provider-agnostic `aiProvider` (gemini | ollama | anthropic).
- Frontend: one Expo SDK 55 codebase (React Native 0.83, Redux Toolkit, NativeWind), three targets: Android (release APK), iOS (Expo Go), web (`expo start --web`).
- Embeddings always local (Ollama `nomic-embed-text`, 768-dim). Storage always local. TTS always on-device. Only reasoning may touch the cloud.

## 3. Machine truth (Mac Mini, verified 2026-07-08)

| Fact | Value |
|---|---|
| Repo path | `/Users/ryx/Documents/Gitkraken/NeuroPal` (older MacBook path `…/App Dev/NeuroPal` is DEAD) |
| LAN IP | **WiFi = `en1`**, currently `192.168.3.169` (`ipconfig getifaddr en1`). en0 is unplugged Ethernet. The `.213` seen in older notes is stale DHCP. **Verify before wiring any client; get a router DHCP reservation.** |
| Backend service | pm2 app `neuropal-api` (`pm2 logs neuropal-api`). `pm2 startup` (reboot persistence) NOT yet run — needs owner's sudo once. |
| Databases | `docker compose up -d` in `neuropal-backend/` (data in named volumes; only `down -v` wipes) |
| Java | Oracle JDK 21 in `/Library/Java/…` **plus Temurin JDK 17 at `~/Library/Java/JavaVirtualMachines/jdk-17.0.19+10`** — RN's Gradle toolchain requires 17; it is registered via `~/.gradle/gradle.properties` (`org.gradle.java.installations.paths=…`). Do not delete either. |
| Android SDK | `~/Library/Android/sdk` (platform 36.1, build-tools 36.1/37, NDK 30, licenses accepted). Not on PATH — builds only need `ANDROID_HOME`. |
| GitHub | `gh` CLI authenticated as Ryx007; **git pushes over HTTPS via `gh auth setup-git`** (the SSH key exists but is passphrase-locked, useless non-interactively). |
| Inbox folder | `/Users/ryx/NeuroPal-Inbox` (env `INBOX_DIR`) |
| Router / MAC | Gateway `192.168.3.1`; Mini WiFi MAC `1c:f6:4c:3d:e9:3b` (for the DHCP reservation) |
| Serving | `http://<mini>:4000/` = web app (WEB_DIST), `/apk` = Android installer (APK_PATH), `/api/*` = API — one pm2 process |

## 4. Backend API contract (all under `/api`, port 4000)

Auth: `LOCAL_MODE=true` → every request is the fixed local user
(`local@neuropal.app`); no token needed. JWT path intact for
`LOCAL_MODE=false` (`Authorization: Bearer <jwt>` or `x-session`).

| Endpoint | In | Out (essentials) |
|---|---|---|
| `GET /healthz` (no /api) | — | `{status:'ok', uptime}` |
| `GET /api/auth/me` | — | public user `{id, email, name, tweaks…}` (added 2026-07-07; client boot probe) |
| `POST /api/auth/register` / `login` | `{email,password[,name]}` | `{token, user}` |
| `POST /api/documents/upload` | multipart field `file` (+`title`,`subtitle`) | 201 Document (status `pending`; ingest is fire-and-forget) |
| `GET /api/documents` | — | Document[] (newest first, soft-deleted excluded) |
| `GET /api/documents/:id` | — | Document — poll this or the list for `status`/`progress` |
| `GET /api/documents/:id/text` | — | `{id,title,text,pageCount,wordCount,source:'chunks'\|'raw-file'}` — reader/TTS source. `raw-file` = ingest not finished; for binary types that's mojibake, so the client only fetches when status is `ready`. |
| `POST /api/documents/:id/query` | `{question[,threadId][,provider]}` | `{answer, citations:[{chunkId,page,excerpt}], verbatim[], threadId, mode:'rag'\|'fallback', model, provider, chunksUsed}` |
| `GET /api/documents/:id/chat` | `?threadId=` | ChatMessage[] (oldest first, cap 100) |
| `PATCH /api/documents/:id/progress` | `{progress,lastWordIndex,lastPage,timeSpentSec}` | ReadingSession (reading progress lives HERE, not on Document) |
| `POST /api/documents/:id/reingest` | — | wipes chunks (Mongo+Qdrant), re-runs ingest |
| `DELETE /api/documents/:id` | — | soft-delete + cascade chunks/session |
| `POST /api/documents/:id/summarize` | `{depth: quick\|intuitive\|comprehensive[,provider]}` | `{answer:<Markdown>, citations, threadId, model, provider, depth, chunksUsed}` — 409 if doc not `ready` |
| `POST /api/documents/:id/quiz` | `{count≤25, difficulty[,provider]}` | same envelope; answer = numbered Markdown questions with `**Answer:**` lines |
| `POST /api/documents/:id/cheatsheet` | `{[provider]}` | same envelope |
| `POST /api/documents/:id/explain` | `{passage, depth[,provider]}` | same envelope; retrieval-grounded on the passage |
| `POST /api/documents/:id/flashcards` | `{count≤40[,provider]}` | `{cards:[{front,back}], …}` — schema-enforced structured output (`aiProvider.generateStructured`), NOT marker parsing (models won't hold a text format) |
| `PATCH /api/documents/:id` | `{title?,subtitle?}` | rename (library long-press UI) |
| `GET /api/documents/:id/page/:n` | — | rendered PDF page JPEG (reader "Original pages" view), disk-cached |
| `GET /api/ai/provider` | — | active provider + models + localMode |

Error envelope everywhere: `{error: "<message>"}`. Mapping: validation→422,
duplicate→409, bad ObjectId→400, file too large→413, unknown→500.

**Ingest state machine** (`Document.status`): `pending → parsing → chunking →
embedding → ready | failed` (+`ingestError`). `Document.progress` (0→1) is
**ingest** progress, written throttled during embedding — big books take
minutes. Reading progress is `ReadingSession.progress` (not yet wired into
the phone UI).

**Study-endpoint context strategy:** whole-doc features can't ship a 500-page
book to a model. Chunks are sampled EVENLY across the document within a
provider budget (`gemini`/`anthropic` 120k chars, `ollama` 8k). `/explain`
retrieves top-8 by passage embedding first, falls back to the sample.

## 5. The pipelines (what happens where)

**Ingest:** upload/inbox → `services/ingestPipeline.js`: extractText
(`textExtractor.js` — pdf-parse for PDF; **scanned PDFs (<100 chars/page)
auto-OCR via `services/ocr.js`**: poppler `pdftoppm` rasterizes 200dpi
grayscale → `tesseract --psm 1` per page, concurrency 3, ~1-2s/page on the
M4, progress 0→0.4 of the bar; needs `brew install tesseract poppler`,
installed 2026-07-08; OCR runs ONLY in ingest, never in the query
fallback; real EPUB extraction via adm-zip → OPF spine walk → XHTML→text;
TXT raw; DOCX still raw-fallback w/ warning) →
`chunker.js` (paragraph-aware ~2000 chars, 200 overlap, never mid-sentence)
→ `embedder.js` embedBatch (Ollama, concurrency 4, onProgress) → Mongo
`DocumentChunk` rows first, then Qdrant points (batch 100, shared UUID
`vectorId`) → `ready`. Qdrant collection name == embedding model name
(`nomic-embed-text-v1.5`).

**Query (two-stage RAG):** embed question → Qdrant filter-search (userId +
documentId, top-8) → hydrate chunks from Mongo → `aiProvider.generateAnswer`
→ tolerant parse → citations bound `{chunk N → chunkId/page/excerpt}`. If
retrieval fails: raw-file fallback through the SAME extractor, capped 150k
chars, `mode:'fallback'`.

**aiProvider JSON reliability** (hard-won, don't regress):
- Gemini: `responseSchema`-constrained (`GEMINI_RESPONSE_SCHEMA`) — without it, long answers eventually contain an unescaped quote and the whole reply collapses to tier-4 raw text.
- Ollama: `format:'json'` (grammar-constrained).
- tolerantParse tiers: strict → first `{…}` block → **escape-repair** (`\phi` → `\\phi`; LaTeX kills naive parsing) → **answer-salvage** (regex the answer value out even from invalid JSON) → raw-text-as-answer.

**Inbox watcher** (`services/inboxWatcher.js`, LOCAL_MODE only): chokidar on
`INBOX_DIR` (`awaitWriteFinish` 2s so half-copied books wait; boot-time scan
catches files dropped while the server was down). Drop a
`.pdf/.epub/.txt/.docx` → file is MOVED into
`storage/documents/<userId>/<unique>-<name>` → Document created → normal
ingest. The library's poll shows it appear on its own.

**Uploads from the app** go through `services/network.js#uploadDocument`,
NOT axios: on native, RN's FormData/XHR multipart dies with an opaque
"Network Error" before anything hits the wire — `expo-file-system`(/legacy)
`uploadAsync` streams the picked file through the OS uploader instead. Web
uses the picker's real `File` in a real FormData. Do not resurrect an
axios-based upload path.

**Frontend data flow:** `store/ApiLink.js` derives everything from
`EXPO_PUBLIC_API_BASE_URL` (bundle-time inlined; restart bundler after
changing). `services/network.js` is the reader/study client (opt-in mock via
`EXPO_PUBLIC_USE_MOCK=true`, NEVER silent fallback — unreachable backend must
be a visible error: Library banner + Retry, reader error notes, boot toast).
**There is NO login screen** (removed 2026-07-08 per owner): the navigator
renders onboarding/tabs unconditionally; the auth bootstrap only hydrates
name/tweaks in the background. `src/screens/LoginScreen.jsx` still exists
but is never routed to — re-gate it only for a future LOCAL_MODE=false build.
`store/ApiRequest.js` is the screens' hook (toasts, 401 logout, `rethrow`
opt-in). Reader: backend docs carry no `sections` → `fetchReaderDocument`
pulls `/text` **only once status is `ready`** (mojibake guard), splits into
paragraphs (≤180 words each) grouped into **Parts of 40 paragraphs**; one
Part rendered at a time (a 216k-word book = 112 parts, ~250 text nodes
instead of ~216k); view auto-follows the voice across parts.

**TTS (`services/tts.js`):** expo-speech on ALL platforms. Words are spoken
in ~3000-char chunked utterances (Android hard-caps ~4k/utterance — a book
as one string would silently fail) chained by `onDone`. Highlight driver:
`onBoundary` charIndex → per-chunk offset table → global word index (exact
sync where the engine emits boundaries: iOS/web/most Android); a WPM timer
estimator paces platforms without boundaries and is permanently disabled on
the first real boundary event; every chunk start resyncs the estimator.

## 6. Runbooks

### Backend day-2
```bash
pm2 logs neuropal-api            # backend logs (inbox watcher logs here too)
pm2 restart neuropal-api --update-env   # after code OR .env changes
docker compose ps                # in neuropal-backend/
git pull && npm install && pm2 restart neuropal-api   # deploy update
```

### Add books
1. **Drop-folder (Mini):** drag PDFs/EPUBs into `~/NeuroPal-Inbox`. Folder empties as they're taken in; watch the Library.
2. **Phone:** Library → + → pick file (works in APK/Expo Go).
3. **Web:** same + button in the browser (real File upload path).
4. **curl:** `curl -X POST localhost:4000/api/documents/upload -F "file=@book.pdf"`.

### Build the Android APK (local, no accounts)
```bash
cd neuropal-expo-app
npx expo prebuild --platform android --clean       # regenerates android/ (gitignored)
cd android && export JAVA_HOME=$(/usr/libexec/java_home) ANDROID_HOME=~/Library/Android/sdk
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
# Publish to the phone: just replace the file the backend serves —
cp app/build/outputs/apk/release/app-release.apk ~/NeuroPal-APK/neuropal.apk
# On the phone's browser:  http://192.168.3.169:4000/apk  → install
# (the backend's GET /apk sets the Android package MIME type — a generic
#  static server labels APKs as zip and the phone saves "neuropal.apk.zip")
```

### Publish the web app (any browser on the LAN)
```bash
cd neuropal-expo-app && npx expo export -p web        # → dist/
pm2 restart neuropal-api                               # backend serves it
# App URL from ANY device on the WiFi:  http://192.168.3.169:4000/
```
The backend serves `WEB_DIST` (env → the dist/ folder) at `/` with an SPA
fallback, and `APK_PATH` at `/apk`. Re-export + restart after frontend
changes you want in browsers; rebuild the APK for the phone separately.
Hard-won build facts:
- RN Gradle wants a **JDK 17 toolchain**; JDK 21 alone makes Gradle try to download one via a broken foojay resolver (`IBM_SEMERU` crash). Fixed by the user-level Temurin 17 + `~/.gradle/gradle.properties` (see §3).
- `usesCleartextTraffic` MUST come from the `expo-build-properties` plugin in `app.json` (a bare `android.usesCleartextTraffic` key is silently ignored) — without it the release APK cannot talk to `http://…` at all and every screen shows network errors.
- `babel-preset-expo` must be a direct devDependency for release bundling.
- The APK inlines `EXPO_PUBLIC_API_BASE_URL` at build time. **If the Mini's IP changes, rebuild the APK** (or finally do the DHCP reservation).
- Release signs with the debug keystore (fine for personal sideloading; EAS or a real keystore only if ever distributing).

### Web / development
```bash
cd neuropal-expo-app && npx expo start --web      # web app on :8081
npx expo start                                     # + QR for Expo Go phones
```

### Acceptance loops (re-run after risky changes)
- Backend: MAC-MINI-SETUP §6–§7 (curl: infra checks; upload→ready→text→query on both providers).
- Big-book: drop an EPUB in the inbox → ready → open in Reader → parts navigate → play → ask.
- Study: summary/quiz/cheatsheet buttons on a ready doc.

## 7. Known limitations / deliberate cuts (as of 2026-07-08)

- **DOCX** parsing is still raw-fallback (mammoth integration pending). PDF (incl. scanned via OCR)/EPUB/TXT are real.
- **OCR is English-only for now** (`-l eng`); other languages need `brew install tesseract-lang` + a language option. Equations OCR imperfectly (φ→¢ etc.) — prose is what TTS/Q&A consume.
- **EPUB page numbers** are estimates (chars/3000) — citations on EPUBs cite estimated "pages".
- **DocCard "% completed"** shows `Document.progress` = INGEST progress (100% once ready). Reading progress (ReadingSession + PATCH /progress) is not yet wired into the UI.
- **Web TTS boundaries**: expo-speech web emits boundary events in Chrome/Safari with local voices; headless/exotic browsers fall back to the estimator. Fine in practice.
- **Ollama study context** is capped at 8k chars — whole-book summaries via the offline model are shallow by design (Gemini is the default for study features).
- **WPM slider changes don't re-pace an in-flight playback** (pause → play applies them). Pre-existing; low priority.
- **Reader margin notes are session-scoped** (Redux only) and keyed to the current paragraph split — they don't survive an app restart. Chat history IS persisted server-side (`GET /documents/:id/chat`), just not re-hydrated into the reader yet.
- **Android share-target** ("Share → NeuroPal") deliberately deferred until the first APK is proven.
- **Phone-side watched folder** ruled out pre-exam (background restrictions; low value vs picker).
- **Modules 1–9** (Anchors, DailyLog, Companion, Visualizer, …): schemas exist, routes deliberately absent (brief §10). The old kickoff docs in `~/Downloads/NeuroPal_Instructions/` mention a Module 9 visualizer plan — treat as FUTURE, not current scope.
- Home/Anchors/Profile screens still run on mock data — only Module 0 surfaces (Library/Reader) are wired to the backend.

## 8. Development conventions

- Preserved patterns are listed in BUILD-BRIEF §9 (asyncHandler, soft-delete filters, barrel models, full-User auth loads, status state machine, vectorId pairing, relative storage paths, error mapping, two-stage RAG). Violating them is a review-blocking bug.
- Mock data is opt-in only (`EXPO_PUBLIC_USE_MOCK=true` — bundled samples, zero network, logs straight in as a fake user). Real mode surfaces every failure visibly.
- Every substantive diff gets an adversarial multi-lens review before commit (this project's two review rounds each caught real bugs: citation misattribution, stale-response races, ingest-cache mojibake, JSON-contract collapse on LaTeX).
- Commit style: `feat:`/`fix:`/`chore:` + a body that tells the next session what changed and why. Update PROJECT-STATUS (and this file when contracts/environment change) in the same commit. Push to `origin main` — other machines sync only via git.
- `.env` files are git-ignored and machine-local. Templates: `neuropal-backend/.env.example`, `neuropal-expo-app/.env.example`.

## 9. Continuation prompt (for any model)

> Read `docs/BRAIN.md`, `docs/PROJECT-STATUS.md`, and `docs/BUILD-BRIEF.md`
> in the NeuroPal repo, then continue from PROJECT-STATUS "Next actions".
> Respect BUILD-BRIEF §2 (locked decisions), §9 (preserved patterns), §10
> (scope guards). Verify the Mac Mini's LAN IP before wiring clients
> (BRAIN §3). Run the acceptance loops in BRAIN §6 after risky changes.
