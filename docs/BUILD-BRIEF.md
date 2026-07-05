# NeuroPal — Claude Code Build Brief
## Local-First Personal MVP (Exam-Prep Build)

> Paste this whole document into Claude Code as the opening brief. Then point it at the existing `neuropal-backend/` and Expo frontend repos.

---

## 0. Read this before writing any code

You are working **inside the existing NeuroPal monorepo** — a Node.js/Express backend (`neuropal-backend/`, ~2,720 lines, 27 files) and a React Native/Expo frontend (7 screens). **Do not scaffold from scratch.** Read the existing `src/` in both projects first and preserve every established pattern (listed in §9).

This brief **pivots the project** from a multi-user cloud product to a **single-user, local-first personal tool**. One person (the owner) will run it across his own devices to prepare for a physics PhD **oral exam in ~2 weeks**. The only thing that matters is getting **Module 0 (NeuroReader)** working end-to-end, fast, without sacrificing architectural soundness. Scope must be ruthlessly limited to the critical path. When in doubt, cut scope, not quality.

**Module 0 = upload a document → hear it read aloud with synchronized word-by-word ("karaoke") highlighting → ask questions and get answers grounded in that document's content.** Everything else is secondary.

---

## 1. The owner's hardware (the whole "fleet")

| Device | Role |
|---|---|
| **Mac Mini M4** | **Backend host** — always-on, runs the Node server + Docker DBs + Ollama |
| MacBook Air M2 (16GB) | Client (Expo web in browser) + can host backend when mobile |
| MacBook Pro M1 (16GB) | Client (Expo web in browser) + can host backend when mobile |
| Samsung Galaxy S24 Ultra (Android) | **Primary client** — native Expo app |
| iPhone 12 Mini (iOS) | Secondary client — native Expo app |

All machines are Apple Silicon. Docker Desktop and Ollama run natively and fast. Assume the **Mac Mini M4 is the default backend host**, reachable by all other devices over the home LAN.

---

## 2. Locked architecture decisions (do not deviate, do not propose alternatives)

1. **Backend runs locally on the Mac Mini M4. All other devices are thin clients** that connect to it over the home LAN (`http://<mac-mini-lan-ip>:4000`). Reuse the existing Express backend structure as-is.
2. **Databases run via Docker Compose**, locally, persisting to disk. MongoDB + Qdrant in one `docker-compose.yml`, one `docker compose up -d`. **Do NOT migrate to SQLite or rewrite the 14 Mongoose schemas** — the time cost and risk are unacceptable this close to the exam. Docker makes the existing stack zero-friction.
3. **Embeddings stay local** via Ollama + `nomic-embed-text` (already wired in `embedder.js`). Free, runs on the Mac.
4. **Reasoning layer is provider-agnostic** (see §6). Default to the **free Google Gemini API**, with **local Ollama** as an offline/private fallback and **Anthropic API** as an optional paid "best quality" toggle. **The owner's chat subscriptions (Claude Max / ChatGPT Plus / Gemini Pro) are NOT usable as programmatic APIs — do not attempt to integrate them.**
5. **One Expo codebase, two targets:** native (Android/iOS) and **web** (`expo start --web`) so the Macs run the same app in a browser. NativeWind 4 already supports web.
6. **TTS is on-device on every platform** (see §7): `expo-speech` on native, **Web Speech API** on web. Both drive karaoke highlighting via word-boundary events. **No cloud TTS.**
7. **Single-user `LOCAL_MODE`:** when `LOCAL_MODE=true`, the auth middleware injects one fixed local user and skips JWT verification entirely. No login screen friction. Keep the existing JWT path intact for `LOCAL_MODE=false`.
8. **No cloud sync.** Documents and chat history live on the backend host. (Optional future: Tailscale for away-from-home LAN access — do not build now.)
9. **Accessibility is non-negotiable and architectural**, not a later polish pass: screen-reader labels (VoiceOver/TalkBack and ARIA on web), adjustable contrast/font/family, dyslexia-friendly font option (OpenDyslexic/Atkinson Hyperlegible already in the design system), reduced-motion support, WCAG 2.1 AA. Build it into components as you touch them.

---

## 3. Target topology

```
   ┌─────────────────────────── Home LAN (WiFi) ───────────────────────────┐
   │                                                                        │
   │   S24 Ultra ──┐                                                        │
   │   iPhone 12 ──┤                                                        │
   │   MBA M2  ────┼──HTTP──►  Mac Mini M4  (BACKEND HOST)                  │
   │   MBP M1  ────┘            ├─ Node/Express  :4000                      │
   │   (web in browser)        ├─ Docker: MongoDB :27017                    │
   │                           ├─ Docker: Qdrant  :6333                     │
   │                           └─ Ollama          :11434                    │
   │                               ├─ nomic-embed-text  (embeddings)        │
   │                               └─ qwen2.5:7b (or similar)  (local LLM)  │
   └────────────────────────────────────────────────────────────────────────┘
                                       │
                       (optional, only for reasoning)
                                       ▼
                         Google Gemini API  (free tier)
                              — default reasoning provider —
```

- **Embeddings + storage + retrieval: always local.**
- **Reasoning: Gemini (cloud, free) by default; local Ollama LLM when offline/private; Anthropic optional.**
- **TTS: on whatever device the owner is holding.**

---

## 4. Phased workflow (execute in order; each phase has an acceptance test)

### Phase 0 — Local infrastructure (target: ½ day)
- Create `neuropal-backend/docker-compose.yml` defining **MongoDB 8** (with the existing `admin` credentials, db `neuropal`, `authSource: admin`) and **Qdrant**, both with named volumes for disk persistence. Bind to localhost.
- Document the Ollama setup steps in the README: install Ollama (native Mac), `ollama pull nomic-embed-text`, and `ollama pull qwen2.5:7b` (local reasoning fallback; pick a 7B–14B instruct model that fits 16GB — qwen2.5:7b-instruct is a good default, qwen2.5:14b if RAM allows).
- Fill `.env` from `.env.example` for **localhost** service URLs (`MONGODB_URI=mongodb://admin:...@localhost:27017/neuropal?authSource=admin`, `QDRANT_URL=http://localhost:6333`, `OLLAMA_URL=http://localhost:11434`), a 32+ char `JWT_SECRET`, `LOCAL_MODE=true`, `AI_PROVIDER=gemini`, and `GEMINI_API_KEY=` (owner pastes this).
- **Acceptance:** `docker compose up -d` brings both DBs up; `curl localhost:6333/collections` and a Mongo ping both succeed; `curl localhost:11434/api/tags` lists the pulled models.

### Phase 1 — Backend boots locally + provider-agnostic AI layer (target: 1 day)
- Boot the existing server against the local infra. Confirm `server.js` boot sequence (Mongo connect → Qdrant `ensureCollection` → storage mkdir → listen :4000) completes clean.
- **Refactor the reasoning call** currently hardwired to `@anthropic-ai/sdk` in `query.js` into a new `services/aiProvider.js` (interface in §6). Implement `gemini`, `ollama`, and `anthropic` providers. Keep the existing `{answer, citations}` JSON contract and the graceful malformed-JSON fallback. Provider chosen by `AI_PROVIDER` env, overridable per-request.
- Add the **`LOCAL_MODE` branch** to `middleware/auth.js`: when true, find-or-create a fixed user (`local@neuropal.app`) and attach it as `req.user`/`req.userId`, bypassing JWT. Leave the JWT path unchanged otherwise.
- **Acceptance (curl, no frontend yet):** upload a real PDF → poll `GET /documents/:id` and watch `status` walk `pending→parsing→chunking→embedding→ready` → `GET /documents/:id/text` returns full text → `POST /documents/:id/query` with a question returns a grounded `{answer, citations}` using Gemini. Repeat with `AI_PROVIDER=ollama` to confirm the local model path works offline.

### Phase 2 — Connect the native frontend (target: 1 day)
- Set `EXPO_PUBLIC_API_BASE_URL=http://<mac-mini-lan-ip>:4000` in the Expo env.
- **Fix `src/services/network.js`:** the silent mock fallback is why the app appeared "built but disconnected." Make mock data **opt-in via an explicit flag**, and **surface real connection errors visibly** in the UI. Wire `requestReaderAnswer` (reader thunk) to the real `POST /documents/:id/query`.
- Wire the upload flow (`expo-document-picker` → `POST /upload`) and the Document Library status polling to the real backend.
- **Acceptance on S24 Ultra** (via Expo Go or a dev build): pick a PDF from device storage → see it ingest to `ready` in the Library → open it in the Reader → hear TTS with word-by-word karaoke highlighting → ask a question in the doc chat → receive an answer grounded in the document with citations.

### Phase 3 — Web target for the Macs (target: ½–1 day)
- Get `expo start --web` running cleanly. Resolve any native-only imports that break web (notably TTS — see §7).
- Implement the **Web Speech API TTS path** for the Reader with karaoke highlighting via `speechSynthesis` `onboundary` events and macOS system voices.
- Implement browser file upload (file input / drag-and-drop) → `POST /upload`.
- **Acceptance:** full Module 0 loop works in Chrome/Safari on a Mac — upload, karaoke read-back, grounded Q&A.

### Phase 4 — Exam-prep RAG extensions (target: 1–2 days) — *high value, low cost*
These are **new prompts/endpoints over the existing RAG pipeline**, not new infrastructure:
- `POST /documents/:id/summarize` — section-level or whole-doc plain-language summary at a chosen depth (quick / intuitive / comprehensive).
- `POST /documents/:id/quiz` — generate N practice questions (and answers) from retrieved content; tag by difficulty. Built for *active recall*, not answer-lookup.
- `POST /documents/:id/cheatsheet` — exam-ready condensed notes from the document, structured and exportable (start with Markdown; PDF export optional).
- `POST /documents/:id/explain` — "explain this passage/equation," configurable depth, grounded-first then supplemented.
- **Acceptance:** from a real quantum-optics paper, generate a usable summary, a 10-question practice set, and a one-page cheatsheet.

### Phase 5 — Standalone APK + accessibility pass (target: ongoing)
- Test fastest via **Expo Go / dev build** first; only run **EAS Build** for a standalone APK once Module 0 is stable on the S24 (EAS builds are slow — don't gate iteration on them).
- Accessibility sweep on every Module 0 surface: screen-reader labels, contrast check, dyslexia font toggle, adjustable size/spacing, reduced-motion honoring, TTS controls reachable and labeled.

---

## 5. Document-corpus reality (tune for this, don't over-engineer)
Single user, exam scope: roughly **10–50 documents**, including large textbooks (hundreds of pages). A 400-page textbook → a few thousand chunks; embedding it via local Ollama on the M4 takes a few minutes — the existing async ingest pipeline with the `Document.status` state machine and `progress` field already handles this gracefully. Qdrant and `top-8` retrieval scale fine at this size. **No sharding, no queues, no scaling work.**

---

## 6. Provider-agnostic AI service spec (`services/aiProvider.js`)

Single interface, swappable providers:

```
generateAnswer({ question, contextChunks, systemPrompt, provider? })
  → { answer: string, citations: [{ chunkId, page, sectionHeading, excerpt }], model, tokens }
```

- **Selection:** `provider` arg → else `process.env.AI_PROVIDER` → default `'gemini'`.
- **`gemini`** (default, free): use the current official Google GenAI Node SDK and a current free-tier model. **Verify the exact SDK package name and model id against current Google AI docs before coding** (these change). As of writing: `gemini-2.5-flash` is a strong free default; `gemini-2.5-pro` for harder reasoning. Key via `GEMINI_API_KEY` from https://aistudio.google.com.
- **`ollama`** (offline/private): `POST ${OLLAMA_URL}/api/chat` with `{ model: process.env.OLLAMA_CHAT_MODEL, messages, stream:false }`. Default model `qwen2.5:7b`. No key, fully local.
- **`anthropic`** (optional, paid): keep the existing `@anthropic-ai/sdk` path (`claude-sonnet-4-5`), key via `ANTHROPIC_API_KEY`.
- **(optional) `openai`:** stub only if trivial; not required.
- **Keep the `{answer, citations}` JSON contract** and the existing tolerant parser (graceful fallback when the model returns malformed JSON). Keep token-telemetry persistence into `ChatMessage`.
- All three Phase-4 features call this same service with different system prompts.

---

## 7. TTS spec (on-device, two implementations behind one interface)

Create a small abstraction (e.g. `src/services/tts.js`) with a single API the Reader calls, and platform implementations:

- **Native (`expo-speech`):** `Speech.speak(text, { voice, rate, pitch, onBoundary })`. Use the `onBoundary` callback to advance the karaoke highlight word-by-word. iOS boundary events are reliable; **Android boundary support is less reliable** — implement a **fallback estimator** (advance highlight on a timer derived from rate × word length) so highlighting still works on the S24 even if boundaries are sparse. Expose adjustable **WPM/rate, voice, pitch** (these already exist in the Reader).
- **Web (Web Speech API):** `window.speechSynthesis` + `SpeechSynthesisUtterance` with the `onboundary` event (well-supported in Safari/Chrome on macOS) driving the same highlight logic; enumerate voices via `speechSynthesis.getVoices()`.
- Use `Platform.OS === 'web'` to select the implementation. The Reader UI and highlight logic stay shared.
- **All voices are the device's built-in OS voices. No network call for TTS.**

---

## 8. Environment variable reference

**Backend `.env`:**
```
PORT=4000
MONGODB_URI=mongodb://admin:<pw>@localhost:27017/neuropal?authSource=admin
QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=qwen2.5:7b
JWT_SECRET=<32+ chars>
LOCAL_MODE=true
AI_PROVIDER=gemini
GEMINI_API_KEY=<from aistudio.google.com>
ANTHROPIC_API_KEY=         # optional, only if using provider=anthropic
STORAGE_ROOT=./storage
```

**Frontend (Expo) `.env`:**
```
EXPO_PUBLIC_API_BASE_URL=http://<mac-mini-lan-ip>:4000
EXPO_PUBLIC_USE_MOCK=false
```

---

## 9. Existing patterns to PRESERVE (do not "improve" away)
- Barrel export for models: `const { User, Document } = require('./models')`.
- `asyncHandler` wrapper on all route handlers (no raw try/catch in routes).
- Soft-delete via `deletedAt`; queries always filter `deletedAt: null`.
- Auth middleware loads the **full** User doc per request (extend it for `LOCAL_MODE`, don't replace the pattern).
- `Document.status` as an explicit state machine with `ingestStartedAt`/`FinishedAt` timestamps.
- `DocumentChunk` ↔ Qdrant via `vectorId` (UUID) + `vectorCollection` (= embedding model name). Collection name = model name.
- File storage: relative paths in Mongo, resolved against `STORAGE_ROOT` at runtime.
- Error handler mapping: Mongoose validation→422, duplicate→409, cast→400, multer→413.
- Two-stage RAG in `query.js` (retrieve via Qdrant → reason via provider), with the **raw-file fallback** if Qdrant retrieval fails.

---

## 10. Scope guards — do NOT do these now
- ❌ Do not build Modules 1–9 routes (Anchors, DailyLog, FrameworkConfig, Companion, Resource, Professional, Spending, Visualizer). Schemas can stay; **no routes** until Module 0 + Phase 4 are solid.
- ❌ Do not implement multi-user, billing, tiers, or cloud sync.
- ❌ Do not migrate databases or rewrite schemas.
- ❌ Do not attempt to call the owner's Claude/ChatGPT/Gemini *chat subscriptions* as APIs.
- ❌ Do not add cloud TTS, queues, microservices, or Kubernetes.
- ✅ Keep the existing 7 screens functional, but don't polish anything outside the Module 0 path until Module 0 works end-to-end.

---

## 11. Definition of Done (Module 0)
On the **Samsung Galaxy S24 Ultra** and in a **browser on a Mac**, the owner can:
1. Pick a PDF (and at least TXT; EPUB/DOCX best-effort) from the device and upload it to the local backend.
2. Watch it ingest to `ready` (status + progress visible).
3. Open it in the Reader and hear it read aloud with **word-by-word karaoke highlighting**, with adjustable WPM/voice/pitch.
4. Ask questions in the document chat and receive answers **grounded in that document**, with citations.
5. Do all of the above with **no internet required except the Gemini reasoning call** (and even that works offline when `AI_PROVIDER=ollama`).

Ship that first. Then Phase 4 (summarize / quiz / cheatsheet / explain) for the actual exam prep.
