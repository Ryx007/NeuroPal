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
