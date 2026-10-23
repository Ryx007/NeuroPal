import { createContext, useContext, useMemo } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { useSelector } from "react-redux";

import { selectUiState } from "../store/selectors";
import { fontsFor } from "./fonts";
import {
  effectiveMotion,
  normalizeAppearance,
  resolveAppearancePalette,
  resolveClassicPalette,
  resolveSignalPalette,
} from "./tokens";

// v2: two skins, one token vocabulary. Classic resolves EXACTLY the original
// palette.js values (tested in packages/tokens); Signal maps its brutal-glass
// settings onto the same token names, so every existing screen restyles
// without code changes. Extras every skin answers: palette.fonts.<role>,
// palette.shape {radius, radiusMedium, radiusControl, border, shadow},
// palette.motion, palette.field, palette.texture, palette.line/control/
// shadowColor, palette.accentFill/accentInk/accentText.

const DEFAULT_PALETTE = {
  ...resolveClassicPalette({ theme: "dark", accent: "ruby" }),
  fonts: fontsFor("classic"),
};

const ThemeContext = createContext({
  palette: DEFAULT_PALETTE,
  skin: "classic",
  isSignal: false,
  motionLevel: "Calm",
  reduceMotion: false,
  redState: false,
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
  const look = useSelector((s) => s.look);
  const nervous = useSelector((s) => s.home.nervousState);
  // The OS setting always wins over the user's motion pick (WCAG 2.3.3).
  const reduceMotion = useReducedMotion();

  const value = useMemo(() => {
    const isSignal = look.skin === "signal";
    const base = isSignal
      ? resolveSignalPalette(look.signal)
      : resolveClassicPalette({ theme: tweaks.theme, accent: tweaks.accent });
    const palette = { ...base, fonts: fontsFor(look.skin, base.type) };

    return {
      palette,
      skin: isSignal ? "signal" : "classic",
      isSignal,
      motionLevel: effectiveMotion(palette.motion.level, reduceMotion),
      reduceMotion: Boolean(reduceMotion),
      // Red state calms every background field (docs/PLATFORM-PLAN.md §7).
      redState: nervous === "red",
      readerFontFamily: fontFor(tweaks.readerFont),
      readerFontSize: tweaks.fontSize,
      readerLineHeight: tweaks.lineSpacing,
      readerExtraLetterSpacing: tweaks.readerFont === "dyslexic",
      isLight: !palette.dark,
    };
  }, [
    look.skin,
    look.signal,
    nervous,
    reduceMotion,
    tweaks.accent,
    tweaks.fontSize,
    tweaks.lineSpacing,
    tweaks.readerFont,
    tweaks.theme,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Render a subtree in a PROPOSED appearance (the studio's preview card,
// Pal builder stage, Arrange home's mini phone) without touching the store.
// Same context shape as ThemeProvider; the OS reduce-motion switch, red state
// and reader settings carry over from the real theme.
export function ThemeOverride({ appearance, children }) {
  const parent = useContext(ThemeContext);
  const value = useMemo(() => {
    const a = normalizeAppearance(appearance);
    const base = resolveAppearancePalette(a);
    const palette = { ...base, fonts: fontsFor(a.skin, base.type) };
    return {
      ...parent,
      palette,
      skin: a.skin,
      isSignal: a.skin === "signal",
      motionLevel: effectiveMotion(palette.motion.level, parent.reduceMotion),
      isLight: !palette.dark,
    };
  }, [appearance, parent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function usePalette() {
  return useContext(ThemeContext).palette;
}

export function useTypeRoles() {
  return useContext(ThemeContext).palette.fonts;
}
