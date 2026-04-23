import React, { createContext, useContext, useMemo } from "react";

import {
  DEFAULT_PALETTE,
  NpPalette,
  resolvePalette,
} from "@/theme/palette";
import type { ReaderFont } from "@/models/types";
import { useAppSelector } from "@/store/hooks";
import { selectUiState } from "@/store/selectors";

interface NpThemeValue {
  palette: NpPalette;
  readerFontFamily: string;
  readerFontSize: number;
  readerLineHeight: number;
  readerExtraLetterSpacing: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<NpThemeValue>({
  palette: DEFAULT_PALETTE,
  readerFontFamily: "Inter_400Regular",
  readerFontSize: 20,
  readerLineHeight: 1.7,
  readerExtraLetterSpacing: false,
  isLight: false,
});

function fontFor(f: ReaderFont): string {
  switch (f) {
    case "inter":
      return "Inter_400Regular";
    case "atkinson":
    case "dyslexic":
      return "AtkinsonHyperlegible_400Regular";
    case "lora":
      return "Lora_400Regular";
    case "fraunces":
      return "Fraunces_400Regular";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const tweaks = useAppSelector(selectUiState);
  const value = useMemo<NpThemeValue>(() => {
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
    tweaks.theme,
    tweaks.accent,
    tweaks.readerFont,
    tweaks.fontSize,
    tweaks.lineSpacing,
  ]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const usePalette = () => useContext(ThemeContext).palette;
