// ─── UI slice: theme, tweaks, user state, nav ───────────────────────
import { createSlice } from '@reduxjs/toolkit';

const saved = JSON.parse(localStorage.getItem('np-tweaks') || 'null');

const initialState = {
  theme: saved?.theme || 'dark',
  accent: saved?.accent || 'blue',
  readerFont: saved?.readerFont || 'inter',
  readerLayout: saved?.readerLayout || 'split',
  density: saved?.density || 'calm',
  fontSize: saved?.fontSize || 20,
  lineSpacing: saved?.lineSpacing || 1.7,
  wpm: saved?.wpm || 225,
  voice: saved?.voice || 'soft',
  tweaksOpen: false,
  userState: 'yellow', // green | yellow | red
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme:       (s, a) => { s.theme = a.payload; },
    setAccent:      (s, a) => { s.accent = a.payload; },
    setReaderFont:  (s, a) => { s.readerFont = a.payload; },
    setReaderLayout:(s, a) => { s.readerLayout = a.payload; },
    setDensity:     (s, a) => { s.density = a.payload; },
    setFontSize:    (s, a) => { s.fontSize = a.payload; },
    setLineSpacing: (s, a) => { s.lineSpacing = a.payload; },
    setWpm:         (s, a) => { s.wpm = a.payload; },
    setVoice:       (s, a) => { s.voice = a.payload; },
    setTweaksOpen:  (s, a) => { s.tweaksOpen = a.payload; },
    setUserState:   (s, a) => { s.userState = a.payload; },
    // Bulk update (from tweaks panel)
    updateTweaks:   (s, a) => { Object.assign(s, a.payload); },
  },
});

// Persistence middleware — saves tweaks subset to localStorage
export const tweaksPersistMiddleware = (store) => (next) => (action) => {
  const result = next(action);
  if (action.type?.startsWith('ui/')) {
    const { tweaksOpen, userState, ...tweaks } = store.getState().ui;
    localStorage.setItem('np-tweaks', JSON.stringify(tweaks));
  }
  return result;
};

export const {
  setTheme, setAccent, setReaderFont, setReaderLayout, setDensity,
  setFontSize, setLineSpacing, setWpm, setVoice, setTweaksOpen,
  setUserState, updateTweaks,
} = uiSlice.actions;

export default uiSlice.reducer;
