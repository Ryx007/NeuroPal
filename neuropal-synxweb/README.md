# NeuroPal — Synxweb-style Expo build

Fourth mobile build in this repo. Same app as the other three
(`neuropal-app`, `neuropal-hybrid`, `Codex/neuropal-expo-app`), restructured
to mirror the **coding style and folder layout of `amitsamanta996/Synxweb-Laundry-Store`**.

The intent is convergence: when the same hands work on Synxweb on
Monday and NeuroPal on Tuesday, the file paths, idioms, and provider
tree should look identical.

## What was carried over from Synxweb (the good parts)

| Synxweb idiom | Where it lives here |
|---|---|
| **JS / JSX**, no TypeScript | every file |
| **Single mega-`configSlice`** holding all global state | `src/store/slices/configSlice.js` (~280 LOC, 35 reducers) |
| **`connect(mapStateToProps)` for the App + every page** | `src/App.jsx`, every `src/pages/*.jsx` |
| **`useDispatch` for actions, hooks for transient UI** | inside every page that mutates |
| **`src/pages/`, `src/components/`, `src/store/`, `src/context/`** layout | exact match |
| **Centralised `useApiRequest` hook** with axios + 401 handler + toast | `src/store/ApiRequest.js` |
| **`ApiLink.js`** for URL constants + `getHeaders` | `src/store/ApiLink.js` |
| **`Common.js`** for app-wide constants | `src/store/Common.js` |
| **`Socket.js`** with `autoConnect:false` + `setSocketUser` helper | `src/store/Socket.js` |
| **`UIProvider`** context exposing `confirm()` + `loading()` | `src/context/UI.jsx` (RN Modal in place of MUI Dialog) |
| **`react-toastify`** for app-wide notifications | `react-native-toast-message` (RN equivalent) |
| **Boot-time config dispatch** (`getConfig` → populate Redux) | `src/App.jsx#getConfig` |
| **`<BrowserRouter>` + `<Routes>` declarative routing at the App level** | `<NavigationContainer>` + `<Stack.Navigator>` (the RN analogue) |

## What was deliberately *not* carried over

These are tech-debt items in Synxweb (called out in the audit), so they're
fixed here from day 1:

- **Hardcoded API URL** → `ApiLink.js` still has a single export, but
  comment marks it as an env-var migration target for Phase 2
- **MUI X license key in source** → not applicable on RN
- **No `.gitignore`** in Synxweb's repo root → properly populated here
- **`react-scripts` (deprecated CRA)** → replaced by Expo SDK 55, since
  this is a mobile build anyway

## Stack

- Expo SDK 55 · React Native 0.83.6 · React 19.2
- React Navigation v7 (Stack) — closest to react-router-dom v7's idiom
- Redux Toolkit 2.11 + react-redux 9.2 + redux-persist 6
- axios + socket.io-client (matching Synxweb's HTTP + realtime layer)
- react-native-toast-message (matching react-toastify's UX)
- expo-speech for TTS, expo-document-picker for uploads, expo-blur for
  glass panels, expo-linear-gradient for the primary CTA
- @expo-google-fonts/* for Space Grotesk, Inter, Atkinson Hyperlegible,
  JetBrains Mono, Lora, Fraunces

## Directory

```
neuropal-synxweb/
├── App.js                          // Entry — provider tree (Synxweb's src/index.js role)
├── src/
│   ├── App.jsx                     // connect(mapStateToProps)-wrapped root
│   ├── pages/                      // Synxweb's name for "screens"
│   │   ├── HomePage.jsx
│   │   ├── LibraryPage.jsx
│   │   ├── ReaderPage.jsx
│   │   ├── AnchorsPage.jsx
│   │   ├── ProfilePage.jsx
│   │   ├── OnboardingPage.jsx
│   │   ├── EmergencyPage.jsx
│   │   └── NotFound.jsx
│   ├── components/
│   │   ├── primitives.jsx          // GlassPanel · DataPulse · NpPrimary · NpGhost · SectionHeader
│   │   ├── Navbar.jsx              // Synxweb's Navbar role — bottom tab bar
│   │   └── TweaksSheet.jsx
│   ├── store/                      // 6-file shape, identical to Synxweb
│   │   ├── ApiLink.js              // baseUrl + getHeaders
│   │   ├── ApiRequest.js           // useApiRequest hook
│   │   ├── Common.js               // app-wide constants
│   │   ├── Socket.js               // singleton socket.io client
│   │   ├── index.js                // configureStore({ reducer: { configs }})
│   │   └── slices/
│   │       └── configSlice.js      // single mega-slice (35 reducers)
│   ├── context/
│   │   └── UI.jsx                  // confirm() + loading() context
│   ├── theme/
│   │   ├── palette.js
│   │   └── ThemeProvider.jsx
│   ├── data/
│   │   └── mock.js
│   └── utils/
│       └── helpers.js
├── package.json
├── app.json
├── babel.config.js
├── metro.config.js                 // buffer fix baked in
└── README.md
```

## Pattern walkthrough — how a page is shaped

Every page follows the same skeleton, lifted directly from Synxweb's
`PosPage.jsx` / `OrdersPage.jsx` style:

```jsx
function HomePage({ navigation, mvdTasks, documents, nervousState }) {
    const palette = usePalette();
    const dispatch = useDispatch();
    const { confirm } = useUI();
    const { fetchData, postData } = useApiRequest();    // when needed

    const onSomething = useCallback(async () => {
        const ok = await confirm('Sure?');
        if (!ok) return;
        const resp = await postData('endpoint', { ... });
        if (resp) dispatch(updateSomething(resp.data));
    }, [confirm, postData, dispatch]);

    return ( /* JSX */ );
}

const mapStateToProps = (state) => ({
    mvdTasks: state.configs.mvdTasks,
    documents: state.configs.documents,
    // ...
});

export default connect(mapStateToProps)(HomePage);
```

That's the contract. State reads via `mapStateToProps`, writes via
`useDispatch`, async via `useApiRequest`, blocking confirms via
`useUI().confirm`. One pattern, every page.

## Boot pipeline

`App.jsx#getConfig` is the equivalent of Synxweb's same-named function.
Today it dispatches mock seed data into the slice. When Sprint 1.1 ships:

```js
const session = await AsyncStorage.getItem('neuropal-session');
if (!session) {
    const resp = await postData('app/preview', { hostname: '...' });
    if (resp) {
        dispatch(updateCompanyName(resp.data.companyName));
        dispatch(updateThemeColor(resp.data.themeColor));
        // ...
    }
    dispatch(updateLogin(false));
} else {
    const resp = await fetchData('app/config');
    if (resp) {
        dispatch(updateUserId(resp.data.userId));
        dispatch(setMvdTasks(resp.data.mvd));
        dispatch(setDocuments(resp.data.documents));
        // ...
        setSocketUser(resp.data.userId);
        dispatch(updateLogin(true));
    }
}
```

Drop that into the existing `getConfig` body and the rest of the app
just works.

## Running it

```bash
cd neuropal-synxweb
npm install
npx expo prebuild --platform android --clean      # one-time
npm run android                                   # or `npm run ios`
```

Same runtime caveats as the other Expo builds:
- A dev build is required (Expo Go won't load expo-blur, expo-speech, pager-view)
- `JAVA_HOME` must point to a JDK 17 install
- `ANDROID_HOME` must be set
- The buffer fix is baked into `metro.config.js` — no manual patching needed

## When to pick this build over the others

- Pick **`neuropal-synxweb/`** (this) — if you want Synxweb's exact code
  style, so that someone working across both repos has minimal context-switching cost
- Pick **`Codex/neuropal-expo-app/`** — if you want the original Codex-
  generated baseline (also Synxweb-adjacent but less rigorous)
- Pick **`neuropal-hybrid/`** — if you want TypeScript + Expo Router +
  Redux Toolkit (best DX, but diverges from Synxweb stylistically)
- Pick **`neuropal-app/`** — if you want the leanest TypeScript + Zustand
  + Expo Router setup (smallest dep tree, simplest mental model)
