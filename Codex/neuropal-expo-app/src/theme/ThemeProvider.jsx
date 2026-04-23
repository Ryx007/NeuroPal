import { createContext, useContext, useMemo } from "react";
import { useSelector } from "react-redux";

import { selectUiState } from "../store/selectors";
import { DEFAULT_PALETTE, resolvePalette } from "./palette";

const ThemeContext = createContext({
  palette: DEFAULT_PALETTE,
  readerFontFamily: "Inter_400Regular",
  readerFontSize: 20,
  readerLineHeight: 1.7,
  readerExtraLetterSpacing: false,
  isLight: false,
});

function fontFor(font) {
  switch (font) {
    case "atkinson":
    case "dyslexic":
      return "AtkinsonHyperlegible_400Regular";
    case "lora":
      return "Lora_400Regular";
    case "fraunces":
      return "Fraunces_400Regular";
    default:
      return "Inter_400Regular";
  }
}

export function ThemeProvider({ children }) {
  const tweaks = useSelector(selectUiState);

  const value = useMemo(() => {
    const palette = resolvePalette(tweaks.theme, tweaks.accent);

    return {
      palette,
      readerFontFamily: fontFor(tweaks.readerFont),
      readerFontSize: tweaks.fontSize,
      readerLineHeight: tweaks.lineSpacing,
      readerExtraLetterSpacing: tweaks.readerFont === "dyslexic",
      isLight: tweaks.theme === "light" || tweaks.theme === "sepia",
    };
  }, [
    tweaks.accent,
    tweaks.fontSize,
    tweaks.lineSpacing,
    tweaks.readerFont,
    tweaks.theme,
  ]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function usePalette() {
  return useContext(ThemeContext).palette;
}
