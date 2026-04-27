import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface State {
  playing: boolean;
  wordIndex: number;
  totalWords: number;
}

const initial: State = {
  playing: false,
  wordIndex: 0,
  totalWords: 0,
};

const slice = createSlice({
  name: "readerPlayback",
  initialState: initial,
  reducers: {
    setTotalWords: (s, a: PayloadAction<number>) => {
      s.totalWords = a.payload;
    },
    play: (s) => {
      s.playing = true;
    },
    pause: (s) => {
      s.playing = false;
    },
    reset: (s) => {
      s.playing = false;
      s.wordIndex = 0;
    },
    setWord: (s, a: PayloadAction<number>) => {
      s.wordIndex = a.payload;
    },
    advance: (s) => {
      if (s.wordIndex + 1 >= s.totalWords) {
        s.playing = false;
        return;
      }
      s.wordIndex += 1;
    },
  },
});

export const selectProgress = (
  wordIndex: number,
  totalWords: number
): number => (totalWords === 0 ? 0 : wordIndex / totalWords);

export const {
  setTotalWords,
  play: playReader,
  pause: pauseReader,
  reset: resetReader,
  setWord,
  advance,
} = slice.actions;

export default slice.reducer;
