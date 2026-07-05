# NeuroPal — Project Status

> **Purpose of this file:** make any fresh working session (human or Claude
> Code, on any machine) fully productive without needing prior chat history.
> Read this + `docs/BUILD-BRIEF.md`, then continue from "Next actions".
>
> **Keep it updated:** every working session that changes phase state should
> amend this file in the same commit.

_Last updated: 2026-07-05 (MacBook Pro session — Phase 0/1 code complete)_

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
| **0 — Local infra** | **CODE DONE — needs run on Mini** | `docker-compose.yml` written (Mongo 8 + Qdrant, named volumes, localhost-bound). `.env` template + real `.env` prepared. Ollama steps documented. **Acceptance test NOT yet run** (this MacBook has no Docker/Ollama; must run on the Mini). |
| **1 — Backend + AI layer** | **CODE DONE — needs acceptance on Mini** | `services/aiProvider.js` implemented (gemini/ollama/anthropic). `query.js` refactored onto it. `LOCAL_MODE` added to `middleware/auth.js`. Smoke-tested: full require graph, provider selection, boot order. **Live acceptance (real PDF → ready → grounded answer) pending on the Mini.** |
| **2 — Native frontend (S24)** | **NOT STARTED** | `network.js` still has the silent mock fallback (must become opt-in + surface errors). Upload flow + status polling not yet wired to the real backend. Reader thunk not wired to `/query`. |
| **3 — Web target (Macs)** | **NOT STARTED** | Web Speech API TTS path not implemented; `expo start --web` unverified. |
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

1. **On the Mac Mini** — follow `neuropal-backend/docs/MAC-MINI-SETUP.md`
   top-to-bottom: installs → clone → `.env` (paste `GEMINI_API_KEY`) →
   `docker compose up -d` → `ollama pull` ×2 → `npm install` → `npm run dev`.
2. **Run Phase 0 + Phase 1 acceptance tests** (MAC-MINI-SETUP §6–§7) with a
   real physics PDF. Both providers: default (gemini) and `"provider":"ollama"`.
3. **Phase 2** — on any machine, `neuropal-expo-app/`:
   - Fix `src/services/network.js` (mock → explicit `EXPO_PUBLIC_USE_MOCK` flag;
     surface connection errors in UI).
   - `EXPO_PUBLIC_API_BASE_URL=http://<mini-ip>:4000`.
   - Wire upload + library polling + reader query to the real API.
   - Acceptance on the S24 Ultra (Expo Go / dev build).
4. **Phase 3** — web TTS via `speechSynthesis` + `onboundary`; browser upload.
5. **Phase 4** — summarize/quiz/cheatsheet/explain endpoints on `aiProvider`.

## How to continue with Claude Code on another machine

```bash
git clone https://github.com/Ryx007/NeuroPal.git && cd NeuroPal
claude   # then: "Read docs/BUILD-BRIEF.md and docs/PROJECT-STATUS.md, then continue from 'Next actions'."
```
