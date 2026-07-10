import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  theme: "dark",
  accent: "ruby",
  readerFont: "inter",
  readerLayout: "split",
  density: "calm",
  fontSize: 20,
  lineSpacing: 1.7,
  wpm: 225,
  voice: "soft",
  // P1 — how TTS handles equations: 'off' (skip silently), 'placeholder'
  // (say "equation"), 'aloud' (rule-based LaTeX→speech).
  speakEquations: "placeholder",
  // System TTS voice identifier (from Speech.getAvailableVoicesAsync).
  // null = platform default. Distinct from `voice` (the tone/pitch preset).
  voiceId: null,
  tweaksOpen: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    hydrateUi(state, action) {
      Object.assign(state, {
        ...action.payload,
        tweaksOpen: false,
      });
    },
    setTheme(state, action) {
      state.theme = action.payload;
    },
    setAccent(state, action) {
      state.accent = action.payload;
    },
    setReaderFont(state, action) {
      state.readerFont = action.payload;
    },
    setReaderLayout(state, action) {
      state.readerLayout = action.payload;
    },
    setDensity(state, action) {
      state.density = action.payload;
    },
    setFontSize(state, action) {
      state.fontSize = action.payload;
    },
    setLineSpacing(state, action) {
      state.lineSpacing = action.payload;
    },
    setWpm(state, action) {
      state.wpm = action.payload;
    },
    setVoice(state, action) {
      state.voice = action.payload;
    },
    setVoiceId(state, action) {
      state.voiceId = action.payload;
    },
    setSpeakEquations(state, action) {
      state.speakEquations = action.payload;
    },
    setTweaksOpen(state, action) {
      state.tweaksOpen = action.payload;
    },
  },
});

export const {
  hydrateUi,
  setAccent,
  setDensity,
  setFontSize,
  setLineSpacing,
  setReaderFont,
  setReaderLayout,
  setTheme,
  setTweaksOpen,
  setVoice,
  setVoiceId,
  setSpeakEquations,
  setWpm,
} = uiSlice.actions;

export default uiSlice.reducer;
