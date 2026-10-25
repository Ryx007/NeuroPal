# NeuroPal platform site

The public home of NeuroPal: the landing page, the science-for-anyone learning
space, sign-in to your own NeuroPal server, and **Make it yours** (appearance).
It is a fully static site (Next.js App Router, `output: 'export'`): `npm run build`
writes plain HTML, CSS and JS to `out/`, which any static host can serve.

| Route | What it is |
|---|---|
| `/` | Landing: Signal hero with a WebGL background field (Chladni plate / two-source interference), the two apps, Make it yours, principles, research behind the design |
| `/learn/` | Lesson index: one real lesson, three honestly labelled “coming soon” |
| `/learn/interference/` | Interactive two-source interference lesson: ripple tank, three explanation depths, interest analogies, hint-first check |
| `/appearance/` | Make it yours: Classic / Signal skins, vibes, fine-tune, Classic theme × accent, Ask Pal (preview → apply → undo), saved looks, Save to my NeuroPal |
| `/sign-in/` | Connect to your NeuroPal server: check connection, who am I, email + password sign-in |
| `/privacy/` | The permanent principles in plain words, and what the site and the app keep |

## Requirements

Node.js 20.9 or newer (developed on Node 22).

## Develop

```bash
cd neuropal-platform
npm install
npm run dev          # http://localhost:3000
```

### Design tokens (generated — never edit by hand)

`src/lib/tokens/*.js` and `src/styles/tokens.css` are generated from
`packages/tokens` (the single source of truth shared with the Expo and Flutter
apps). After changing anything in `packages/tokens`, regenerate:

```bash
npm run tokens       # = node ../packages/tokens/scripts/sync.js
```

How the site uses them:

- `src/styles/tokens.css` gives the first-paint defaults (`--np-*` custom properties; Signal on `:root`, Classic per `data-theme`).
- `src/lib/appearance.ts` is a typed facade over the generated JS: `resolveAppearancePalette`, `interpretAppearance`, `diffAppearance`, `matchLook`, `applyLook`, presets, looks. It maps a resolved palette to the same `--np-*` names (`paletteVars`) and to `data-skin / data-theme / data-type / data-motion / data-field / data-texture / data-dark` attributes (`skinAttributes`).
- `src/components/AppearanceProvider.tsx` writes those onto `<html>`, so the visitor’s look applies site-wide. `src/app/globals.css` turns the attributes into skin variables (fonts, glass recipe, shadows, texture), declared on the element that carries them, so any subtree with its own attributes (the preview card) restyles itself.
- A tiny inline script in `<head>` (`src/lib/noFlash.ts`) re-applies the saved look before first paint, so Classic or a custom Signal look never flashes the default.

## Build

```bash
npm run build        # static export → out/
npm run serve        # preview out/ at http://127.0.0.1:4321 (PORT, HOST env vars)
```

## Deploy

Copy `out/` to any static host (nginx, Caddy, GitHub Pages, Netlify, S3, …).
URLs end in a slash (`/learn/`), so every page is a plain `index.html` and no
rewrite rules are needed. `404.html` is included for hosts that use it.

**From the owner’s Mac**, any of these work:

```bash
# 1. The bundled zero-dependency server, kept alive by pm2 (reachable on the LAN / Tailscale):
cd neuropal-platform && PORT=8090 HOST=0.0.0.0 pm2 start scripts/serve.mjs --name neuropal-platform -- out
pm2 save

# 2. Python, for a quick look:
python3 -m http.server 8090 --directory out

# 3. Under a sub-path of an existing server, e.g. http://mini:8081/platform/ —
#    build with the base path, then mount out/ there as static files:
NEXT_PUBLIC_BASE_PATH=/platform npm run build
#    (Express: app.use('/platform', express.static('/path/to/neuropal-platform/out')))
```

If the site is served over **HTTPS**, browsers block calls to an `http://`
NeuroPal server (mixed content). Serve both over HTTPS, or both over HTTP on
your own network; the Sign in page explains this to visitors when it happens.
The backend already allows cross-origin requests (`cors({ origin: true })`).

## Environment variables

| Variable | When | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | build time | Default server address on Sign in (e.g. `http://ryx-mac-mini.tail73ed8.ts.net:4000`). Optional; visitors can type their own, which is remembered in their browser. |
| `NEXT_PUBLIC_BASE_PATH` | build time (and `npm run serve`) | Serve the site under a sub-path, e.g. `/platform`. |
| `PORT`, `HOST` | `npm run serve` | Where the preview server listens (default `127.0.0.1:4321`). |
| `SITE_URL` | QA scripts | Site to test (default `http://127.0.0.1:4321`). |

## Quality checks

```bash
npm run lint         # ESLint (eslint-config-next, core web vitals + TypeScript)
npm run typecheck    # next typegen && tsc --noEmit

# With the site running (npm run build && npm run serve):
npm run qa:shots -- --out shots [--all] [--skin classic|classic:light|signal:Concrete]
npm run qa:axe -- [--all] [--verbose]     # fails on any serious/critical violation
```

The QA scripts use `playwright-core` with an installed Chromium. On a new
machine run `npx playwright install chromium` once (or point
`PLAYWRIGHT_BROWSERS_PATH` at an existing browser folder). `qa:axe` also
checks interactive states: the Pal proposal, the Classic skin, and the lesson
with hint and answer revealed.

## What the site stores (all per browser, all optional)

| Key | Where | What |
|---|---|---|
| `np.appearance.v1` | localStorage | The appearance object (PLATFORM-PLAN §3.2) |
| `np.appearance.css.v1` | localStorage | Pre-computed attributes + CSS variables for the no-flash script |
| `np.learn.v1` | localStorage | Lesson explanation level and interest |
| `np.apiBase` | localStorage | The NeuroPal server address |
| `np.session` | sessionStorage | Sign-in token (gone when the tab closes). Passwords are never stored. |

Every storage access is wrapped; with storage blocked the site still works for
the current page.

## Calls to the NeuroPal backend

Only to the address the visitor enters (BRAIN §4, PLATFORM-PLAN §3.3):
`GET /healthz`, `GET /api/auth/me`, `POST /api/auth/login`,
`GET /api/me/appearance` and `PUT /api/me/appearance`. “Save to my NeuroPal”
first reads the stored copy and keeps its Pal and Home layout (the web never
edits those), then saves the look. If the server holds a newer look (409), it
is never overwritten silently: the visitor can use that look here or save this
one anyway.

## Ground rules this site follows

- WCAG 2.1 AA: token colours with auto-contrast (`accentText` for accent text), visible focus rings, landmarks and skip link, labelled controls, 44 px targets, state never shown by colour alone, warnings with hazard stripes and words.
- Motion lives in the frame, never in content. The hero field pauses off-screen and in hidden tabs, has a Pause button, and renders one still frame under reduced motion or the Still setting. The lesson simulation moves only when the learner presses Play. The appearance preview animates for five seconds after a change, on request.
- No streaks, no points, no ads, no trackers, no cookies, no third-party requests (fonts are self-hosted by `next/font` at build time).
