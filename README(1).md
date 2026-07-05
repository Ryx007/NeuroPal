# NeuroPal

A neurodivergent-focused learning and life-management platform. Two live
subprojects in this repo:

```
NeuroPal/
├── neuropal-backend/     Node.js · Express · MongoDB · Qdrant · Ollama · Claude
├── neuropal-expo-app/    React Native · Expo SDK 55 · Redux Toolkit · NativeWind
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

API listens on `http://localhost:4000`. Health probe at `/healthz`.

See [neuropal-backend/README.md](./neuropal-backend/README.md) for full
architecture and [neuropal-backend/docs/](./neuropal-backend/docs/) for
detailed Ollama + RAG + session-auth walkthroughs.

### Mobile app

```bash
cd neuropal-expo-app
npm install
npx expo prebuild --platform android --clean
npx expo run:android
```

For iOS: same with `--platform ios` and `npx expo run:ios`.

The app talks to the backend at `https://local.ryx007.science` (nginx →
`localhost:4000`). Change `src/store/ApiLink.js#API_HOST` to point elsewhere.

## Architecture in one paragraph

User uploads a PDF → backend extracts text (pdf-parse) → chunks into ~500-token
paragraphs → embeds each chunk with Ollama's `nomic-embed-text` → stores chunk
text in MongoDB and the 768-dim vector in Qdrant. When the user asks a question,
the backend embeds the question, finds the 8 closest chunks via Qdrant, fetches
their text from MongoDB, and sends them + the question to Claude. Claude returns
an answer grounded in those chunks. Documents never leave the server.

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
