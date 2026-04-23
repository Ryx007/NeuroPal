import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type {
  AccentChoice,
  Density,
  ReaderFont,
  ReaderLayout,
  ThemeChoice,
  Voice,
} from "@/models/types";

export interface UiState {
  theme: ThemeChoice;
  accent: AccentChoice;
  readerFont: ReaderFont;
  readerLayout: ReaderLayout;
  density: Density;
  fontSize: number;
  lineSpacing: number;
  wpm: number;
  voice: Voice;
  tweaksOpen: boolean;
}

export const initialUiState: UiState = {
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
  initialState: initialUiState,
  reducers: {
    hydrateUi(state, action: PayloadAction<Partial<UiState>>) {
      Object.assign(state, {
        ...action.payload,
        tweaksOpen: false,
      });
    },
    setTheme(state, action: PayloadAction<ThemeChoice>) {
      state.theme = action.payload;
    },
    setAccent(state, action: PayloadAction<AccentChoice>) {
      state.accent = action.payload;
    },
    setReaderFont(state, action: PayloadAction<ReaderFont>) {
      state.readerFont = action.payload;
    },
    setReaderLayout(state, action: PayloadAction<ReaderLayout>) {
      state.readerLayout = action.payload;
    },
    setDensity(state, action: PayloadAction<Density>) {
      state.density = action.payload;
    },
    setFontSize(state, action: PayloadAction<number>) {
      state.fontSize = action.payload;
    },
    setLineSpacing(state, action: PayloadAction<number>) {
      state.lineSpacing = action.payload;
    },
    setWpm(state, action: PayloadAction<number>) {
      state.wpm = action.payload;
    },
    setVoice(state, action: PayloadAction<Voice>) {
      state.voice = action.payload;
    },
    setTweaksOpen(state, action: PayloadAction<boolean>) {
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
