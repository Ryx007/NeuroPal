import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CLASSIC_ACCENT_NAMES,
  CLASSIC_THEME_NAMES,
  SIGNAL_BASES,
  SIGNAL_PRESETS,
  applyLook,
  contrastRatio,
  fitContrast,
  normalizeClassic,
  normalizePal,
  palLine,
  rgbToHex,
  diffAppearance,
  effectiveTiles,
  hexToRgb,
  homeForSkin,
  hslToHex,
  interpretAppearance,
  interpretHome,
  matchLook,
  matchPreset,
  normalizeAppearance,
  normalizeHome,
  normalizeSignal,
  palVisor,
  resolveClassicTokens,
  resolveSignalPalette,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

test("Classic tokens are byte-identical to the app's original palette.js", async () => {
  const src = readFileSync(join(here, "../../../neuropal-expo-app/src/theme/palette.js"), "utf8");
  const original = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
  for (const theme of CLASSIC_THEME_NAMES) {
    for (const accent of [...CLASSIC_ACCENT_NAMES, "blue"]) {
      assert.deepEqual(resolveClassicTokens(theme, accent), original.resolvePalette(theme, accent), `${theme}/${accent}`);
    }
  }
});

test("Signal: every hue on every base keeps text at AA (≥ 4.5:1)", () => {
  let worst = Infinity;
  for (const base of Object.keys(SIGNAL_BASES)) {
    for (let h = 0; h < 360; h += 3) {
      for (const l of [0.35, 0.56, 0.75]) {
        const p = resolveSignalPalette({ acc: hslToHex(h, 1, l), base });
        const fill = hexToRgb(p.accentFill);
        worst = Math.min(
          worst,
          contrastRatio(hexToRgb(p.accentInk), fill),
          contrastRatio(hexToRgb(p.accentText), hexToRgb(p.surfaceContainer)),
          contrastRatio(hexToRgb(p.accentText), hexToRgb(p.surface)),
        );
      }
    }
  }
  assert.ok(worst >= 4.5, `worst contrast ${worst.toFixed(2)}`);
});

test("Signal: body text on every base passes AA", () => {
  for (const [name, b] of Object.entries(SIGNAL_BASES)) {
    for (const key of ["onSurface", "onSurfaceVariant", "outline", "error", "warn", "secondary", "tertiary"]) {
      for (const bg of ["surface", "surfaceLowest", "surfaceLow", "surfaceContainer", "surfaceHigh", "surfaceHighest"]) {
        const r = contrastRatio(hexToRgb(b[key]), hexToRgb(b[bg]));
        assert.ok(r >= 4.5, `${name}.${key} on ${bg} = ${r.toFixed(2)}`);
      }
    }
  }
});

test("normalizeSignal repairs junk without throwing", () => {
  const s = normalizeSignal({ acc: "nope", base: "Lava", brutality: 9, motion: "Wild", corners: null });
  assert.equal(s.acc, "#FF3D2E");
  assert.equal(s.base, "Graphite");
  assert.equal(s.brutality, 2);
  assert.equal(s.motion, "Wild");
  assert.equal(s.corners, "Soft");
  assert.equal(normalizeSignal({ acc: "#abc" }).acc, "#AABBCC");
});

test("presets are recognised by matchPreset", () => {
  for (const name of Object.keys(SIGNAL_PRESETS)) assert.equal(matchPreset(SIGNAL_PRESETS[name]), name);
});

test("Ask Pal: appearance phrases map to the expected changes", () => {
  const base = normalizeAppearance({ skin: "signal" });
  const rows = (t, a = base) => {
    const r = interpretAppearance(t, a);
    return r.error ? r.error : r.rows.map((x) => `${x.k}:${x.from}>${x.to}`).join("|");
  };
  assert.equal(rows("Calm it down"), "Motion:Lively>Calm");
  assert.equal(rows("More contrast"), "Base:Graphite>Black|Brutality:2>3|Texture:Grain>None");
  assert.equal(rows("Try orange"), "Accent:Signal red>Ember");
  assert.equal(rows("less busy, warmer, round corners"), "Base:Graphite>Warm|Motion:Lively>Calm|Background:Chladni>None|Corners:Soft>Round");
  assert.equal(rows("switch to classic"), "Skin:Signal>Classic");
  assert.match(rows("bake me a cake"), /can’t map that/);
  const classic = normalizeAppearance({ skin: "classic" });
  assert.equal(rows("Warmer", classic), "Theme:Dark>Sepia");
  assert.equal(rows("Make it funky", classic), "Skin:Classic>Signal");
  assert.equal(rows("blue please", classic), "Accent:Ruby>Cyan");
});

test("Ask Pal: home phrases map to rules or base changes", () => {
  const home = normalizeHome({});
  const r1 = interpretHome("Reading first on weekdays", home);
  assert.deepEqual(r1.next.rules, [{ scope: "Weekdays", tile: "reading", act: "first" }]);
  assert.equal(interpretHome("Hide Pal’s note", home).rows[0].to, "no");
  assert.equal(interpretHome("Bigger focus", home).rows[0].to, "L");
  assert.match(interpretHome("make it nicer", home).error, /which tile/);
});

test("effectiveTiles applies only today's rules", () => {
  const home = { tiles: normalizeHome({}).tiles, rules: [{ scope: "Weekdays", tile: "reading", act: "first" }, { scope: "Weekends", tile: "mvd", act: "hide" }] };
  const thursday = new Date("2026-10-22T09:00:00");
  const saturday = new Date("2026-10-24T09:00:00");
  assert.equal(effectiveTiles(home, thursday)[0].id, "reading");
  assert.ok(effectiveTiles(home, thursday).some((t) => t.id === "mvd"));
  assert.equal(effectiveTiles(home, saturday)[0].id, "state");
  assert.ok(!effectiveTiles(home, saturday).some((t) => t.id === "mvd"));
});

test("normalizeHome keeps every tile once and drops junk", () => {
  const h = normalizeHome({ tiles: [{ id: "pal", size: "XL" }, { id: "pal" }, { id: "ghost" }], rules: [{ scope: "Sometimes", tile: "pal", act: "first" }] });
  assert.equal(h.tiles[0].id, "pal");
  assert.equal(h.tiles[0].size, "M");
  assert.equal(h.tiles.filter((t) => t.id === "pal").length, 1);
  assert.equal(h.tiles.length, 6);
  assert.deepEqual(h.rules, []);
});

test("looks: apply, match and diff", () => {
  const a = normalizeAppearance({ skin: "signal" });
  assert.equal(matchLook(a), "Everyday");
  const ev = applyLook(a, "Evening");
  assert.equal(matchLook(ev), "Evening");
  assert.ok(diffAppearance(a, ev).length >= 3);
});

test("Pal's visor never vanishes into a same-colour body", () => {
  assert.equal(palVisor("#FF3D2E", "#FF3D2E"), "#141416");
  assert.equal(palVisor("#E4E4E8", "#FF3D2E"), "#FF3D2E");
});

test("synced junk can't resolve to Object members (prototype names, nulls)", () => {
  const evil = { shape: "toString", colour: "hasOwnProperty", talk: "constructor", voice: "__proto__", eyes: "valueOf" };
  const p = normalizePal(evil);
  assert.deepEqual([p.shape, p.colour, p.talk, p.voice, p.eyes], ["Pebble", "Chalk", "Gentle", "Soft", "Visor"]);
  assert.equal(typeof palLine(evil, "the notes"), "string");
  assert.deepEqual(normalizeClassic(null), { theme: "dark", accent: "ruby" });
  const a = normalizeAppearance({ classic: null, signal: null, pal: null, home: null, skin: "signal" });
  assert.equal(a.classic.theme, "dark");
  assert.equal(a.signal.base, "Graphite");
  assert.equal(applyLook(a, "constructor").signal.base, "Graphite");
});

test("fitContrast picks the extreme that can actually reach the target", () => {
  // Luminance ≈ 0.198: white tops out below 4.6:1 here, black does not.
  const bg = [124, 124, 124];
  const out = fitContrast([150, 150, 150], bg);
  assert.ok(contrastRatio(out, bg) >= 4.6, `got ${contrastRatio(out, bg).toFixed(2)} with ${rgbToHex(out)}`);
});

test("Ask Pal understands negations and 'already'", () => {
  const sig = (patch = {}) => normalizeAppearance({ skin: "signal", signal: { ...normalizeAppearance({}).signal, ...patch } });
  const rows = (t, a) => {
    const r = interpretAppearance(t, a);
    return r.error ? r.error : r.rows.map((x) => `${x.k}:${x.from}>${x.to}`).join("|");
  };
  assert.equal(rows("no grid", sig({ field: "Grid" })), "Background:Grid>None");
  assert.match(rows("no grid", sig({ field: "Chladni" })), /already/);
  assert.equal(rows("less bright please", sig({ base: "Concrete" })), "Base:Concrete>Graphite");
  assert.match(rows("make it calm", sig({ motion: "Calm" })), /already/);
  assert.equal(rows("make it calm", sig({ motion: "Wild" })), "Motion:Wild>Calm");
  assert.equal(rows("without grain", sig({ texture: "Grain" })), "Texture:Grain>None");
  assert.equal(rows("not so wild", sig({ motion: "Wild" })), "Motion:Wild>Lively");
  assert.match(rows("red", normalizeAppearance({ skin: "classic" })), /already/);
});

test("Ask Pal finds tiles by whole words only", () => {
  const home = normalizeHome({});
  assert.equal(interpretHome("I'm ready to focus, put it first", home).next.tiles[0].id, "focus");
  assert.match(interpretHome("move my notebook to the top", home).error, /which tile/);
  assert.match(interpretHome("hide the palette", home).error, /which tile/);
  assert.equal(interpretHome("hide Pal's notes", home).rows[0].to, "no");
});

test("Home rules: show lifts a hide rule; position rules never un-hide", () => {
  const base = normalizeHome({});
  const withRule = { tiles: base.tiles, rules: [{ scope: "Weekends", tile: "focus", act: "hide" }] };
  assert.deepEqual(interpretHome("show focus on weekends", withRule).next.rules, []);
  const back = interpretHome("bring back focus", withRule);
  assert.deepEqual(back.next.rules, []);
  assert.equal(back.rows[0].k, "Weekends");

  const hiddenFirst = { tiles: base.tiles.map((t) => (t.id === "state" ? { ...t, hidden: true } : t)), rules: [] };
  const r = interpretHome("check-in first", hiddenFirst);
  assert.deepEqual(r.rows, [{ k: "Visible", from: "no", to: "yes" }]);

  const hiddenReading = {
    tiles: base.tiles.map((t) => (t.id === "reading" ? { ...t, hidden: true } : t)),
    rules: [{ scope: "Weekdays", tile: "reading", act: "first" }],
  };
  const thursday = new Date("2026-10-22T09:00:00");
  assert.ok(!effectiveTiles(hiddenReading, thursday).some((t) => t.id === "reading"));
  const prop = interpretHome("reading last on weekends", hiddenReading);
  assert.equal(prop.next.tiles.find((t) => t.id === "reading").hidden, false);
  assert.equal(prop.rows[0].k, "Visible");
});

test("Classic keeps its original Home until the user arranges it", () => {
  const classic = homeForSkin(normalizeHome({}), "classic");
  assert.deepEqual(effectiveTiles(classic, new Date("2026-10-22T09:00:00")).map((t) => t.id), ["state", "mvd", "anchor", "reading"]);
  assert.equal(effectiveTiles(homeForSkin({}, "signal"), new Date("2026-10-22T09:00:00")).length, 6);
  const arranged = normalizeHome({ tiles: [{ id: "reading", size: "L" }] });
  assert.equal(homeForSkin(arranged, "classic").tiles[0].id, "reading");
});
