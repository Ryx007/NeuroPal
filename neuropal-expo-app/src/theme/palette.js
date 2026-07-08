// Dark base — Ruby Red family (owner's pick, 2026-07-08): ruby accent with
// rose secondary and gold tertiary. Neutral greys got warmed slightly so
// the old blue-tinted text colors don't fight the red accent.
const dark = {
  surface: "#131313",
  surfaceLow: "#1B1C1C",
  surfaceContainer: "#1F2020",
  surfaceHigh: "#2A2A2A",
  surfaceHighest: "#353535",
  surfaceLowest: "#0E0E0E",
  onSurface: "#E4E2E1",
  onSurfaceVariant: "#D0C6C8",
  outline: "#9F8D91",
  outlineVariant: "#534347",
  primary: "#FF7F8E",
  primaryContainer: "#8E1030",
  onPrimary: "#4A0316",
  secondary: "#FFAFC1",
  tertiary: "#F3C77B",
  error: "#FFB4AB",
  warn: "#FFD27A",
  accent: "#FF7F8E",
  accentGlow: "rgba(255,127,142,0.25)",
};

const sepia = {
  surface: "#F3EBDD",
  surfaceLow: "#EDE4D2",
  surfaceContainer: "#E8DEC9",
  surfaceHigh: "#DDD1B8",
  surfaceHighest: "#D1C3A5",
  surfaceLowest: "#F8F1E3",
  onSurface: "#2A2418",
  onSurfaceVariant: "#5A4E35",
  outline: "#8A7B5C",
  outlineVariant: "#BBA985",
  primary: "#8A5A1F",
  primaryContainer: "#C08A4A",
  onPrimary: "#FFFFFF",
  secondary: "#5E7A3F",
  tertiary: "#8A4A6A",
  error: "#B3261E",
  warn: "#B07C2A",
  accent: "#8A5A1F",
  accentGlow: "rgba(138,90,31,0.15)",
};

const light = {
  surface: "#FAFAF7",
  surfaceLow: "#F1F1ED",
  surfaceContainer: "#EAEAE5",
  surfaceHigh: "#DEDCD4",
  surfaceHighest: "#CECBC2",
  surfaceLowest: "#FFFFFF",
  onSurface: "#1A1A1A",
  onSurfaceVariant: "#505058",
  outline: "#767680",
  outlineVariant: "#C5C5CD",
  primary: "#1357C9",
  primaryContainer: "#B1C5FF",
  onPrimary: "#FFFFFF",
  secondary: "#007A8C",
  tertiary: "#5F07BC",
  error: "#BA1A1A",
  warn: "#B07C2A",
  accent: "#1357C9",
  accentGlow: "rgba(19,87,201,0.12)",
};

const contrast = {
  surface: "#000000",
  surfaceLow: "#0A0A0A",
  surfaceContainer: "#141414",
  surfaceHigh: "#1F1F1F",
  surfaceHighest: "#2A2A2A",
  surfaceLowest: "#000000",
  onSurface: "#FFFFFF",
  onSurfaceVariant: "#E0E0E0",
  outline: "#FFFFFF",
  outlineVariant: "#808080",
  primary: "#FFFF00",
  primaryContainer: "#FFD700",
  onPrimary: "#000000",
  secondary: "#00FFFF",
  tertiary: "#FF80FF",
  error: "#FF5555",
  warn: "#FFD700",
  accent: "#FFFF00",
  accentGlow: "rgba(255,255,0,0.3)",
};

const THEMES = {
  dark,
  sepia,
  light,
  contrast,
};

export function resolvePalette(theme, accent) {
  const base = THEMES[theme];

  if (theme !== "dark") {
    return base;
  }

  // Default (and "ruby", and any legacy persisted "blue") → the ruby base.
  switch (accent) {
    case "cyan":
      return {
        ...base,
        accent: "#A6E6FF",
        accentGlow: "rgba(166,230,255,0.25)",
        primary: "#A6E6FF",
        primaryContainer: "#00566B",
        onPrimary: "#003543",
      };
    case "purple":
      return {
        ...base,
        accent: "#D6BAFF",
        accentGlow: "rgba(214,186,255,0.25)",
        primary: "#D6BAFF",
        primaryContainer: "#5F07BC",
        onPrimary: "#280057",
      };
    case "green":
      return {
        ...base,
        accent: "#B9E6A8",
        accentGlow: "rgba(185,230,168,0.22)",
        primary: "#B9E6A8",
        primaryContainer: "#1F5A12",
        onPrimary: "#0F2D08",
      };
    default:
      return base;
  }
}

export const DEFAULT_PALETTE = dark;
