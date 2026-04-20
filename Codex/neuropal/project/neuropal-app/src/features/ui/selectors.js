export const selectUi = (state) => state.ui;
export const selectThemeMode = (state) => state.ui.theme;
export const selectAccent = (state) => state.ui.accent;
export const selectTweaksOpen = (state) => state.ui.tweaksOpen;
export const selectUserState = (state) => state.ui.userState;

export const selectUiPreferences = (state) => ({
  theme: state.ui.theme,
  accent: state.ui.accent,
  readerFont: state.ui.readerFont,
  readerLayout: state.ui.readerLayout,
  density: state.ui.density,
  fontSize: state.ui.fontSize,
  lineSpacing: state.ui.lineSpacing,
  wpm: state.ui.wpm,
  voice: state.ui.voice,
});
