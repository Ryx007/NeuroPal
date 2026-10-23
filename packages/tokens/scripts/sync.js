#!/usr/bin/env node
// Regenerates every client's copy of the design tokens from packages/tokens.
//
//   node packages/tokens/scripts/sync.js          write all outputs
//   node packages/tokens/scripts/sync.js --check  exit 1 if any output is stale (CI)
//
// Outputs
//   neuropal-expo-app/src/theme/tokens/*.js     JS logic + data (verbatim copies)
//   neuropal-platform/src/lib/tokens/*.js        same, for the Next.js platform
//   neuropal-flutter/lib/theme/tokens.g.dart     data only; the Dart logic is
//                                               hand-ported and proven against…
//   neuropal-flutter/test/fixtures/token_cases.json   …these JS-computed cases
//   neuropal-flutter/ios/NeuroPalWidget/NeuroPalTokens.swift   widget fallbacks
//   neuropal-platform/src/styles/tokens.css      CSS variables (no-flash defaults)
//   packages/tokens/fixtures/cases.json          the canonical fixtures
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import * as T from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const repo = join(pkg, "..", "..");
const CHECK = process.argv.includes("--check");
const HEADER_JS = "// GENERATED from packages/tokens/src — do not edit here.\n// Change packages/tokens, then run: node packages/tokens/scripts/sync.js\n";
const stale = [];

function out(path, content, { optionalRoot } = {}) {
  if (optionalRoot && !existsSync(join(repo, optionalRoot))) return;
  const abs = join(repo, path);
  const prev = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (prev === content) return;
  if (CHECK) {
    stale.push(path);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  console.log(`wrote ${path}`);
}

// ---- JS copies --------------------------------------------------------------
const srcDir = join(pkg, "src");
const jsFiles = readdirSync(srcDir).filter((f) => f.endsWith(".js"));
for (const [target, root] of [
  ["neuropal-expo-app/src/theme/tokens", "neuropal-expo-app"],
  ["neuropal-platform/src/lib/tokens", "neuropal-platform"],
  // The backend is CommonJS; it loads this ESM copy with a cached dynamic
  // import() so server-side validation is the exact same normalisation.
  ["neuropal-backend/src/vendor/tokens", "neuropal-backend"],
]) {
  for (const f of jsFiles) {
    out(`${target}/${f}`, HEADER_JS + readFileSync(join(srcDir, f), "utf8"), { optionalRoot: root });
  }
}
out(
  "neuropal-backend/src/vendor/tokens/package.json",
  `${JSON.stringify({ name: "@neuropal/tokens-vendored", private: true, type: "module", main: "index.js" }, null, 2)}\n`,
  { optionalRoot: "neuropal-backend" },
);

// ---- fonts (binary copies; the app decides which files it bundles) ---------
const FONT_TARGETS = [
  {
    root: "neuropal-expo-app",
    dir: "neuropal-expo-app/assets/fonts",
    files: [
      "Archivo-SemiExpanded-Black.ttf", "Archivo-Condensed-ExtraBold.ttf", "Archivo-Bold.ttf", "Archivo-Black.ttf",
      "AtkinsonHyperlegibleNext-400.ttf", "AtkinsonHyperlegibleNext-500.ttf", "AtkinsonHyperlegibleNext-600.ttf",
      "AtkinsonHyperlegibleNext-700.ttf", "AtkinsonHyperlegibleMono-400.ttf", "AtkinsonHyperlegibleMono-700.ttf",
    ],
  },
];
const fontDir = join(pkg, "fonts");
for (const t of FONT_TARGETS) {
  if (!existsSync(join(repo, t.root))) continue;
  for (const f of t.files) {
    const src = readFileSync(join(fontDir, f));
    const abs = join(repo, t.dir, f);
    const prev = existsSync(abs) ? readFileSync(abs) : null;
    if (prev && prev.equals(src)) continue;
    if (CHECK) {
      stale.push(`${t.dir}/${f}`);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
    console.log(`wrote ${t.dir}/${f}`);
  }
}

// ---- fixtures (the cross-language contract) ---------------------------------
const PICK = [
  "surface", "surfaceLowest", "surfaceLow", "surfaceContainer", "surfaceHigh", "surfaceHighest",
  "onSurface", "onSurfaceVariant", "outline", "outlineVariant", "primary", "primaryContainer", "onPrimary",
  "secondary", "tertiary", "error", "warn", "accent", "accentGlow", "skin", "dark", "accentFill", "accentInk",
  "accentDeep", "accentText", "line", "control", "shadowColor", "panelColor", "panelAlpha", "grid", "gridAlpha",
  "palBody", "shape", "motion", "field", "texture", "type", "ratio",
];
const pick = (p) => Object.fromEntries(PICK.map((k) => [k, p[k]]));

const classicCases = [];
for (const theme of T.CLASSIC_THEME_NAMES) {
  for (const accent of T.CLASSIC_ACCENT_NAMES) {
    classicCases.push({ input: { theme, accent }, output: pick(T.resolveClassicPalette({ theme, accent })) });
  }
}
const signalInputs = [];
for (const name of Object.keys(T.SIGNAL_PRESETS)) signalInputs.push(T.SIGNAL_PRESETS[name]);
const bases = Object.keys(T.SIGNAL_BASES);
let i = 0;
for (let h = 0; h < 360; h += 30) {
  for (const l of [0.4, 0.56, 0.72]) {
    signalInputs.push({
      acc: T.hslToHex(h, 1, l),
      base: bases[i % 4],
      motion: T.SIGNAL_OPTIONS.motion[i % 4],
      field: T.SIGNAL_OPTIONS.field[i % 4],
      brutality: i % 4,
      corners: T.SIGNAL_OPTIONS.corners[i % 3],
      texture: T.SIGNAL_OPTIONS.texture[i % 3],
      type: T.SIGNAL_OPTIONS.type[i % 3],
    });
    i += 1;
  }
}
signalInputs.push({ acc: "garbage", base: "Lava", brutality: 7 });
const signalCases = signalInputs.map((input) => ({ input, output: pick(T.resolveSignalPalette(input)) }));

const appearanceTexts = [
  ["signal", "Calm it down"], ["signal", "More contrast"], ["signal", "Try orange"],
  ["signal", "less busy, warmer, round corners"], ["signal", "evening please"],
  ["signal", "make it wild with scanlines and #00FF88"], ["signal", "switch to classic"],
  ["signal", "bake me a cake"], ["signal", "daylight grid condensed"], ["signal", "red and grey, sharper, bolder"],
  ["classic", "Warmer"], ["classic", "More contrast"], ["classic", "Make it funky"], ["classic", "blue please"],
  ["classic", "bright"],
  // v2: negations, absolute vs comparative, "already" replies.
  ["signal", "no grain please"], ["signal", "no grid"], ["signal", "make it calm"], ["signal", "make it lively"],
  ["signal", "not so bright"], ["signal", "without the background"], ["signal", "less contrast"], ["signal", "no chladni"],
  ["classic", "red"], ["classic", "not bright"],
];
const interpretAppearanceCases = appearanceTexts.map(([skin, text]) => {
  const input = T.normalizeAppearance({ skin });
  const r = T.interpretAppearance(text, input);
  return { skin, text, rows: r.rows || null, error: r.error || null, next: r.next || null };
});
const homeTexts = [
  "Reading first on weekdays", "Hide Pal’s note", "Bigger focus", "show the check-in", "tasks last",
  "anchor first on weekends", "make it nicer", "reading smaller", "hide anchor on weekends",
  // v2: whole-word tile matching, nothing-to-do replies.
  "I'm ready to focus, put it first", "move my notebook to the top", "hide the palette", "bring back focus",
  "show focus on weekends", "hide Pal's notes",
];
const interpretHomeCases = homeTexts.map((text) => {
  const r = T.interpretHome(text, T.normalizeHome({}));
  return { text, rows: r.rows || null, error: r.error || null, next: r.next || null, title: r.title || null };
});
const ruleHome = {
  tiles: T.normalizeHome({}).tiles,
  rules: [{ scope: "Weekdays", tile: "reading", act: "first" }, { scope: "Weekends", tile: "mvd", act: "hide" }],
};
// A base-hidden tile with a position rule stays hidden (rules only move).
const hiddenRuleHome = {
  tiles: T.normalizeHome({}).tiles.map((t) => (t.id === "reading" ? { ...t, hidden: true } : t)),
  rules: [{ scope: "Weekdays", tile: "reading", act: "first" }],
};
const effectiveCases = [
  ...["2026-10-22T09:00:00", "2026-10-24T09:00:00"].map((date) => ({ home: ruleHome, date })),
  { home: hiddenRuleHome, date: "2026-10-22T09:00:00" },
].map((c) => ({ ...c, ids: T.effectiveTiles(c.home, new Date(c.date)).map((t) => t.id) }));
const palCases = Object.values(T.PAL_OPTIONS.colour).flatMap((body) =>
  ["#FF3D2E", "#2EC7F0", "#E4E4E8"].map((acc) => ({ body, acc, faceInk: T.palFaceInk(body), visor: T.palVisor(body, acc) })),
);
const fixtures = {
  generatedFrom: "packages/tokens",
  tokensVersion: T.TOKENS_VERSION,
  classic: classicCases,
  signal: signalCases,
  interpretAppearance: interpretAppearanceCases,
  interpretHome: interpretHomeCases,
  effectiveTiles: effectiveCases,
  pal: palCases,
};
const fixturesJson = `${JSON.stringify(fixtures, null, 2)}\n`;
out("packages/tokens/fixtures/cases.json", fixturesJson);
out("neuropal-flutter/test/fixtures/token_cases.json", fixturesJson, { optionalRoot: "neuropal-flutter" });

// ---- Dart data --------------------------------------------------------------
function dart(v, indent = "") {
  const next = `${indent}  `;
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$")}'`;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return `[\n${v.map((x) => `${next}${dart(x, next)},`).join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(v);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, x]) => `${next}${dart(k)}: ${dart(x, next)},`).join("\n")}\n${indent}}`;
}
// Doubles must stay doubles in Dart even when they happen to be whole.
const asDoubles = (obj) => Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, { __double: x }]));
function dartTyped(v, indent = "") {
  if (v && typeof v === "object" && "__double" in v) {
    const n = v.__double;
    return Number.isInteger(n) ? `${n}.0` : String(n);
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const next = `${indent}  `;
    const entries = Object.entries(v);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([k, x]) => `${next}${dart(k)}: ${dartTyped(x, next)},`).join("\n")}\n${indent}}`;
  }
  return dart(v, indent);
}
const basesForDart = Object.fromEntries(
  Object.entries(T.SIGNAL_BASES).map(([k, b]) => [k, { ...b, panelAlpha: { __double: b.panelAlpha }, gridAlpha: { __double: b.gridAlpha } }]),
);
const dartSrc = `// GENERATED from packages/tokens/src/tokens.js — do not edit.
// Change packages/tokens, then run: node packages/tokens/scripts/sync.js
// ignore_for_file: constant_identifier_names, lines_longer_than_80_chars

const int kTokensVersion = ${T.TOKENS_VERSION};

const Map<String, Map<String, String>> kClassicThemes = ${dart(T.CLASSIC_THEMES)};

const Map<String, Map<String, Map<String, String>>> kClassicAccentVariants = ${dart(T.CLASSIC_ACCENT_VARIANTS)};

const List<String> kClassicThemeNames = ${dart(T.CLASSIC_THEME_NAMES)};
const List<String> kClassicAccentNames = ${dart(T.CLASSIC_ACCENT_NAMES)};

const Map<String, num> kClassicShape = ${dart(T.CLASSIC_SHAPE)};

const Map<String, Map<String, Object>> kSignalBases = ${dartTyped(basesForDart)};

const List<Map<String, String>> kSignalAccents = ${dart(T.SIGNAL_ACCENTS)};
const Map<String, String> kSignalExtraAccentNames = ${dart(T.SIGNAL_EXTRA_ACCENT_NAMES)};

const Map<String, List<Object>> kSignalOptions = ${dart(T.SIGNAL_OPTIONS)};
const Map<String, int> kSignalCorners = ${dart(T.SIGNAL_CORNERS)};
const List<int> kSignalBrutalityBorder = ${dart(T.SIGNAL_BRUTALITY.border)};
const List<int> kSignalBrutalityShadow = ${dart(T.SIGNAL_BRUTALITY.shadow)};
const Map<String, double> kSignalMotionSpeed = ${dartTyped(asDoubles(T.SIGNAL_MOTION_SPEED))};
const Map<String, double> kRedStateField = ${dartTyped(asDoubles(T.RED_STATE_FIELD))};

const Map<String, Object> kSignalDefault = ${dart(T.SIGNAL_DEFAULT)};
const Map<String, Map<String, Object>> kSignalPresets = ${dart(T.SIGNAL_PRESETS)};

const Map<String, Map<String, Map<String, Object>>> kLooks = ${dart(T.LOOKS)};

const Map<String, Map<String, Map<String, Object>>> kTypeRoles = ${dart(T.TYPE_ROLES)};

const Map<String, String> kPalShapes = ${dart(T.PAL_OPTIONS.shape)};
const Map<String, String> kPalColours = ${dart(T.PAL_OPTIONS.colour)};
const List<String> kPalEyes = ${dart(T.PAL_OPTIONS.eyes)};
const List<String> kPalMouths = ${dart(T.PAL_OPTIONS.mouth)};
const List<String> kPalExtras = ${dart(T.PAL_OPTIONS.extra)};
const Map<String, String> kPalTalk = ${dart(T.PAL_OPTIONS.talk)};
const Map<String, List<double>> kPalVoice = ${dart(T.PAL_OPTIONS.voice)};
const Map<String, Object> kPalDefault = ${dart(T.PAL_DEFAULT)};

const Map<String, Map<String, Object>> kHomeTiles = ${dart(T.HOME_TILES)};
const List<Map<String, Object>> kHomeDefaultTiles = ${dart(T.HOME_DEFAULT.tiles)};
const List<String> kHomeSizes = ${dart(T.HOME_SIZES)};
const List<String> kHomeRuleScopes = ${dart(T.HOME_RULE_SCOPES)};
const List<String> kHomeRuleActs = ${dart(T.HOME_RULE_ACTS)};
`;
out("neuropal-flutter/lib/theme/tokens.g.dart", dartSrc, { optionalRoot: "neuropal-flutter" });

// ---- Swift (iOS widget fallbacks) -------------------------------------------
const sigDefault = T.resolveSignalPalette(T.SIGNAL_DEFAULT);
const clsDefault = T.resolveClassicPalette({ theme: "dark", accent: "ruby" });
const swiftColor = (hex) => `"${hex}"`;
const swiftSrc = `// GENERATED from packages/tokens — do not edit.
// The Flutter app writes the user's resolved palette into the shared App
// Group; these are only the fallbacks used before it ever has.
enum NeuroPalTokens {
    static let signal: [String: String] = [
${["surface", "surfaceContainer", "onSurface", "onSurfaceVariant", "outline", "accentFill", "accentInk", "accentText", "line", "shadowColor"].map((k) => `        "${k}": ${swiftColor(sigDefault[k])},`).join("\n")}
    ]
    static let classic: [String: String] = [
${["surface", "surfaceContainer", "onSurface", "onSurfaceVariant", "outline", "accentFill", "accentInk", "accentText", "line", "shadowColor"].map((k) => `        "${k}": ${swiftColor(clsDefault[k])},`).join("\n")}
    ]
    static let signalRadius: Double = ${sigDefault.shape.radius}
    static let signalBorder: Double = ${sigDefault.shape.border}
    static let signalShadow: Double = ${sigDefault.shape.shadow}
    static let classicRadius: Double = ${clsDefault.shape.radius}
}
`;
out("neuropal-flutter/ios/NeuroPalWidget/NeuroPalTokens.swift", swiftSrc, { optionalRoot: "neuropal-flutter" });

// ---- CSS variables (web platform) -------------------------------------------
const CSS_KEYS = [
  "surface", "surfaceLowest", "surfaceLow", "surfaceContainer", "surfaceHigh", "surfaceHighest", "onSurface",
  "onSurfaceVariant", "outline", "outlineVariant", "primary", "onPrimary", "secondary", "tertiary", "error", "warn",
  "accent", "accentFill", "accentInk", "accentText", "accentDeep", "line", "control", "shadowColor", "panelColor", "grid",
];
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
function cssBlock(selector, p) {
  const lines = CSS_KEYS.map((k) => `  --np-${kebab(k)}: ${p[k]};`);
  lines.push(`  --np-panel-alpha: ${p.panelAlpha};`, `  --np-grid-alpha: ${p.gridAlpha};`);
  lines.push(`  --np-radius: ${p.shape.radius}px;`, `  --np-radius-control: ${p.shape.radiusControl}px;`);
  lines.push(`  --np-border: ${p.shape.border}px;`, `  --np-shadow: ${p.shape.shadow}px;`);
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}
let css = "/* GENERATED from packages/tokens — do not edit. Defaults for first paint;\n   the app recomputes these from the user's saved appearance. */\n";
css += cssBlock(':root,\n[data-skin="signal"]', sigDefault);
for (const theme of T.CLASSIC_THEME_NAMES) {
  css += cssBlock(`[data-skin="classic"][data-theme="${theme}"]`, T.resolveClassicPalette({ theme, accent: "ruby" }));
}
out("neuropal-platform/src/styles/tokens.css", css, { optionalRoot: "neuropal-platform" });

if (CHECK) {
  if (stale.length) {
    console.error(`Stale generated token files (run node packages/tokens/scripts/sync.js):\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log("tokens: all generated files up to date");
} else {
  console.log(`tokens: sync done (${relative(process.cwd(), repo) || "."})`);
}
