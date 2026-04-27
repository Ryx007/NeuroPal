import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type {
  AccentChoice,
  Density,
  ReaderFont,
  ReaderLayout,
  ThemeChoice,
  TweaksState,
  Voice,
} from "@/models/types";

const initialState: TweaksState = {
  theme: "dark",
  accent: "blue",
  readerFont: "inter",
  readerLayout: "split",
  density: "calm",
  fontSize: 20,
  lineSpacing: 1.7,
  wpm: 225,
  voice: "soft",
};

const tweaksSlice = createSlice({
  name: "tweaks",
  initialState,
  reducers: {
    setTheme: (s, a: PayloadAction<ThemeChoice>) => {
      s.theme = a.payload;
    },
    setAccent: (s, a: PayloadAction<AccentChoice>) => {
      s.accent = a.payload;
    },
    setReaderFont: (s, a: PayloadAction<ReaderFont>) => {
      s.readerFont = a.payload;
    },
    setReaderLayout: (s, a: PayloadAction<ReaderLayout>) => {
      s.readerLayout = a.payload;
    },
    setDensity: (s, a: PayloadAction<Density>) => {
      s.density = a.payload;
    },
    setFontSize: (s, a: PayloadAction<number>) => {
      s.fontSize = a.payload;
    },
    setLineSpacing: (s, a: PayloadAction<number>) => {
      s.lineSpacing = a.payload;
    },
    setWpm: (s, a: PayloadAction<number>) => {
      s.wpm = a.payload;
    },
    setVoice: (s, a: PayloadAction<Voice>) => {
      s.voice = a.payload;
    },
  },
});

export const {
  setTheme,
  setAccent,
  setReaderFont,
  setReaderLayout,
  setDensity,
  setFontSize,
  setLineSpacing,
  setWpm,
  setVoice,
} = tweaksSlice.actions;

export default tweaksSlice.reducer;
