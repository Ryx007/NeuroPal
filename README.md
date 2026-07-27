# NeuroPal

A neurodivergent-focused learning platform — currently pivoted to a
**single-user, local-first personal study tool** (see `docs/BUILD-BRIEF.md`).

> **Start here on any new machine / session:**
> 1. `docs/BRAIN.md` — how the whole system actually works today (topology,
>    API contract, the pipelines, runbooks). The densest single doc; read it
>    first if you are new to the repo.
> 2. `docs/BUILD-BRIEF.md` — the authoritative spec (locked decisions, phases)
> 3. `docs/PROJECT-STATUS.md` — current phase state + next actions
> 4. `neuropal-backend/docs/MAC-MINI-SETUP.md` — backend-host bring-up

```
NeuroPal/
├── neuropal-backend/     Node.js · Express · MongoDB · Qdrant · Ollama · Gemini/Claude
│                         src/server.js    → the API        (:4000)
│                         src/webServer.js → the web app    (:8081, proxies to :4000)
├── neuropal-expo-app/    React Native · Expo SDK 55 (Android/iOS/web) · Redux Toolkit
├── docs/                 BRAIN.md · BUILD-BRIEF.md · PROJECT-STATUS.md
└── _archive/             Design refs (Stitch wireframes, Notion plan, web prototype)
```

## Quick start

### Backend

```bash
cd neuropal-backend
cp .env.example .env             # fill in MONGODB_URI, QDRANT_URL, etc.
npm install
npm run dev                       # node --watch src/server.js
```

The API listens on `http://localhost:4000` — **API only**, `GET /` there is a
404. Health probe at `/healthz`, or `/healthz?deps=1` for per-dependency
up/down (mongo, qdrant, ollama, the math extractor).

Requires MongoDB and Qdrant (both via `docker compose up -d` in
`neuropal-backend/`) and Ollama on `:11434`. See
[neuropal-backend/README.md](./neuropal-backend/README.md) for full
architecture and [neuropal-backend/docs/](./neuropal-backend/docs/) for
detailed Ollama + RAG + session-auth walkthroughs.

### Web app

```bash
cd neuropal-expo-app
npx expo start --web --port 8082    # dev (Metro). 8081 is taken — see below.
```

To serve the production build the way the always-on host does:

```bash
cd neuropal-expo-app && npx expo export -p web     # → dist/
# set WEB_DIST to that dist/ in neuropal-backend/.env, then:
node neuropal-backend/src/webServer.js             # → http://localhost:8081
```

`webServer.js` serves the built web app on `:8081` and **proxies** `/api`,
`/healthz`, `/katex` and `/apk` to the API on `:4000`. That proxy is why the
web bundle contains **no backend URL at all** — it resolves the API with a
bare relative path, so it works at any domain/port you deploy it behind, and
pointing it at a different API is one `API_PROXY_TARGET` env change rather
than a rebuild. (KaTeX, the EPUB reader's injected `<base href>`, and
`/healthz` all resolve relative to the page origin and would break under
plain CORS — hence a proxy rather than cross-origin calls.)

Note `:8081` is also Expo/Metro's default dev port, which is why the dev
server above runs on `8082`.

### Mobile app

```bash
cd neuropal-expo-app
npm install
npx expo prebuild --platform android --clean
npx expo run:android
```

For iOS: same with `--platform ios` and `npx expo run:ios`.

**How the app finds the backend.** `src/store/ApiLink.js` resolves it from a
CANDIDATE LIST, probing `/healthz` and taking the first reachable one in
preference order (never fastest-wins):

1. a runtime override, if set — **Settings → Backend address**, stored on the
   device, no rebuild needed. This is the escape hatch when an address moves.
2. web production: `''` (relative — the web server proxies to the API)
   · web dev: the page's hostname on `:4000`, since Metro cannot proxy
3. `EXPO_PUBLIC_API_BASE_URL`, then `EXPO_PUBLIC_API_FALLBACK_URLS`
   (comma-separated) from `neuropal-expo-app/.env`

Native builds have no page origin to be relative to, so an APK needs one of
those baked addresses (or the Settings override). `EXPO_PUBLIC_*` are inlined
at bundle time — restart the bundler / rebuild the APK to change the list.
If nothing answers, a banner names the host that was tried.

## Architecture in one paragraph

User uploads a document → the backend extracts text through a tiered pipeline
(arXiv LaTeX source when available → Nougat for real math → pdf-parse
otherwise; a fast first pass reaches `ready` in seconds and a background pass
swaps in better math later without ever degrading what is already there) →
chunks it math-atomically → embeds each chunk with Ollama's `nomic-embed-text`
→ stores chunk text in MongoDB and the 768-dim vector in Qdrant. When the user
asks a question, the backend embeds the question, finds the closest chunks via
Qdrant, fetches their text from MongoDB, and sends them + the question to the
configured provider (`services/aiProvider`). The answer comes back grounded in
those chunks, with citations. Documents never leave the server. EPUBs are the
exception to the text path: they are ALSO served as the publisher's own XHTML
so equations render exactly as typeset — see `docs/BRAIN.md` §5.

## Git layout

- `main` — only working code, both subprojects must build cleanly
- `backend/*` — backend-only feature branches
- `app/*` — app-only feature branches
- Commits scoped to one subproject: `backend: ...` or `app: ...`

## Reference material in `_archive/`

- `design_extract/` — Stitch wireframes for the 6 screens, plus the Clinical
  Visionary design system
- `Idea/` — original Notion export of the App Development Plan
- `NeuroPal-standalone.html` — the bundled offline web prototype (open in any
  browser)
- `web-prototype-index.html` + `web-prototype-src/` — un-bundled prototype
- `sample-backend-reference.zip` — the CRM backend used as a stylistic reference
- `Project-Brief.txt` — empty PRD template
