// Font roles per skin. Screens never name a font file directly: they use
// palette.fonts.<role> (body, bodyMedium, bodySemi, bodyBold, display,
// displaySemi, mono, label) so switching skin re-types the whole app.
// Reader fonts (the user's reading-font choice) are separate and skin-free:
// see ThemeProvider#fontFor.

export const CLASSIC_FONTS = {
  display: "SpaceGrotesk_700Bold",
  displaySemi: "SpaceGrotesk_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_400Regular",
  label: "JetBrainsMono_400Regular",
};

// Signal type option → display face. React Native can't drive a variable
// font's width axis, so "Wide" and "Condensed" are static instances of
// Archivo (semi-expanded 112.5% Black, condensed 75% ExtraBold).
const SIGNAL_DISPLAY = {
  Wide: "ArchivoSemiExpanded_900",
  Condensed: "ArchivoCondensed_800",
  Grotesk: "SpaceGrotesk_700Bold",
};

export function fontsFor(skin, type) {
  if (skin !== "signal") return CLASSIC_FONTS;
  return {
    display: SIGNAL_DISPLAY[type] || SIGNAL_DISPLAY.Wide,
    displaySemi: type === "Grotesk" ? "SpaceGrotesk_600SemiBold" : "Archivo_700Bold",
    body: "AtkinsonNext_400",
    bodyMedium: "AtkinsonNext_500",
    bodySemi: "AtkinsonNext_600",
    bodyBold: "AtkinsonNext_700",
    mono: "AtkinsonMono_400",
    label: "AtkinsonMono_700",
  };
}

// Registered in App.js next to the Classic Google-font packages.
export const SIGNAL_FONT_ASSETS = {
  ArchivoSemiExpanded_900: require("../../assets/fonts/Archivo-SemiExpanded-Black.ttf"),
  ArchivoCondensed_800: require("../../assets/fonts/Archivo-Condensed-ExtraBold.ttf"),
  Archivo_700Bold: require("../../assets/fonts/Archivo-Bold.ttf"),
  Archivo_900Black: require("../../assets/fonts/Archivo-Black.ttf"),
  AtkinsonNext_400: require("../../assets/fonts/AtkinsonHyperlegibleNext-400.ttf"),
  AtkinsonNext_500: require("../../assets/fonts/AtkinsonHyperlegibleNext-500.ttf"),
  AtkinsonNext_600: require("../../assets/fonts/AtkinsonHyperlegibleNext-600.ttf"),
  AtkinsonNext_700: require("../../assets/fonts/AtkinsonHyperlegibleNext-700.ttf"),
  AtkinsonMono_400: require("../../assets/fonts/AtkinsonHyperlegibleMono-400.ttf"),
  AtkinsonMono_700: require("../../assets/fonts/AtkinsonHyperlegibleMono-700.ttf"),
};
