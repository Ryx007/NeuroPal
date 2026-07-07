# NeuroPal — Project Status

> **Purpose of this file:** make any fresh working session (human or Claude
> Code, on any machine) fully productive without needing prior chat history.
> Read this + `docs/BUILD-BRIEF.md`, then continue from "Next actions".
>
> **Keep it updated:** every working session that changes phase state should
> amend this file in the same commit.

_Last updated: 2026-07-07 (Mac Mini session — Phase 0+1 acceptance PASSED on the Mini; Phase 2 wiring done + verified on Expo web; S24 acceptance pending)_

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
| **2 — Native frontend (S24)** | **WIRED + VERIFIED on Expo web — S24 acceptance pending** | `network.js` rewritten: mock is opt-in via `EXPO_PUBLIC_USE_MOCK`, real errors surfaced (Library banner + reader chat error notes + boot toast). `ApiLink` host now from `EXPO_PUBLIC_API_BASE_URL`. Library: real fetch, upload, 2.5s ingest-status polling, focus refresh. Reader: fetches `/documents/:id/text` (backend docs have no `sections`), citations objects → `p. N` chips, karaoke perf memo on ParagraphText. Verified end-to-end in browser against `http://192.168.3.169:4000` (login gate → library → reader text → karaoke advance → grounded Q&A with citation chip). **Remaining: run on the S24 via Expo Go (see §Next actions), incl. DocumentPicker upload + expo-speech TTS on Android.** |
| **3 — Web target (Macs)** | **PARTIALLY UNBLOCKED** | `expo start --web` now bundles (react-native-pager-view platform-split via `src/components/PagerView[.web].js`). Whole Module 0 read/Q&A loop already works in the browser. Remaining: Web Speech API TTS with `onboundary` karaoke (current sim-timer estimator runs but no audio), browser file upload. |
| **4 — Exam-prep endpoints** | **NOT STARTED** | summarize / quiz / cheatsheet / explain — all call `aiProvider.generateAnswer` with different system prompts. |
| **5 — APK + accessibility** | **NOT STARTED** | Deferred until Module 0 is solid (per owner's directive). |

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
