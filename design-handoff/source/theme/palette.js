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

// Accent variants per theme. Every theme except `contrast` (whose colors
// are fixed for maximum legibility) honors the accent choice; the dark base
// is already ruby, and any legacy persisted "blue" resolves to the default.
const ACCENT_VARIANTS = {
  dark: {
    cyan: {
      accent: "#A6E6FF",
      accentGlow: "rgba(166,230,255,0.25)",
      primary: "#A6E6FF",
      primaryContainer: "#00566B",
      onPrimary: "#003543",
    },
    purple: {
      accent: "#D6BAFF",
      accentGlow: "rgba(214,186,255,0.25)",
      primary: "#D6BAFF",
      primaryContainer: "#5F07BC",
      onPrimary: "#280057",
    },
    green: {
      accent: "#B9E6A8",
      accentGlow: "rgba(185,230,168,0.22)",
      primary: "#B9E6A8",
      primaryContainer: "#1F5A12",
      onPrimary: "#0F2D08",
    },
  },
  light: {
    ruby: {
      accent: "#B00030",
      accentGlow: "rgba(176,0,48,0.12)",
      primary: "#B00030",
      primaryContainer: "#FFD9DD",
      onPrimary: "#FFFFFF",
      secondary: "#8E3A50",
      tertiary: "#8A6D1F",
    },
    cyan: {
      accent: "#006A7A",
      accentGlow: "rgba(0,106,122,0.12)",
      primary: "#006A7A",
      primaryContainer: "#B8EAF5",
      onPrimary: "#FFFFFF",
    },
    purple: {
      accent: "#6B2FBF",
      accentGlow: "rgba(107,47,191,0.12)",
      primary: "#6B2FBF",
      primaryContainer: "#E9DDFF",
      onPrimary: "#FFFFFF",
    },
    green: {
      accent: "#2E6B1F",
      accentGlow: "rgba(46,107,31,0.12)",
      primary: "#2E6B1F",
      primaryContainer: "#CDEEC0",
      onPrimary: "#FFFFFF",
    },
  },
  sepia: {
    ruby: {
      accent: "#8E1030",
      accentGlow: "rgba(142,16,48,0.14)",
      primary: "#8E1030",
      primaryContainer: "#E8B9C2",
      onPrimary: "#FFFFFF",
      secondary: "#7A3B4C",
      tertiary: "#7A5A1F",
    },
    cyan: {
      accent: "#0F5E6B",
      accentGlow: "rgba(15,94,107,0.14)",
      primary: "#0F5E6B",
      primaryContainer: "#BFDDE2",
      onPrimary: "#FFFFFF",
    },
    purple: {
      accent: "#5E3A8E",
      accentGlow: "rgba(94,58,142,0.14)",
      primary: "#5E3A8E",
      primaryContainer: "#D9CCE8",
      onPrimary: "#FFFFFF",
    },
    green: {
      accent: "#4A6B2A",
      accentGlow: "rgba(74,107,42,0.14)",
      primary: "#4A6B2A",
      primaryContainer: "#D2E2BE",
      onPrimary: "#FFFFFF",
    },
  },
};

export function resolvePalette(theme, accent) {
  const base = THEMES[theme];
  if (theme === "contrast") return base;

  const variants = ACCENT_VARIANTS[theme] || {};
  // Dark's base IS ruby; light/sepia bases are neutral-blue, so ruby is an
  // explicit variant there. Unknown/legacy accents fall back to ruby.
  const chosen = variants[accent] || (accent === "ruby" ? null : variants.ruby) || null;
  return chosen ? { ...base, ...chosen } : { ...base, ...(variants.ruby || {}) };
}

export const DEFAULT_PALETTE = dark;
