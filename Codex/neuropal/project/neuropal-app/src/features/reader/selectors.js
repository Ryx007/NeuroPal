export const selectReaderPageState = (state) => ({
  activePaperId: state.reader.activePaperId,
  playing: state.reader.playing,
  globalWordIndex: state.reader.globalWordIndex,
  focusMode: state.reader.focusMode,
  showNotes: state.reader.showNotes,
  showGraph: state.reader.showGraph,
  wpm: state.ui.wpm,
  voice: state.ui.voice,
  readerFont: state.ui.readerFont,
  readerLayout: state.ui.readerLayout,
  fontSize: state.ui.fontSize,
  lineSpacing: state.ui.lineSpacing,
});
