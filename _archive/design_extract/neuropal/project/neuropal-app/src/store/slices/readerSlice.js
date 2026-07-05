// ─── Reader slice: playback state, word position, focus mode ─────────
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  activePaperId: localStorage.getItem('np-paper') || 'neuro-1',
  playing: false,
  globalWordIndex: 14,
  focusMode: false,
  showNotes: true,
  showGraph: false,
};

const readerSlice = createSlice({
  name: 'reader',
  initialState,
  reducers: {
    setActivePaper: (s, a) => { s.activePaperId = a.payload; localStorage.setItem('np-paper', a.payload); },
    setPlaying:     (s, a) => { s.playing = a.payload; },
    setGlobalWord:  (s, a) => { s.globalWordIndex = a.payload; },
    advanceWord:    (s, a) => { s.globalWordIndex = Math.min(s.globalWordIndex + 1, a.payload - 1); },
    seekBack:       (s, a) => { s.globalWordIndex = Math.max(s.globalWordIndex - 30, 0); },
    seekForward:    (s, a) => { s.globalWordIndex = Math.min(s.globalWordIndex + 30, a.payload - 1); },
    toggleFocusMode:(s) =>    { s.focusMode = !s.focusMode; },
    toggleNotes:    (s) =>    { s.showNotes = !s.showNotes; },
    setShowGraph:   (s, a) => { s.showGraph = a.payload; },
  },
});

export const {
  setActivePaper, setPlaying, setGlobalWord, advanceWord,
  seekBack, seekForward, toggleFocusMode, toggleNotes, setShowGraph,
} = readerSlice.actions;

export default readerSlice.reducer;
