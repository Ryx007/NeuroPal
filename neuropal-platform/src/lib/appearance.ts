// Typed facade over the design-token package.
//
// src/lib/tokens/*.js is GENERATED from packages/tokens (run `npm run tokens`)
// and is the single source of truth for every value and rule: palettes,
// auto-contrast, presets, saved looks, the Ask-Pal interpreter, diffs.
// This file only adds TypeScript types and the web-specific mapping from a
// resolved palette to CSS custom properties and data-* attributes.
import * as Generated from "./tokens/index.js";

export type Skin = "classic" | "signal";
export type ClassicTheme = "dark" | "sepia" | "light" | "contrast";
export type ClassicAccent = "ruby" | "cyan" | "purple" | "green";
export type SignalBase = "Graphite" | "Concrete" | "Black" | "Warm";
export type Motion = "Still" | "Calm" | "Lively" | "Wild";
export type Field = "Chladni" | "Interference" | "Grid" | "None";
export type Corners = "Sharp" | "Soft" | "Round";
export type Texture = "Grain" | "Scanlines" | "None";
export type TypeStyle = "Wide" | "Condensed" | "Grotesk";

export interface SignalSettings {
  acc: string;
  base: SignalBase;
  motion: Motion;
  field: Field;
  brutality: number;
  corners: Corners;
  texture: Texture;
  type: TypeStyle;
}

export interface ClassicSettings {
  theme: ClassicTheme;
  accent: ClassicAccent;
}

export interface Appearance {
  v: number;
  skin: Skin;
  classic: ClassicSettings;
  signal: SignalSettings;
  suggestLooks: boolean;
  pal: Record<string, unknown>;
  home: {
    tiles: { id: string; size: string; hidden: boolean }[];
    rules: { scope: string; tile: string; act: string }[];
  };
  updatedAt: string | null;
}

export interface Palette {
  surface: string;
  surfaceLowest: string;
  surfaceLow: string;
  surfaceContainer: string;
  surfaceHigh: string;
  surfaceHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: string;
  primaryContainer: string;
  onPrimary: string;
  secondary: string;
  tertiary: string;
  error: string;
  warn: string;
  accent: string;
  accentGlow: string;
  skin: Skin;
  dark: boolean;
  accentFill: string;
  accentInk: string;
  accentDeep: string;
  accentText: string;
  line: string;
  control: string;
  shadowColor: string;
  panelColor: string;
  panelAlpha: number;
  grid: string;
  gridAlpha: number;
  palBody: string;
  shape: { radius: number; radiusMedium: number; radiusControl: number; border: number; shadow: number };
  motion: { level: string; speed: number };
  field: string;
  texture: string;
  type: string;
  ratio: number;
}

export interface DiffRow {
  k: string;
  from: string;
  to: string;
}

export type Interpretation = { next: Appearance; rows: DiffRow[] } | { error: string };

interface SignalBaseInfo {
  dark: boolean;
  surface: string;
  surfaceContainer: string;
  line: string;
  shadow: string;
}

// The generated module is untyped JavaScript. Everything that crosses into
// TypeScript is typed here, once.
const T = Generated as unknown as {
  normalizeAppearance(input: unknown): Appearance;
  resolveAppearancePalette(a: unknown): Palette;
  resolveSignalPalette(s: unknown): Palette;
  resolveClassicPalette(c: unknown): Palette;
  diffAppearance(a: unknown, b: unknown): DiffRow[];
  interpretAppearance(text: string, a: unknown): { next?: Appearance; rows?: DiffRow[]; error?: string };
  matchLook(a: unknown): string | null;
  applyLook(a: unknown, name: string): Appearance;
  lookDescription(skin: string, name: string): string;
  matchPreset(sig: unknown): string | null;
  accentName(hex: string): string;
  effectiveMotion(level: string, reduceMotion: boolean): Motion;
  hslToHex(h: number, s: number, l: number): string;
  hueOf(hex: string): number;
  isHex(value: unknown): boolean;
  SIGNAL_PRESETS: Record<string, SignalSettings>;
  SIGNAL_ACCENTS: { name: string; hex: string }[];
  SIGNAL_OPTIONS: {
    base: SignalBase[];
    motion: Motion[];
    field: Field[];
    brutality: number[];
    corners: Corners[];
    texture: Texture[];
    type: TypeStyle[];
  };
  SIGNAL_BASES: Record<SignalBase, SignalBaseInfo>;
  SIGNAL_DEFAULT: SignalSettings;
  SIGNAL_MOTION_SPEED: Record<Motion, number>;
  LOOKS: {
    signal: Record<string, { sig: SignalSettings; desc: string }>;
    classic: Record<string, { theme: ClassicTheme; accent: ClassicAccent; desc: string }>;
  };
  CLASSIC_THEME_NAMES: ClassicTheme[];
  CLASSIC_ACCENT_NAMES: ClassicAccent[];
};

export const SIGNAL_PRESETS = T.SIGNAL_PRESETS;
export const SIGNAL_ACCENTS = T.SIGNAL_ACCENTS;
export const SIGNAL_OPTIONS = T.SIGNAL_OPTIONS;
export const SIGNAL_BASES = T.SIGNAL_BASES;
export const SIGNAL_MOTION_SPEED = T.SIGNAL_MOTION_SPEED;
export const LOOKS = T.LOOKS;
export const CLASSIC_THEME_NAMES = T.CLASSIC_THEME_NAMES;
export const CLASSIC_ACCENT_NAMES = T.CLASSIC_ACCENT_NAMES;

export const normalizeAppearance = (input?: unknown): Appearance => T.normalizeAppearance(input ?? {});
export const resolvePalette = (a: Appearance): Palette => T.resolveAppearancePalette(a);
export const resolveSignalPalette = (s: SignalSettings): Palette => T.resolveSignalPalette(s);
export const resolveClassicPalette = (c: ClassicSettings): Palette => T.resolveClassicPalette(c);
export const diffAppearance = (a: Appearance, b: Appearance): DiffRow[] => T.diffAppearance(a, b);
export const matchLook = (a: Appearance): string | null => T.matchLook(a);
export const applyLook = (a: Appearance, name: string): Appearance => T.applyLook(a, name);
export const lookDescription = (skin: Skin, name: string): string => T.lookDescription(skin, name);
export const matchPreset = (s: SignalSettings): string | null => T.matchPreset(s);
export const accentName = (hex: string): string => T.accentName(hex);
export const effectiveMotion = (level: Motion, reduceMotion: boolean): Motion => T.effectiveMotion(level, reduceMotion);
export const hslToHex = (h: number, s: number, l: number): string => T.hslToHex(h, s, l);
export const hueOf = (hex: string): number => T.hueOf(hex);

export function interpretAppearance(text: string, a: Appearance): Interpretation {
  const r = T.interpretAppearance(text, a);
  if (r.next && r.rows) return { next: r.next, rows: r.rows };
  return { error: r.error || "I can’t map that yet." };
}

// The web platform's default skin is Signal (the shared normaliser defaults
// to Classic, which is right for the apps' existing users).
export const DEFAULT_APPEARANCE: Appearance = normalizeAppearance({ skin: "signal" });

export function sameLook(a: Appearance, b: Appearance): boolean {
  return diffAppearance(a, b).length === 0;
}

// ---------------------------------------------------------------- CSS ----
// Mirrors CSS_KEYS in packages/tokens/scripts/sync.js, so runtime values use
// exactly the variable names of the generated src/styles/tokens.css.
const CSS_KEYS = [
  "surface", "surfaceLowest", "surfaceLow", "surfaceContainer", "surfaceHigh", "surfaceHighest", "onSurface",
  "onSurfaceVariant", "outline", "outlineVariant", "primary", "onPrimary", "secondary", "tertiary", "error", "warn",
  "accent", "accentFill", "accentInk", "accentText", "accentDeep", "line", "control", "shadowColor", "panelColor", "grid",
] as const;

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function paletteVars(p: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CSS_KEYS) out[`--np-${kebab(k)}`] = String(p[k]);
  out["--np-panel-alpha"] = String(p.panelAlpha);
  out["--np-grid-alpha"] = String(p.gridAlpha);
  out["--np-radius"] = `${p.shape.radius}px`;
  out["--np-radius-control"] = `${p.shape.radiusControl}px`;
  out["--np-border"] = `${p.shape.border}px`;
  out["--np-shadow"] = `${p.shape.shadow}px`;
  // Web-only extra (not in the generated defaults; CSS falls back to Chalk).
  out["--np-pal-body"] = p.palBody;
  return out;
}

export const SKIN_ATTRIBUTES = ["data-skin", "data-theme", "data-dark", "data-type", "data-motion", "data-field", "data-texture"] as const;

// data-* attributes that select the skin's typography, texture and motion
// rules in globals.css. Any element carrying them (the <html> element, or a
// preview card) restyles its whole subtree.
export function skinAttributes(a: Appearance, p: Palette, reduceMotion: boolean): Record<string, string> {
  const signal = a.skin === "signal";
  return {
    "data-skin": a.skin,
    "data-theme": signal ? "signal" : a.classic.theme,
    "data-dark": p.dark ? "true" : "false",
    "data-type": signal ? a.signal.type : "Classic",
    "data-motion": signal ? effectiveMotion(a.signal.motion, reduceMotion) : reduceMotion ? "Still" : "Calm",
    "data-field": signal ? a.signal.field : "None",
    "data-texture": signal ? a.signal.texture : "None",
  };
}

export interface FieldSettings {
  mode: "Chladni" | "Interference";
  motion: Motion;
  speed: number;
  accent: string;
  base: string;
  amp: number;
}

// The animated background is a Signal feature; Classic stays calm glass.
export function fieldSettings(a: Appearance, p: Palette, reduceMotion: boolean): FieldSettings | null {
  if (a.skin !== "signal") return null;
  const f = a.signal.field;
  if (f !== "Chladni" && f !== "Interference") return null;
  const motion = effectiveMotion(a.signal.motion, reduceMotion);
  return { mode: f, motion, speed: SIGNAL_MOTION_SPEED[motion], accent: p.accentFill, base: p.surface, amp: p.dark ? 0.62 : 0.42 };
}

export function describeAppearance(a: Appearance): string {
  if (a.skin === "classic") {
    const t = a.classic.theme;
    return t === "contrast"
      ? "Classic skin, Contrast theme with fixed high-contrast colours"
      : `Classic skin, ${cap(t)} theme, ${cap(a.classic.accent)} accent`;
  }
  const s = a.signal;
  return `Signal skin, ${s.base} base, ${accentName(s.acc)} accent, ${s.motion} motion, ${s.field} background, ${s.texture} texture, ${s.corners} corners, ${s.type} type`;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function contrastBadge(p: Palette): string {
  return `${p.ratio >= 7 ? "AAA" : "AA"} ${p.ratio.toFixed(1)}:1`;
}
