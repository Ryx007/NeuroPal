import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  theme: "dark",
  accent: "blue",
  readerFont: "inter",
  readerLayout: "split",
  density: "calm",
  fontSize: 20,
  lineSpacing: 1.7,
  wpm: 225,
  voice: "soft",
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
  setWpm,
} = uiSlice.actions;

export default uiSlice.reducer;
