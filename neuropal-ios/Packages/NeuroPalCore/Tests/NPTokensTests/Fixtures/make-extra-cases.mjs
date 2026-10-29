// Extra cross-language cases for the Swift port (NPTokensTests), computed by
// the JS in packages/tokens/src — garbage inputs, negations, JS number and
// string quirks, Home phrases. cases.json (sync.js) is the contract; these
// widen it. Regenerate after a tokens change:
//
//   node neuropal-ios/Packages/NeuroPalCore/Tests/NPTokensTests/Fixtures/make-extra-cases.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const T = await import(join(here, "../../../../../../packages/tokens/src/index.js"));

// A small deterministic PRNG (mulberry32), so the file is stable.
let seed = 0x5eed1234;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const hex2 = (n) => n.toString(16).padStart(2, "0");
const randHex = () => `#${hex2(Math.floor(rand() * 256))}${hex2(Math.floor(rand() * 256))}${hex2(Math.floor(rand() * 256))}`;

const PICK = [
  "surface", "surfaceLowest", "surfaceLow", "surfaceContainer", "surfaceHigh", "surfaceHighest",
  "onSurface", "onSurfaceVariant", "outline", "outlineVariant", "primary", "primaryContainer", "onPrimary",
  "secondary", "tertiary", "error", "warn", "accent", "accentGlow", "skin", "dark", "accentFill", "accentInk",
  "accentDeep", "accentText", "line", "control", "shadowColor", "panelColor", "panelAlpha", "grid", "gridAlpha",
  "palBody", "shape", "motion", "field", "texture", "type", "ratio",
];
const pickPalette = (p) => Object.fromEntries(PICK.map((k) => [k, p[k]]));

// ---- normalizeAppearance on anything ---------------------------------------
const homeTiles = T.HOME_DEFAULT.tiles;
const appearanceInputs = [
  null, [], "signal", 5, true, {},
  { skin: "signal" }, { skin: "SIGNAL" }, { skin: ["signal"] },
  { suggestLooks: 0 }, { suggestLooks: false }, { suggestLooks: "false" }, { suggestLooks: null },
  { updatedAt: 5 }, { updatedAt: "2026-01-01T00:00:00.000Z" }, { updatedAt: "" }, { v: 9 },
  { classic: { theme: "sepia", accent: "green" } }, { classic: null }, { classic: [] }, { classic: "dark" },
  { classic: { theme: "Sepia", accent: "GREEN" } }, { classic: { theme: "contrast", accent: "cyan" } },
  { signal: { acc: "#abc" } }, { signal: { acc: "#ABCDEF" } }, { signal: { acc: "abcdef" } }, { signal: { acc: "#abcd" } },
  { signal: { acc: "#12345G" } }, { signal: { acc: 0xff3d2e } }, { signal: { acc: ["#00FF88"] } },
  ...[
    "2", null, true, false, [], [3], ["1"], [1, 2], [[2]], [null], 2.5, -0.4, -0.5, 3.4, 3.5, 0.49999999999999994,
    " 0x2 ", "0b11", "0o3", "1e0", "", "  ", "Infinity", "-Infinity", {}, "2px", ".5", "1.", "+1", "-0", "0x", "1_0",
    " 3 ", "\u00853", 7, -1, 1e21, "3e-1",
  ].map((brutality) => ({ signal: { brutality } })),
  { signal: { base: "Warm", motion: "Wild", field: "Grid", corners: "Round", texture: "Scanlines", type: "Grotesk" } },
  { signal: { base: "warm", motion: "wild", field: "grid" } }, { signal: [] }, { signal: "Signal" },
  { pal: { name: "  Bob  " } }, { pal: { name: "   " } }, { pal: { name: "ABCDEFGHIJKLMNOPQRST" } }, { pal: { name: 5 } },
  { pal: { name: " Bo " } }, { pal: { name: "\u0085Bo" } }, { pal: { name: "Zoë the Pal from Bari" } },
  { pal: { name: "\tTab\n" } }, { pal: { shape: "constructor" } }, { pal: { shape: "__proto__", talk: "toString" } },
  { pal: { shape: "Box", colour: "Mint", eyes: "Wide", mouth: "Oh", extra: "Scarf", talk: "Nerdy", voice: "Low", people: false } },
  { pal: { people: "false" } }, { pal: { people: 0 } }, { pal: { eyes: "visor", mouth: "smile" } }, { pal: null },
  { home: null }, { home: [] }, { home: { tiles: "state" } }, { home: { tiles: [] } },
  { home: { tiles: [{ id: "pal", size: "L" }, { id: "pal", size: "S" }, { id: "nope" }, { id: "state", size: "XL" }] } },
  {
    home: {
      tiles: [null, 5, "state", ["state"], { id: "focus", hidden: "yes" }, { id: "mvd", hidden: 0 }, { id: "anchor", hidden: "" },
        { id: "reading", hidden: [] }, { id: "state", hidden: {} }, { id: "pal", hidden: null }],
    },
  },
  { home: { tiles: homeTiles.map((t) => ({ ...t, hidden: 1 })) } },
  {
    home: {
      rules: [
        { scope: "Weekdays", tile: "reading", act: "first" }, { scope: "Weekdays", tile: "reading", act: "last" },
        { scope: "Weekends", tile: "mvd", act: "hide" }, { scope: "weekends", tile: "mvd", act: "hide" },
        { scope: "Weekends", tile: "nope", act: "hide" }, { scope: "Weekends", tile: "pal", act: "show" }, null, 3, [],
      ],
    },
  },
];
for (let i = 0; i < 40; i += 1) {
  appearanceInputs.push({
    skin: pick(["classic", "signal", "x", null]),
    classic: { theme: pick([...T.CLASSIC_THEME_NAMES, "nope"]), accent: pick([...T.CLASSIC_ACCENT_NAMES, "gold"]) },
    signal: {
      acc: pick([randHex(), randHex().toUpperCase(), randHex().slice(0, 4), "garbage"]),
      base: pick([...T.SIGNAL_OPTIONS.base, "Lava"]),
      motion: pick(T.SIGNAL_OPTIONS.motion),
      field: pick(T.SIGNAL_OPTIONS.field),
      brutality: pick([0, 1, 2, 3, 4, "1", null]),
      corners: pick(T.SIGNAL_OPTIONS.corners),
      texture: pick(T.SIGNAL_OPTIONS.texture),
      type: pick(T.SIGNAL_OPTIONS.type),
    },
    suggestLooks: pick([true, false, undefined]),
  });
}
// The last 40 inputs are random looks: those also carry their palette.
const normalizeCases = appearanceInputs.map((input, i) => {
  const out = T.normalizeAppearance(input);
  const withPalette = i >= appearanceInputs.length - 40;
  return { input, output: out, palette: withPalette ? pickPalette(T.resolveAppearancePalette(out)) : null };
});
// [skin, classic theme, classic accent, acc, base, motion, field, brutality, corners, texture, type]
const lookRow = (a) => [a.skin, a.classic.theme, a.classic.accent, a.signal.acc, a.signal.base, a.signal.motion, a.signal.field,
  a.signal.brutality, a.signal.corners, a.signal.texture, a.signal.type];

// ---- interpretAppearance ------------------------------------------------------
const startLooks = [
  T.normalizeAppearance({}),
  T.normalizeAppearance({ skin: "signal" }),
  T.normalizeAppearance({ skin: "signal", signal: T.SIGNAL_PRESETS.Concrete }),
  T.normalizeAppearance({ skin: "signal", signal: T.SIGNAL_PRESETS.UV }),
  T.normalizeAppearance({ skin: "signal", signal: { ...T.SIGNAL_PRESETS.Ember, motion: "Wild", texture: "Scanlines" } }),
  T.normalizeAppearance({ classic: { theme: "contrast", accent: "cyan" } }),
  T.normalizeAppearance({ classic: { theme: "light", accent: "purple" } }),
];
const phrases = [
  "Calm it down", "More contrast", "Try orange", "no grain please", "not too wild", "not so wild", "less red",
  "no more motion", "dont want the grid", "do not want scanlines", "without texture", "make it brutal", "less brutal",
  "no bold", "flatter", "bolder", "brighter please", "dimmer", "darker", "not dark", "night mode", "low vision",
  "readable", "no contrast", "less contrast", "warm", "not warm", "grey", "#00ff88", "#00FF88 and red", "#00ff881",
  "#12345g", "blue and pink", "ultraviolet", "uv", "make it plain", "simpler", "smooth", "clean", "retro crt",
  "film grain", "waves", "double slit", "graph paper", "sand", "cymatics", "plate", "no chladni", "no waves",
  "no ripples", "condensed type", "wider", "extended", "grotesk", "classic", "original", "old look", "minimal look",
  "funky", "brutalist", "freeze", "static", "stop moving", "calm down", "tone it down", "quieter", "gentle",
  "more energy", "faster", "alive", "lively", "wild", "not wild", "evening", "bedtime", "late", "day", "daylight", "",
  "   ", "ÉVÉNEMENT calm", "café calm", "naïve wild", "it’s too bright", "don't want grain", "dont want grain",
  "no-grid", "less-busy", "rounded corners", "bubbly", "boxy", "square", "not round", "no sharp", "sepia", "paper",
  "cozy", "light", "bright", "contrast", "legible", "ruby", "rose", "teal", "aqua", "lilac", "sage", "mint", "scarlet",
  "gold", "lime", "magenta", "😀 calm 😀", "CALM", "Calm!!!", "calm,wild", "calm-wild", "not  so  bright", "no the grid",
  "no the", "not", "no", "less", "no motion please and wild", "more contrast and less contrast", "warm please",
  "tab\tcalm", "line\ncalm", " calm", "no grid but waves", "less busy", "plain background please", "no field",
  "no pattern", "no texture", "less bright", "not as bright", "no animation", "no movement", "less movement",
  "never wild", "fewer grain", "without the grain", "no very wild", "no any texture", "no that grid",
  "make it lively and calm", "wilder", "livelier", "more animated", "more animation", "energetic", "red and grey, sharper, bolder",
  "switch to classic", "make it funky", "signal please", "harder", "chunkier", "more brutal", "heavier", "softer",
  "subtle", "subtler", "not heavy", "no film", "no crt", "narrow", "narrower", "not condensed", "no interference",
  "fringes", "ripples", "no plate", "no sand", "orange #FF00AA", "#ff00aa orange", "##ff00aa", "#ff00aa#00ff00",
];
const interpretAppearanceCases = [];
for (const [look, i] of startLooks.map((l, k) => [l, k])) {
  for (const text of phrases) {
    const r = T.interpretAppearance(text, look);
    interpretAppearanceCases.push({
      look: i,
      text,
      rows: r.rows || null,
      error: r.error || null,
      next: r.next ? lookRow(r.next) : null,
    });
  }
}

// ---- interpretHome -------------------------------------------------------------
const startHomes = [
  T.normalizeHome({}),
  T.normalizeHome({
    rules: [{ scope: "Weekdays", tile: "reading", act: "hide" }, { scope: "Weekends", tile: "focus", act: "first" },
      { scope: "Weekends", tile: "pal", act: "hide" }],
  }),
  T.normalizeHome({ tiles: T.normalizeHome({}).tiles.map((t) => (t.id === "focus" || t.id === "pal" ? { ...t, hidden: true } : t)) }),
  T.normalizeHome(T.CLASSIC_HOME_DEFAULT),
];
const homePhrases = [
  "Reading first on weekdays", "Hide Pal’s note", "Bigger focus", "show the check-in", "tasks last",
  "anchor first on weekends", "make it nicer", "reading smaller", "hide anchor on weekends",
  "I'm ready to focus, put it first", "move my notebook to the top", "hide the palette", "bring back focus",
  "show focus on weekends", "hide Pal's notes", "show reading on weekdays", "hide focus on weekdays",
  "focus last on weekends", "reading top", "put anchors at the bottom", "make the check in bigger", "check-in smaller",
  "how are you first", "mood last", "feelings", "remove pal", "bring it back focus", "unhide pal", "add focus",
  "include focus", "expand reading", "big reading", "small focus", "shrink anchor", "compact mvd",
  "less space for tasks", "more space for to-do", "todo first", "to do first", "minimum day first", "mvd first",
  "papers first", "books last", "read first", "reader last", "schedule first", "calendar first", "next up last",
  "music first", "noise last", "soundscape hide", "timer first", "pomodoro last", "notes first", "pals note hide",
  "Pal’s note first on weekends", "PAL FIRST", "pal's note on weekdays first", "ready first", "café reading first",
  "réading first", "reading premièrement", "hide reading on weekdays and weekends", "weekends weekdays reading first",
  "reading first weekday", "reading first on the weekend", "start with focus", "lead with focus", "end with focus",
  "focus at the end", "don't show focus", "dont show focus", "do not show focus", "without focus", "focus bigger",
  "focus larger", "show pal on weekends", "show pal", "show reading", "reading first on weekdays please",
  "hide the state", "state first", "checkin last", "focus first on weekends", "focus last", "pal bigger",
  "pal smaller", "anchor smaller", "😀 focus first", "focus first", "focus-first", "first", "", "pal_first",
  "reading 1st", "show anchor on weekdays", "hide pal on weekends",
];
const interpretHomeCases = [];
for (const [home, i] of startHomes.map((h, k) => [h, k])) {
  for (const text of homePhrases) {
    const r = T.interpretHome(text, home);
    interpretHomeCases.push({ home: i, text, rows: r.rows || null, error: r.error || null, next: r.next || null, title: r.title || null, message: r.message || null });
  }
}

// ---- effectiveTiles, home helpers -------------------------------------------------
const effectiveCases = [];
for (let i = 0; i < 30; i += 1) {
  const tiles = T.normalizeHome({}).tiles.map((t) => ({ ...t, hidden: rand() < 0.2, size: pick(T.HOME_SIZES) }));
  for (let k = tiles.length - 1; k > 0; k -= 1) {
    const j = Math.floor(rand() * (k + 1));
    [tiles[k], tiles[j]] = [tiles[j], tiles[k]];
  }
  const rules = [];
  for (let r = 0; r < 4; r += 1) {
    rules.push({ scope: pick(T.HOME_RULE_SCOPES), tile: pick(Object.keys(T.HOME_TILES)), act: pick(T.HOME_RULE_ACTS) });
  }
  const home = { tiles, rules };
  const day = 19 + (i % 7); // 2026-10-19 (Mon) … 25 (Sun)
  const date = `2026-10-${day}T${pick(["09", "12", "18"])}:00:00`;
  effectiveCases.push({ home, date, ids: T.effectiveTiles(home, new Date(date)).map((t) => t.id) });
}
const moveCases = [];
for (const id of [...Object.keys(T.HOME_TILES), "nope"]) {
  for (const dir of [-1, 1, 2]) moveCases.push({ id, dir, tiles: T.moveTile({}, id, dir).tiles.map((t) => t.id) });
}
const homeForSkinCases = startHomes.flatMap((home, i) =>
  ["classic", "signal"].map((skin) => ({ home: i, skin, isDefault: T.isDefaultHome(home), out: T.homeForSkin(home, skin) })),
);
const ordinals = Array.from({ length: 130 }, (_, n) => ({ n, s: T.ordinal(n) }));

// ---- Pal -----------------------------------------------------------------------
const pals = [
  T.normalizePal({}),
  T.normalizePal({ talk: "Direct", name: "Ziggy" }),
  T.normalizePal({ talk: "Nerdy", shape: "Moon", mouth: "None", extra: "None" }),
];
const keys = [...Object.keys(T.PAL_LINES.Gentle), "unknownKey", "constructor", ""];
const varsList = [{}, { task: "the CPI notes" }, { task: "$& and $1" }, { task: "{task}" }, { other: "x" }];
const palSayCases = [];
pals.forEach((pal, p) => {
  for (const key of keys) for (const vars of varsList) palSayCases.push({ pal: p, key, vars, out: T.palSay(pal, key, vars) });
});
const tasks = ["the CPI notes", "“Stay hydrated”", "$&", "$$", "$`", "$'", "$1", "a $& b", "{task}", ""];
const palLineCases = pals.flatMap((pal, p) => tasks.map((task) => ({ pal: p, task, out: T.palLine(pal, task) })));
const inkInputs = ["", "xyz", "#12", "12345678", "#FFF", "fff", "#000000", "#808080", "#767676", "#777777"];
for (let i = 0; i < 30; i += 1) inkInputs.push(randHex());
const palInkCases = inkInputs.flatMap((body) =>
  ["#FF3D2E", "#2EC7F0", body, "nope"].map((acc) => ({ body, acc, faceInk: T.palFaceInk(body), visor: T.palVisor(body, acc) })),
);
const palDescriptions = [...pals, T.normalizePal({ name: "Bo", shape: "Box", colour: "Red", eyes: "Dots", mouth: "Flat", extra: "Lab goggles" })]
  .map((pal) => ({ pal, out: T.palDescription(pal) }));

// ---- colour maths ---------------------------------------------------------------
const hsl = [];
for (let h = 0; h < 360; h += 7) for (const s of [0, 0.5, 1]) for (const l of [0, 0.2, 0.5, 0.56, 0.9, 1]) hsl.push({ h, s, l, hex: T.hslToHex(h, s, l) });
const hexInputs = ["#FFF", "fff", "#ffffff", "  #ffffff", "#12zzzz", "#-12345", "0x1234", "##ffffff", "#ff", "", "#1234567",
  "#GGGGGG", "ff ff ff", "#0x1234", "#+12345", "1234567", "#A1B2C3"];
for (let i = 0; i < 40; i += 1) hexInputs.push(randHex());
const hexCases = hexInputs.map((hex) => ({ hex, rgb: T.hexToRgb(hex), hue: T.hueOf(hex), isHex: T.isHex(hex) }));
const pairs = [];
for (let i = 0; i < 60; i += 1) {
  const a = T.hexToRgb(randHex());
  const b = T.hexToRgb(randHex());
  pairs.push({ a, b, ratio: T.contrastRatio(a, b), fit: T.fitContrast(a, b), fit3: T.fitContrast(a, b, 3), ink: T.inkFor(a), mix: T.mix(a, b, 0.37) });
}
const alphas = [0, 0.3, 1, 0.25, 0.123456789, 1e-7, 1.5e-7, 0.000001, 1e21, 1e20, 123.456, 2.5e-6, 100, 0.1 + 0.2];
const alphaCases = alphas.map((alpha) => ({ alpha, out: T.withAlpha("#FF3D2E", alpha) }));

// ---- signal names, presets, looks --------------------------------------------------
const accentNames = [...T.SIGNAL_ACCENTS.map((a) => a.hex), "#e5261f", "#ff3d2e", "#123456", "", "Garbage"].map((hex) => ({ hex, name: T.accentName(hex) }));
const presetCases = [...Object.values(T.SIGNAL_PRESETS), ...startLooks.map((l) => l.signal), { ...T.SIGNAL_PRESETS.UV, acc: "#8b5cff" }]
  .map((sig) => ({ sig, preset: T.matchPreset(sig) }));
const lookCases = [];
for (const look of startLooks) {
  for (const name of [...Object.keys(T.LOOKS.signal), "Nope", "constructor"]) {
    const applied = T.applyLook(look, name);
    lookCases.push({
      look: startLooks.indexOf(look),
      name,
      match: T.matchLook(look),
      applied: lookRow(applied),
      appliedMatch: T.matchLook(applied),
      desc: T.lookDescription(look.skin, name),
    });
  }
}
const diffCases = [];
startLooks.forEach((a, i) => startLooks.forEach((b, j) => diffCases.push({ a: i, b: j, rows: T.diffAppearance(a, b) })));

const out = {
  generatedFrom: "packages/tokens/src via make-extra-cases.mjs",
  tokensVersion: T.TOKENS_VERSION,
  startLooks,
  startHomes,
  pals,
  normalize: normalizeCases,
  interpretAppearance: interpretAppearanceCases,
  interpretHome: interpretHomeCases,
  effectiveTiles: effectiveCases,
  moveTile: moveCases,
  homeForSkin: homeForSkinCases,
  ordinals,
  palSay: palSayCases,
  palLine: palLineCases,
  palInk: palInkCases,
  palDescription: palDescriptions,
  hsl,
  hex: hexCases,
  pairs,
  alpha: alphaCases,
  accentNames,
  presets: presetCases,
  looks: lookCases,
  diff: diffCases,
};
writeFileSync(join(here, "extra-cases.json"), `${JSON.stringify(out)}\n`);
console.log(
  Object.entries(out)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(", "),
);
