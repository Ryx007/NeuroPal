// GENERATED from packages/tokens/src — do not edit here.
// Change packages/tokens, then run: node packages/tokens/scripts/sync.js
import { contrastRatio, fitContrast, hexToRgb, rgbToHex } from "./color.js";
import { CLASSIC_ACCENT_NAMES, CLASSIC_ACCENT_VARIANTS, CLASSIC_SHAPE, CLASSIC_THEMES, CLASSIC_THEME_NAMES } from "./tokens.js";

export function normalizeClassic(input = {}) {
  const theme = CLASSIC_THEME_NAMES.includes(input.theme) ? input.theme : "dark";
  const accent = CLASSIC_ACCENT_NAMES.includes(input.accent) ? input.accent : "ruby";
  return { theme, accent };
}

// Exactly the original palette.js#resolvePalette — the Material-style token
// map every existing screen consumes. Kept byte-for-byte compatible.
export function resolveClassicTokens(theme, accent) {
  const base = CLASSIC_THEMES[theme] || CLASSIC_THEMES.dark;
  if (theme === "contrast") return { ...base };
  const variants = CLASSIC_ACCENT_VARIANTS[theme] || {};
  const chosen = variants[accent] || (accent === "ruby" ? null : variants.ruby) || null;
  return chosen ? { ...base, ...chosen } : { ...base, ...(variants.ruby || {}) };
}

// Classic tokens + the skin-neutral extras that skin-aware components read
// (shape, motion, field…). Classic's answers reproduce the original look.
export function resolveClassicPalette(input = {}) {
  const { theme, accent } = normalizeClassic(input);
  const t = resolveClassicTokens(theme, accent);
  const dark = theme === "dark" || theme === "contrast";
  const surf = hexToRgb(t.surfaceContainer);
  const accText = fitContrast(hexToRgb(t.accent), surf);
  const ratio = Math.min(contrastRatio(hexToRgb(t.onPrimary), hexToRgb(t.primary)), contrastRatio(accText, surf));
  return {
    ...t,
    skin: "classic",
    theme,
    accentName: accent,
    dark,
    accentFill: t.primary,
    accentInk: t.onPrimary,
    accentDeep: t.primaryContainer,
    accentText: rgbToHex(accText),
    line: t.outlineVariant,
    control: t.outline,
    shadowColor: "#000000",
    panelColor: t.surfaceContainer,
    panelAlpha: CLASSIC_SHAPE.glassAlpha,
    grid: "#000000",
    gridAlpha: 0,
    palBody: dark ? "#E4E2E1" : "#FFFFFF",
    shape: {
      radius: CLASSIC_SHAPE.radius,
      radiusMedium: CLASSIC_SHAPE.radiusMedium,
      radiusControl: CLASSIC_SHAPE.radiusControl,
      border: CLASSIC_SHAPE.border,
      shadow: CLASSIC_SHAPE.shadow,
    },
    motion: { level: "Calm", speed: 0.35 },
    field: "None",
    texture: "None",
    type: "Classic",
    ratio: Math.round(ratio * 10) / 10,
  };
}
