// NeuroPal design tokens — the single source of truth for every client.
//
//   Classic = the original NeuroPal look (4 themes × 4 accents), copied
//             verbatim from neuropal-expo-app/src/theme/palette.js. Do not
//             "improve" these values: Classic is kept exactly as designed.
//   Signal  = the brutal-glass skin (v2). Red on graphite by default; every
//             value below is a user setting in the Make-it-yours studio.
//
// Edit HERE, then run `node packages/tokens/scripts/sync.js` to regenerate
// the copies inside each app (Expo JS, web JS, Flutter Dart, Swift, CSS).

export const TOKENS_VERSION = 2;

// ---------------------------------------------------------------- Classic --
export const CLASSIC_THEMES = {
  dark: {
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
  },
  sepia: {
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
  },
  light: {
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
  },
  contrast: {
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
  },
};

// Accent variants per theme. Contrast ignores accents (fixed colours); the
// dark base already IS ruby; unknown/legacy accents fall back to ruby.
export const CLASSIC_ACCENT_VARIANTS = {
  dark: {
    cyan: { accent: "#A6E6FF", accentGlow: "rgba(166,230,255,0.25)", primary: "#A6E6FF", primaryContainer: "#00566B", onPrimary: "#003543" },
    purple: { accent: "#D6BAFF", accentGlow: "rgba(214,186,255,0.25)", primary: "#D6BAFF", primaryContainer: "#5F07BC", onPrimary: "#280057" },
    green: { accent: "#B9E6A8", accentGlow: "rgba(185,230,168,0.22)", primary: "#B9E6A8", primaryContainer: "#1F5A12", onPrimary: "#0F2D08" },
  },
  light: {
    ruby: { accent: "#B00030", accentGlow: "rgba(176,0,48,0.12)", primary: "#B00030", primaryContainer: "#FFD9DD", onPrimary: "#FFFFFF", secondary: "#8E3A50", tertiary: "#8A6D1F" },
    cyan: { accent: "#006A7A", accentGlow: "rgba(0,106,122,0.12)", primary: "#006A7A", primaryContainer: "#B8EAF5", onPrimary: "#FFFFFF" },
    purple: { accent: "#6B2FBF", accentGlow: "rgba(107,47,191,0.12)", primary: "#6B2FBF", primaryContainer: "#E9DDFF", onPrimary: "#FFFFFF" },
    green: { accent: "#2E6B1F", accentGlow: "rgba(46,107,31,0.12)", primary: "#2E6B1F", primaryContainer: "#CDEEC0", onPrimary: "#FFFFFF" },
  },
  sepia: {
    ruby: { accent: "#8E1030", accentGlow: "rgba(142,16,48,0.14)", primary: "#8E1030", primaryContainer: "#E8B9C2", onPrimary: "#FFFFFF", secondary: "#7A3B4C", tertiary: "#7A5A1F" },
    cyan: { accent: "#0F5E6B", accentGlow: "rgba(15,94,107,0.14)", primary: "#0F5E6B", primaryContainer: "#BFDDE2", onPrimary: "#FFFFFF" },
    purple: { accent: "#5E3A8E", accentGlow: "rgba(94,58,142,0.14)", primary: "#5E3A8E", primaryContainer: "#D9CCE8", onPrimary: "#FFFFFF" },
    green: { accent: "#4A6B2A", accentGlow: "rgba(74,107,42,0.14)", primary: "#4A6B2A", primaryContainer: "#D2E2BE", onPrimary: "#FFFFFF" },
  },
};

export const CLASSIC_THEME_NAMES = ["dark", "sepia", "light", "contrast"];
export const CLASSIC_ACCENT_NAMES = ["ruby", "cyan", "purple", "green"];

// Classic shape language: liquid glass, big radii, pill controls.
export const CLASSIC_SHAPE = { radius: 24, radiusControl: 999, radiusMedium: 18, border: 1, shadow: 0, glassAlpha: 0.82, blur: 40 };

// ----------------------------------------------------------------- Signal --
// Bases carry the full surface ladder so existing screens (which speak the
// Material-style token names above) restyle without code changes.
export const SIGNAL_BASES = {
  Graphite: {
    dark: true,
    surface: "#141416", surfaceLowest: "#0C0C0E", surfaceLow: "#19191C", surfaceContainer: "#1E1E22", surfaceHigh: "#2A2A30", surfaceHighest: "#36363D",
    onSurface: "#F2F2F0", onSurfaceVariant: "#C4C4CB", outline: "#ADADB6", outlineVariant: "#55555E",
    line: "#55555E", control: "#C4C4CB", shadow: "#000000", panelAlpha: 0.66,
    grid: "#FFFFFF", gridAlpha: 0.05, palBody: "#E4E4E8",
    secondary: "#8FD9B6", tertiary: "#E9D98B", error: "#FFB547", warn: "#FFC54D",
  },
  Concrete: {
    dark: false,
    surface: "#D9D9D4", surfaceLowest: "#F7F7F4", surfaceLow: "#E6E6E2", surfaceContainer: "#F2F2EE", surfaceHigh: "#CFCFCA", surfaceHighest: "#C2C2BC",
    onSurface: "#141416", onSurfaceVariant: "#3A3A40", outline: "#4E4E56", outlineVariant: "#141416",
    line: "#141416", control: "#141416", shadow: "#141416", panelAlpha: 0.74,
    grid: "#000000", gridAlpha: 0.07, palBody: "#FFFFFF",
    secondary: "#18563A", tertiary: "#5E4D00", error: "#753F00", warn: "#6C4500",
  },
  Black: {
    dark: true,
    surface: "#000000", surfaceLowest: "#000000", surfaceLow: "#0B0B0C", surfaceContainer: "#121214", surfaceHigh: "#1E1E22", surfaceHighest: "#2A2A2F",
    onSurface: "#F2F2F0", onSurfaceVariant: "#C4C4CB", outline: "#ADADB6", outlineVariant: "#46464E",
    line: "#46464E", control: "#C4C4CB", shadow: "#26262C", panelAlpha: 0.78,
    grid: "#FFFFFF", gridAlpha: 0.045, palBody: "#D9D9DE",
    secondary: "#8FD9B6", tertiary: "#E9D98B", error: "#FFB547", warn: "#FFC54D",
  },
  Warm: {
    dark: true,
    surface: "#1A1614", surfaceLowest: "#120F0E", surfaceLow: "#201B19", surfaceContainer: "#26201D", surfaceHigh: "#332B27", surfaceHighest: "#3F3631",
    onSurface: "#F4EEE9", onSurfaceVariant: "#CFC5BD", outline: "#B3A79E", outlineVariant: "#5E534D",
    line: "#5E534D", control: "#CFC5BD", shadow: "#000000", panelAlpha: 0.68,
    grid: "#FFF0E6", gridAlpha: 0.05, palBody: "#F1E6DC",
    secondary: "#9FDDBA", tertiary: "#EDD98F", error: "#FFB547", warn: "#FFC54D",
  },
};

export const SIGNAL_ACCENTS = [
  { name: "Signal red", hex: "#FF3D2E" },
  { name: "Ember", hex: "#FF6A1A" },
  { name: "Amber", hex: "#FFB21A" },
  { name: "Green", hex: "#3DDC84" },
  { name: "Cyan", hex: "#2EC7F0" },
  { name: "Violet", hex: "#8B5CFF" },
  { name: "Pink", hex: "#FF4FA3" },
];
// Accents that only appear inside presets.
export const SIGNAL_EXTRA_ACCENT_NAMES = { "#E5261F": "Brick red" };

export const SIGNAL_OPTIONS = {
  base: ["Graphite", "Concrete", "Black", "Warm"],
  motion: ["Still", "Calm", "Lively", "Wild"],
  field: ["Chladni", "Interference", "Grid", "None"],
  brutality: [0, 1, 2, 3],
  corners: ["Sharp", "Soft", "Round"],
  texture: ["Grain", "Scanlines", "None"],
  type: ["Wide", "Condensed", "Grotesk"],
};

export const SIGNAL_CORNERS = { Sharp: 3, Soft: 14, Round: 26 };
export const SIGNAL_BRUTALITY = { border: [0, 1, 2, 3], shadow: [0, 2, 5, 8] };
// Field animation speed multipliers per motion level.
export const SIGNAL_MOTION_SPEED = { Still: 0, Calm: 0.35, Lively: 1, Wild: 1.9 };
// Red state ("Overwhelmed") calms every field regardless of the setting.
export const RED_STATE_FIELD = { speed: 0.3, amplitude: 0.45 };

export const SIGNAL_DEFAULT = {
  acc: "#FF3D2E", base: "Graphite", motion: "Lively", field: "Chladni",
  brutality: 2, corners: "Soft", texture: "Grain", type: "Wide",
};

export const SIGNAL_PRESETS = {
  Signal: { ...SIGNAL_DEFAULT },
  Ember: { acc: "#FF6A1A", base: "Warm", motion: "Calm", field: "Interference", brutality: 2, corners: "Round", texture: "Grain", type: "Wide" },
  Concrete: { acc: "#E5261F", base: "Concrete", motion: "Calm", field: "Grid", brutality: 3, corners: "Sharp", texture: "None", type: "Condensed" },
  "Night lab": { acc: "#FF3D2E", base: "Black", motion: "Still", field: "Interference", brutality: 1, corners: "Soft", texture: "Scanlines", type: "Grotesk" },
  UV: { acc: "#8B5CFF", base: "Graphite", motion: "Wild", field: "Interference", brutality: 3, corners: "Sharp", texture: "Scanlines", type: "Wide" },
};

// Saved looks — the user switches between them; Pal may only SUGGEST one.
export const LOOKS = {
  signal: {
    Everyday: { sig: { ...SIGNAL_DEFAULT }, desc: "your default Signal setup." },
    Evening: { sig: { acc: "#FF3D2E", base: "Black", motion: "Calm", field: "Interference", brutality: 1, corners: "Soft", texture: "None", type: "Wide" }, desc: "black base, calm motion, no texture." },
    Lab: { sig: { ...SIGNAL_PRESETS.Concrete }, desc: "light concrete, sharp edges, high contrast for bright rooms." },
    Overwhelmed: { sig: { acc: "#FF3D2E", base: "Graphite", motion: "Still", field: "None", brutality: 1, corners: "Round", texture: "None", type: "Wide" }, desc: "nothing moves, no background, soft edges." },
  },
  classic: {
    Everyday: { theme: "dark", accent: "ruby", desc: "Dark with Ruby, the original look." },
    Evening: { theme: "sepia", accent: "ruby", desc: "Sepia, warmer and lower glare." },
    Lab: { theme: "light", accent: "cyan", desc: "Light with Cyan for bright rooms." },
    Overwhelmed: { theme: "dark", accent: "green", desc: "Dark with a quiet green accent." },
  },
};

// Logical type roles. Each client maps these to its own font assets.
export const TYPE_ROLES = {
  classic: {
    display: { family: "Space Grotesk", weight: 700 },
    displaySemi: { family: "Space Grotesk", weight: 600 },
    body: { family: "Inter", weight: 400 },
    bodyMedium: { family: "Inter", weight: 500 },
    bodySemi: { family: "Inter", weight: 600 },
    bodyBold: { family: "Inter", weight: 700 },
    mono: { family: "JetBrains Mono", weight: 400 },
    label: { family: "JetBrains Mono", weight: 400 },
  },
  signal: {
    display: { family: "Archivo", weight: 900, width: 112 },
    displaySemi: { family: "Archivo", weight: 700, width: 100 },
    body: { family: "Atkinson Hyperlegible Next", weight: 400 },
    bodyMedium: { family: "Atkinson Hyperlegible Next", weight: 500 },
    bodySemi: { family: "Atkinson Hyperlegible Next", weight: 600 },
    bodyBold: { family: "Atkinson Hyperlegible Next", weight: 700 },
    mono: { family: "Atkinson Hyperlegible Mono", weight: 400 },
    label: { family: "Atkinson Hyperlegible Mono", weight: 700 },
  },
};

// ------------------------------------------------------------------ Pal ----
export const PAL_OPTIONS = {
  shape: { Pebble: "46% 54% 50% 50% / 58% 58% 42% 42%", Bean: "62% 38% 54% 46% / 48% 62% 38% 52%", Box: "18%", Moon: "50%" },
  colour: { Chalk: "#E4E4E8", Bone: "#F1E6DC", Graphite: "#3A3A40", Red: "#FF3D2E", Mint: "#8FE3C0", Lilac: "#C9B8FF" },
  eyes: ["Visor", "Dots", "Sleepy", "Wide"],
  mouth: ["None", "Smile", "Flat", "Oh"],
  extra: ["None", "Headphones", "Lab goggles", "Scarf", "Antenna"],
  talk: {
    Gentle: "No rush. Want to try two minutes on {task}?",
    Direct: "Two minutes on {task}. Start now?",
    Nerdy: "Let’s collapse the to-do superposition: two minutes on {task}?",
  },
  // [rate, pitch] for on-device speech.
  voice: { Soft: [0.95, 1.1], Bright: [1.05, 1.35], Low: [0.92, 0.75] },
};

export const PAL_DEFAULT = {
  name: "Pal", shape: "Pebble", colour: "Chalk", eyes: "Visor", mouth: "Smile",
  extra: "Headphones", talk: "Gentle", voice: "Soft", people: true,
};

// ----------------------------------------------------------------- Home ----
// Tiles the Home screen knows how to render, in default order. `hidden`
// tiles stay in the arranger list so they can be brought back.
export const HOME_TILES = {
  state: { name: "State check-in", short: "CHECK-IN", words: ["state", "check-in", "checkin", "check in", "mood", "how are you", "feelings"] },
  anchor: { name: "Next anchor", short: "ANCHOR", words: ["anchor", "anchors", "schedule", "next up", "calendar"] },
  focus: { name: "Focus", short: "FOCUS", words: ["focus", "sound", "music", "noise", "soundscape", "timer", "pomodoro"] },
  mvd: { name: "Minimum day", short: "MIN. DAY", words: ["minimum", "mvd", "tasks", "to-do", "todo", "to do"] },
  reading: { name: "Resume reading", short: "READING", words: ["reading", "reader", "read", "paper", "papers", "book", "books"] },
  pal: { name: "Pal’s note", short: "PAL", words: ["pal", "pals", "note", "notes"] },
};

export const HOME_DEFAULT = {
  tiles: [
    { id: "state", size: "L", hidden: false },
    { id: "anchor", size: "M", hidden: false },
    { id: "focus", size: "M", hidden: false },
    { id: "mvd", size: "L", hidden: false },
    { id: "reading", size: "M", hidden: false },
    { id: "pal", size: "S", hidden: false },
  ],
  rules: [],
};

// Classic's Home before anyone arranges it: exactly the pre-v2 screen
// (check-in, minimum day, next anchor, resume reading; no Focus or Pal tiles).
export const CLASSIC_HOME_DEFAULT = {
  tiles: [
    { id: "state", size: "L", hidden: false },
    { id: "mvd", size: "L", hidden: false },
    { id: "anchor", size: "M", hidden: false },
    { id: "reading", size: "M", hidden: false },
    { id: "focus", size: "M", hidden: true },
    { id: "pal", size: "S", hidden: true },
  ],
  rules: [],
};

export const HOME_SIZES = ["S", "M", "L"];
export const HOME_RULE_SCOPES = ["Weekdays", "Weekends"];
export const HOME_RULE_ACTS = ["first", "last", "hide"];
