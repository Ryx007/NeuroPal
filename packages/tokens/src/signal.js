import { contrastRatio, fitContrast, hexToRgb, inkFor, isHex, mix, rgbToHex, withAlpha } from "./color.js";
import {
  SIGNAL_ACCENTS,
  SIGNAL_BASES,
  SIGNAL_BRUTALITY,
  SIGNAL_CORNERS,
  SIGNAL_DEFAULT,
  SIGNAL_EXTRA_ACCENT_NAMES,
  SIGNAL_MOTION_SPEED,
  SIGNAL_OPTIONS,
  SIGNAL_PRESETS,
} from "./tokens.js";

const KEYS = ["acc", "base", "motion", "field", "brutality", "corners", "texture", "type"];

// Coerce anything (old saves, server payloads, user typing) into a valid
// Signal setting. Unknown values fall back to the default, never throw.
export function normalizeSignal(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...SIGNAL_DEFAULT };
  if (isHex(src.acc)) out.acc = rgbToHex(hexToRgb(src.acc));
  for (const k of ["base", "motion", "field", "corners", "texture", "type"]) {
    if (SIGNAL_OPTIONS[k].includes(src[k])) out[k] = src[k];
  }
  const b = Math.round(Number(src.brutality));
  if (Number.isFinite(b) && b >= 0 && b <= 3) out.brutality = b;
  return out;
}

export function sameSignal(a, b) {
  const x = normalizeSignal(a);
  const y = normalizeSignal(b);
  return KEYS.every((k) => String(x[k]).toUpperCase() === String(y[k]).toUpperCase());
}

export function accentName(hex) {
  const H = String(hex || "").toUpperCase();
  if (SIGNAL_EXTRA_ACCENT_NAMES[H]) return SIGNAL_EXTRA_ACCENT_NAMES[H];
  const hit = SIGNAL_ACCENTS.find((a) => a.hex === H);
  return hit ? hit.name : H;
}

export function matchPreset(sig) {
  return Object.keys(SIGNAL_PRESETS).find((name) => sameSignal(SIGNAL_PRESETS[name], sig)) || null;
}

// Signal settings → the same Material-style token names Classic produces,
// plus skin extras. Every text colour is contrast-fitted (≥ 4.6:1).
export function resolveSignalPalette(input = {}) {
  const s = normalizeSignal(input);
  const B = SIGNAL_BASES[s.base];
  const acc = hexToRgb(s.acc);
  const container = hexToRgb(B.surfaceContainer);
  const surface = hexToRgb(B.surface);
  // Accent used AS TEXT must read on both the page and the panels.
  const accText = fitContrast(fitContrast(acc, container), surface);
  const ink = inkFor(acc);
  const deep = mix(acc, [0, 0, 0], 0.5);
  const R = SIGNAL_CORNERS[s.corners];
  const ratio = Math.min(contrastRatio(ink, acc), contrastRatio(accText, container), contrastRatio(accText, surface));
  return {
    surface: B.surface,
    surfaceLowest: B.surfaceLowest,
    surfaceLow: B.surfaceLow,
    surfaceContainer: B.surfaceContainer,
    surfaceHigh: B.surfaceHigh,
    surfaceHighest: B.surfaceHighest,
    onSurface: B.onSurface,
    onSurfaceVariant: B.onSurfaceVariant,
    outline: B.outline,
    outlineVariant: B.outlineVariant,
    primary: s.acc,
    primaryContainer: rgbToHex(deep),
    onPrimary: rgbToHex(ink),
    secondary: B.secondary,
    tertiary: B.tertiary,
    error: B.error,
    warn: B.warn,
    accent: rgbToHex(accText),
    accentGlow: withAlpha(s.acc, 0.3),
    skin: "signal",
    settings: s,
    dark: B.dark,
    accentFill: s.acc,
    accentInk: rgbToHex(ink),
    accentDeep: rgbToHex(deep),
    accentText: rgbToHex(accText),
    line: B.line,
    control: B.control,
    shadowColor: B.shadow,
    panelColor: B.surfaceContainer,
    panelAlpha: B.panelAlpha,
    grid: B.grid,
    gridAlpha: B.gridAlpha,
    palBody: B.palBody,
    shape: {
      radius: R,
      radiusMedium: Math.round(R * 0.72),
      radiusControl: Math.round(R * 0.72),
      border: SIGNAL_BRUTALITY.border[s.brutality],
      shadow: SIGNAL_BRUTALITY.shadow[s.brutality],
    },
    motion: { level: s.motion, speed: SIGNAL_MOTION_SPEED[s.motion] },
    field: s.field,
    texture: s.texture,
    type: s.type,
    ratio: Math.round(ratio * 10) / 10,
  };
}

// The device's reduce-motion setting always wins over the user's motion pick.
export function effectiveMotion(level, reduceMotion) {
  return reduceMotion ? "Still" : level;
}
