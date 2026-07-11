# NeuroPal — Project Status

> **Purpose of this file:** make any fresh working session (human or Claude
> Code, on any machine) fully productive without needing prior chat history.
> Read this + `docs/BUILD-BRIEF.md`, then continue from "Next actions".
>
> **Keep it updated:** every working session that changes phase state should
> amend this file in the same commit.

_Last updated: 2026-07-08 (Mac Mini session, continued — reader overhaul
(original-pages view, clean extraction, chapters, tap-to-seek), library
rename/delete, OCR for scanned books, Drive library preload, frosted-glass
panels, theme-wide accents, pomodoro + reminders (expo-notifications),
flashcards (schema-structured), S-pen handwritten notes tab, physics
visualizer tab (5 offline canvas templates incl. Bloch sphere). App is now
7 tabs. See `docs/BRAIN.md`.)_

---

## What this project is right now

Single-user, local-first personal study tool (pivot per `docs/BUILD-BRIEF.md`).
Owner is preparing for a physics PhD oral exam. Only **Module 0** matters:
**upload document → karaoke TTS read-back → RAG Q&A grounded in the document.**

Monorepo layout:

```
NeuroPal/
├── neuropal-backend/     Node/Express + Mongo + Qdrant + Ollama + provider-agnostic AI
├── neuropal-expo-app/    Expo SDK 55 app (Android/iOS/web) — 7 screens, Redux
├── docs/                 BUILD-BRIEF.md (spec) · PROJECT-STATUS.md (this file)
└── _archive/             design refs, wireframes, old prototypes
```

Topology: backend on the **Mac Mini M4** (`:4000` + Docker Mongo/Qdrant +
Ollama), all other devices are LAN clients. See
`neuropal-backend/docs/MAC-MINI-SETUP.md` for the full bring-up.

## Phase state (per BUILD-BRIEF §4)

| Phase | State | Notes |
|---|---|---|
| **0 — Local infra** | **✅ ACCEPTED on the Mini (2026-07-07)** | Docker Mongo 8 + Qdrant up (named volumes), Ollama serving `nomic-embed-text` + `qwen2.5:7b`. All §6 checks green: Qdrant collections, Mongo ping `{ok:1}`, Ollama tags, `/healthz`. |
| **1 — Backend + AI layer** | **✅ ACCEPTED on the Mini (2026-07-07)** | Real PDF (arXiv 1401.4118, Lvovsky "Squeezed light", 21pp/16k words) → `ready` in ~10s → `/text` returns full text → `/query` grounded `{answer, citations[{chunkId,page,excerpt}]}` via **gemini-2.5-flash** (mode:rag, 8 chunks) AND via **ollama qwen2.5:7b** (correct answer; citations empty — tolerant-parse contract held). Added missing `GET /api/auth/me` (frontend boot probe 404'd without it). |
| **2 — Native frontend (S24)** | **WIRED + VERIFIED on Expo web — S24 acceptance via the APK** | Mock opt-in, visible errors, real upload/polling/query (2026-07-07). 2026-07-08: TTS rebuilt on `services/tts.js` (chunked utterances — Android caps ~4k chars — with `onBoundary`-driven karaoke + estimator fallback), big-doc windowing (Parts of 40 paragraphs, view follows the voice), long-press → `/explain`. |
| **3 — Web target (Macs)** | **WORKING** | Bundles + full Module 0 loop verified in browser (login → library → 216k-word book in parts → karaoke → cited Q&A → study sheet). Web upload fixed (real `File` in FormData). TTS boundaries via expo-speech web. |
| **4 — Exam-prep endpoints** | **DONE + UI** | `routes/study.js`: summarize/quiz/cheatsheet/explain on `aiProvider` with even chunk-sampling (budget: gemini 120k chars, ollama 8k). Gemini now schema-constrained JSON + tolerantParse escape-repair/salvage (LaTeX answers broke the old parser). `StudySheet` modal in the Reader (school icon). Verified on the QFT notes + Moby Dick. |
| **5 — APK + accessibility** | **APK PIPELINE UP (local Gradle)** | `expo prebuild` + `gradlew assembleRelease` on the Mini. Gotchas solved: JDK17 toolchain (user-level Temurin + gradle.properties), `expo-build-properties` for cleartext HTTP, `babel-preset-expo@55` pin (57 broke Hermes). See BRAIN §6 runbook. Accessibility sweep still pending. |
| **Extras (2026-07-08)** | **DONE** | Real EPUB extractor (adm-zip, OPF spine). Ingest `progress` 0→1 on Document (books show live % while embedding). **Inbox drop-folder**: `~/NeuroPal-Inbox` watched (chokidar) — drop a book, it auto-ingests (verified with a 216k-word EPUB). |
| **Redesign D1–D12 + feature battery (2026-07-08)** | **DONE (browser-verified)** | D1 drawer nav, D2 Settings screen, D5 glass toasts, D7 Toolbox, D8 Play-Books reader (top bar/TOC/display sheet), D9 KaTeX (served from `/katex`), D10 Tidal player (WPM→950), D11 collapsible arXiv+Scholar search in Library, D12 Qiskit-grade Bloch sphere (drag state, presets, dotted arcs, live ⟨σ⟩) + AI viz via `POST /api/viz/spec`. Annotations/highlights/bookmarks (backend-persisted, word-anchored), text selection (long-press native / menu-armed web), go-to-page, chapter TOC jump, md/docx/pptx/djvu/txt import, markdown edit-on-the-fly (`/raw`), notes color wheel + hex, note export PDF/PNG/SVG. Reader text de-dup via chunk `overlapChars` (all docs reingested). |
| **Feedback round (2026-07-08, phone-tested)** | **DONE (browser-verified)** | Toast now auto-hides/closes (own host, dumped the broken lib). Reader Ask opens a real Q&A sheet; study Summary/Quiz/Cheatsheet/Flashcards all work via Gemini→Ollama quota fallback. Audible-style per-chapter player (chapter scrubber, ⏮/⏭, CH n/N, TOC durations) + unicode-equation cards. Home MVD + Next Anchor editable; Toolbox Planner + To-Do; pomodoro any-value; reminders fire via in-app popup + honest scheduling + Google Calendar template link; Settings system-voice picker. |
| **Reader player A/B (2026-07-09, browser-verified)** | **DONE** | D8–D10 2-reader mockups: unified Tidal player as one component, two heights — docked mini (A, default) expands to full-screen now-playing (B), collapses back. Chapter-scoped scrubber, ◀/▶ = prev/next chapter, tone + WPM (pill→stepper), gradient cover, Ask. Backend tandem: `GET /:id/progress` + reader restores position on open and heartbeats on pause/seek/blur/background (Audible resume). 6-agent fidelity review, 14 findings applied. |
| **P1 — equations (2026-07-09, work order §2)** | **DONE (accepted on arXiv + Walls–Milburn + Griffiths slices)** | Extraction tiers: `arxiv-latex` (e-print LaTeX source; import persists `meta.arxivId`) → `nougat` (neuropal-mathserve, FastAPI + facebook/nougat-small on MPS :8077, math-density-gated) → pdf-parse/OCR; `Document.extractor` records the tier. Math-atomic chunker (never splits $…$). Reader: KaTeX display blocks + unicode-prettified inline math as single karaoke units; TTS never reads raw LaTeX — Speak-equations toggle (skip / "equation" / rule-based read-aloud) in Aa sheet + Settings. Fixed a speakFractions infinite loop (brace-less \frac12). 5-lens adversarial review: 22 verified findings, all fixed — incl. mathserve auth (shared token + Host check + path allowlist), JOBS eviction, nougat anti-repetition + MPS-OOM handling, $-pairing (currency/wrapped-inline), symlink-safe \input resolution, duplicate-import 409, and Ollama embed `num_ctx: 8192` (default 2048 500'd on dense-LaTeX chunks). |
| **P2 — chapters/TOC (2026-07-10, work order §3)** | **DONE (accepted: arXiv sections · Walls outline · Griffiths detect · client sectioning)** | Real structure per tier → `Document.toc` (LaTeX \sections, nougat headings, EPUB nav/ncx titles + spine boundaries, PDF outline via pdfjs-dist with junk-bookmark title recovery + strict running-head fallback w/ dedupe). Anchors resolved against chunk-reconstructed text (client index parity by construction). `/text` serves toc; reader builds real chapters (proportional page mapping, (cont. N) splitting, front-matter section) — synthetic Parts only when no structure exists. Verified: arXiv 7 sections → 12 named reader sections with exact boundaries; Walls 22 chapters from a junk-bookmark outline. NOTE: legacy docs ingested before P2 have no `toc` until reingested. |
| **P3 — sync (2026-07-11, work order §4)** | **DONE (browser-verified over MagicDNS; S24 needs the new APK installed)** | Diagnosis confirmed: reachability/config, not architecture. Tailscale brought up on the Mini (already authenticated) → MagicDNS `ryx-mac-mini.tail73ed8.ts.net`; the S24 was already enrolled in the tailnet. `ApiLink` now resolves among CANDIDATES (web same-origin :4000 → MagicDNS → LAN IP) via `/healthz` probe at startup / on "Check now" / after any no-response error; axios instances re-point live. Settings got a "Backend connection" group (state + active host + per-candidate latency + Check now — verified live in browser: Connected, MagicDNS active 82ms, LAN 77ms, preference order wins over latency). Web re-exported and APK rebuilt with both URLs baked; published to `/apk` (correct Android MIME type confirmed). Owner to-do: install the new APK, keep Tailscale ON on the phone, confirm Tailscale "Start on login" on the Mini, optional router DHCP reservation (MAC `1c:f6:4c:3d:e9:3b`). |
| **P4 — reader (2026-07-11, work order §5)** | **DONE (browser-verified over MagicDNS; S24 audio/swipe acceptance needs the new APK)** | §5.1 real word↔page anchors: tiers with page knowledge emit `pagesText` → `resolvePageAnchors` fingerprints pages against the canonical paragraphs → `Document.pageMap` + REAL per-chunk citation pages (null = honest "source N"); mathserve returns `markdown_pages` (12/12 pages exact on the JC slice; arXiv 19/21 via LaTeX↔pdf-text cross-match); reader `pageSync` makes view toggles/go-to-page/bookmarks resolve from one shared anchor BOTH directions (verified: text Ch2 ↔ page 10 ↔ "Detection" Ch7). §5.2 wrong-doc bug dead (docs[0] fallback removed + drawer forwards live docId + id falls back to session), playback survives navigation (Now-playing pill returns to it; Player pill re-summons chrome; ended session restarts). §5.3 ≥44px labelled nav FAB on every screen via screenLayout overlay, above the docked player on Reader, hidden under expanded player; swipe native-only. §5.4 truthful chips + title search + empty state, GET /documents `?type=&status=&q=` + ReadingSession join (readingProgress/lastReadAt — Home resume card now shows the actually-last-read book). Review: 4-lens workflow died on the monthly spend limit (agents errored, zero findings returned) → solo adversarial pass; 1 fix applied (resolvePageAnchors early-bail on fingerprint dry streak, smoke-tested). Legacy docs need reingest for pageMap/real citation pages. |
| **P5 — visualizer (2026-07-11, work order §6)** | **DONE (browser-verified over MagicDNS)** | §6.1/6.2 six new VERIFIED hand-written templates in `vizTemplates.js`: **Hong–Ou–Mandel exactly per spec** — P_coinc=½[1−V·e^{−(Δt/τc)²}], Monte-Carlo pairs with drawn bunching paths, live dip plot + Δt marker, counters reset on slider change (verified live: 0/3193 coincidences at Δt=0 V=1; curve → ½; browser screenshot) — plus single-photon double-slit (dot-by-dot buildup matching the cos²·sinc² overlay; fringe spacing readout exact), 1D wells (infinite/finite/harmonic + barrier; finite well solves the transcendental equations, E₁ and κa verified exact), Mach–Zehnder (block-an-arm kills interference), hydrogen radial/angular (general Laguerre/Legendre recurrences, n≤5). AI path (`/viz/spec`) now template-matches FIRST ('hong ou mandel dip'→hom, 'tunnelling…barrier'→wells, curl-verified) and free-generates only novel asks, labelled **AI-GENERATED — UNVERIFIED PHYSICS** (verified live with an RC-circuit generation — which also proved novel prompts still work). §6.3 `SavedSimulation` model + `/api/simulations` CRUD (validator shared with the generator; soft-delete) + Saved tab: save/reopen/delete verified in-browser for both kinds, spec persisted (AI sim: 2.8k-char drawJs round-trips). §6.4 3D WITHOUT the heavy native dep: hand-rolled canvas 3D — rotating hydrogen |ψ_nlm|² point cloud (CDF-sampled from the real density, drag-to-orbit, painter depth) + free-rotating Bloch sphere (Drag: state ↔ view toggle) — expo-gl/three not needed, zero APK risk. Review: solo adversarial pass (spend limit; all 11 embedded template scripts parse-validated, physics spot-checked in node). |
| **P6 — typed notes (2026-07-11, work order §7)** | **DONE (browser-verified over MagicDNS)** | `Note` model — BOTH kinds through one synced backend model: typed (canonical **Markdown**, inline `$…$`/`$$…$$` math) + ink (the strokes that were AsyncStorage-local-only pre-P6; client migrates them up once on open) — + `/api/notes` CRUD (asyncHandler/{error}/soft-delete; kind immutable on update) with optional `documentId`+`anchor{wordStart,wordEnd,page}`. Client: notesSlice is thunk-driven against the backend (curl-created notes appeared in the UI = sync proven); NotesScreen lists both kinds with labelled Typed/Ink entry FABs; **TypedNoteEditor** = markdown-first editor (toolbar B/I/H/list/code/$…$/$$…$$, 44px targets) with live preview that renders headings/lists/bold/italic/code AND math through the reader's own pipeline (KaTeX verified in-browser: BS unitary rendered). Deviation from the work order's tentap RECOMMENDATION, deliberately: tentap has no inline-$ math and weak web support; markdown-first hits every acceptance criterion with zero new deps. Reader ⋮ → "Typed note here" creates a doc-anchored note (verified live: wordStart 11591 + **page 19 via the P4 pageMap**, cursor paragraph quoted as seed) and opens the editor — handoff via redux `pendingOpenId`, NOT route params (params to never-unmounting drawer screens proved unreliable again; same class as the P4 wrong-doc bug). Export: `.md` (canonical) + `.txt` (markdown stripped, math verbatim) via the existing share/download machinery; ink keeps PDF/PNG/SVG. Review: solo pass (spend limit). |

## Decisions log (locked — do not re-litigate)

- **Auth = JWT + `LOCAL_MODE`** (brief §2.7). A JWT→opaque-sessions migration
  was built earlier, then reverted by a repo restore; brief locks JWT. The
  orphan `Session.js` model was deleted; `jsonwebtoken` restored to deps.
- **Gemini SDK verified 2026-07-05:** package `@google/genai` (v2.10.0),
  `new GoogleGenAI({apiKey})` → `ai.models.generateContent({model, contents,
  config})` → `response.text`. Old `@google/generative-ai` is dead (0.24.1,
  frozen). Default model `gemini-2.5-flash` (free tier).
- **Embeddings:** local Ollama `nomic-embed-text` (768-dim). Env var is
  `OLLAMA_EMBED_MODEL` (legacy `OLLAMA_MODEL` still accepted). `EMBEDDER=mock`
  exists for infra-less dev.
- **Local reasoning fallback:** `qwen2.5:7b` via Ollama `/api/chat` with
  `format:'json'` for contract reliability.
- **Git:** local `.git` was corrupt (zip-extraction damage) and was re-initialized
  on 2026-07-05. Old GitHub history preserved under branch `legacy/pre-pivot`;
  `main` now carries the clean local-first baseline.

## Gotchas that already burned time (don't repeat)

1. **Re-extracting zips over the repo** produced `file(1).js` duplicates and
   corrupted `.git`. Never unzip over the working tree again — `git pull` is
   the only sync mechanism now.
2. `.env` is git-ignored — every new machine needs it created (see
   MAC-MINI-SETUP §2) or `scp`'d from a working machine.
3. The mixed zip snapshot had `models/index.js` exporting a deleted `Session`
   model and `package.json` missing `jsonwebtoken`. Both fixed. If the server
   won't require, check the barrel first.
4. Frontend `src/services/network.js` silently serves **mock answers** when
   `EXPO_PUBLIC_API_BASE_URL` is unset — the app looks "working but
   disconnected". Fixing this is the FIRST Phase-2 task (brief §4 Phase 2).

## Next actions (in order)

0. **Redesign acceptance on the S24 Ultra** — rebuild the APK (BRAIN §6),
   then on-device: drawer swipe, reader long-press selection → highlight,
   TOC/bookmarks, go-to-page, 950 wpm playback, paper search → import,
   markdown edit, note color wheel + export share sheet, Bloch drag +
   AI-generated viz. (All of this is browser-verified; native gestures and
   share sheets are what need the phone.)
1. **Phase 2 acceptance on the S24 Ultra** — on the Mini:
   `cd ~/Documents/Gitkraken/NeuroPal/neuropal-expo-app && npx expo start`,
   scan the QR with Expo Go on the S24 (same WiFi). Then: pick a PDF →
   watch it walk to `ready` in the Library (auto-polls) → open in Reader →
   TTS + karaoke → ask a question → grounded cited answer.
   Watch specifically: DocumentPicker→FormData upload on Android and
   expo-speech behavior (sim-timer estimator drives the highlight).
2. **Phase 3** — web TTS via `speechSynthesis` + `onboundary`; browser
   upload. (`expo start --web` already bundles; Module 0 Q&A loop already
   works in the browser.)
3. **Phase 4** — summarize/quiz/cheatsheet/explain endpoints on `aiProvider`.

**Machine facts (Mini, recorded 2026-07-07):** WiFi is `en1`, currently
`192.168.3.169` — the older `.213` is stale. Give the Mini a DHCP
reservation so `EXPO_PUBLIC_API_BASE_URL` stops drifting. Repo path on the
Mini: `~/Documents/Gitkraken/NeuroPal`.

## How to continue with Claude Code on another machine

```bash
git clone https://github.com/Ryx007/NeuroPal.git && cd NeuroPal
claude   # then: "Read docs/BUILD-BRIEF.md and docs/PROJECT-STATUS.md, then continue from 'Next actions'."
```
