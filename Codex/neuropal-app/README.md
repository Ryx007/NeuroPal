# NeuroPal — Vite + Tailwind + MUI + Redux Hooks

Interactive NeuroReader prototype rebuilt around a feature-first React architecture.

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| UI | MUI v6 — mandatory component layer |
| Styling | Tailwind CSS v4 + MUI `sx` prop |
| State | Redux Toolkit + `useSelector` + `useDispatch` |
| Routing | react-router-dom v7 (`BrowserRouter` + `<Routes>`) |
| Toasts | react-toastify v11 |
| Dialogs | React Context (`DialogProvider`) wrapping MUI `<Dialog>` |

## Quick start

```bash
cd neuropal-app
npm install
npm run dev
```

Opens on `http://localhost:3000`.

## Architecture

```
src/
├── main.jsx                        # Entry point
├── app/
│   ├── App.jsx                     # BrowserRouter + app shell + toasts
│   ├── AppProviders.jsx            # Redux, MUI theme, dialog provider
│   ├── router.jsx                  # Central route table
│   └── store.js                    # configureStore
├── theme/
│   ├── index.js                    # Dynamic MUI theme builder
│   └── tokens.js                   # Theme + accent token maps
├── providers/
│   └── DialogProvider.jsx          # MUI dialog context
├── shared/
│   ├── data/papers.js              # Paper content, notes, citation graph
│   └── styles/globals.css          # Tailwind entry, utilities, CSS variables
└── features/
    ├── shell/
    │   ├── AppShell.jsx            # Nav + header + routed content
    │   ├── components/             # NavRail, TopBar
    │   └── config/navigation.js    # Route metadata and labels
    ├── home/HomePage.jsx           # Dashboard
    ├── library/
    │   ├── LibraryPage.jsx         # Document library
    │   ├── selectors.js
    │   └── store/librarySlice.js
    ├── reader/
    │   ├── ReaderPage.jsx          # Reader experience
    │   ├── selectors.js
    │   └── store/readerSlice.js
    ├── stub/StubRoutePage.jsx      # Placeholder routes
    └── ui/
        ├── components/TweaksPanel.jsx
        ├── selectors.js
        └── store/uiSlice.js
```

## Architecture notes

- No Next.js
- Tailwind is wired through `@tailwindcss/vite` and used for layout primitives/utilities
- MUI remains the primary UI component system
- Redux access is hook-based everywhere; there is no `connect(...)` left in the app
- The MUI theme is generated from Redux UI preferences so theme/accent changes update both MUI and shared CSS variables

## Redux pattern

```jsx
import { useDispatch, useSelector } from 'react-redux';
import { selectReaderPageState } from './features/reader/selectors';

function ReaderPage() {
  const dispatch = useDispatch();
  const reader = useSelector(selectReaderPageState);

  // ...
}
```

## Features

- **3 reader layouts**: Split (inline margin Q&A), Focus (cocoon vignette), Paginated
- **Karaoke TTS**: Word-level highlighting synced to a WPM timer
- **Inline margin notes**: AI-generated Q&A anchored to specific paragraphs
- **Select-to-ask**: Highlight text → chip appears → generates a new margin note
- **Citation graph**: Interactive node-link overlay showing paper references
- **Minimap**: Vertical progress rail with section-jump buttons
- **Tweaks panel**: Theme, accent, font, layout, density, font size, line spacing, WPM, voice
- **State-aware nudge**: Yellow-state banner on Home suggests cocoon session
- **Toast notifications**: Document actions and stub-route feedback
- **Dialog context**: MUI Dialog managed via React Context for confirms/modals
