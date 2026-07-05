# NeuroPal — React + MUI + Redux + Tailwind

Interactive NeuroReader prototype rebuilt with a production-ready stack.

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 (Vite) |
| UI | MUI v6 — themed to "Clinical Visionary" |
| Styling | Tailwind CSS v4 + MUI `sx` prop |
| State | Redux Toolkit — `useSelector` + `useDispatch` + `connect(mapStateToProps)` |
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
├── main.jsx                  # Entry — Provider + App
├── App.jsx                   # ThemeProvider, BrowserRouter, DialogProvider, ToastContainer
├── theme.js                  # MUI theme — Clinical Visionary tokens
├── styles/globals.css        # Tailwind + CSS variables + karaoke/glass utilities
├── store/
│   ├── index.js              # configureStore + persistence middleware
│   └── slices/
│       ├── uiSlice.js        # Theme, tweaks, user state
│       ├── readerSlice.js    # Playback, word position, focus mode
│       └── librarySlice.js   # Filter
├── context/
│   └── DialogContext.jsx     # MUI Dialog via React Context (confirm, custom)
├── data/
│   └── papers.js             # Paper content, notes, library items, citation graph
├── components/
│   ├── Shell/
│   │   ├── NavRail.jsx       # Left sidebar nav
│   │   └── TopBar.jsx        # Page header + tweaks toggle
│   └── Tweaks/
│       └── TweaksPanel.jsx   # Floating tweaks panel
└── routes/
    ├── Home.jsx              # Dashboard — state check-in, resume, MVD, anchor
    ├── Library.jsx           # Document grid + drop zone + collections
    ├── Reader.jsx            # Karaoke TTS, minimap, margin Q&A, citation graph
    └── StubRoute.jsx         # Placeholder for post-MVP modules
```

## Redux pattern

All connected components use `connect(mapStateToProps)` to read from the store, plus `useDispatch()` for dispatching actions. This follows the recommended modern pattern:

```jsx
// Reading state — mapStateToProps via connect HOC
const mapStateToProps = (state) => ({
  wpm: state.ui.wpm,
  playing: state.reader.playing,
});

// Dispatching — useDispatch hook inside the component
function MyComponentBase({ wpm, playing }) {
  const dispatch = useDispatch();
  // ...
  dispatch(setWpm(250));
}

const MyComponent = connect(mapStateToProps)(MyComponentBase);
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
