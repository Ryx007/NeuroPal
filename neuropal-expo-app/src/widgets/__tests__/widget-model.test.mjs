// Pure logic of the "Pal" home-screen widget.
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/widgets/__tests__/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveClassicPalette } from "../../theme/tokens/classic.js";
import { contrastRatio, hexToRgb } from "../../theme/tokens/color.js";
import { resolveSignalPalette } from "../../theme/tokens/signal.js";
import {
  CLASSIC_ACCENT_NAMES,
  CLASSIC_THEME_NAMES,
  PAL_OPTIONS,
  SIGNAL_ACCENTS,
  SIGNAL_EXTRA_ACCENT_NAMES,
  SIGNAL_OPTIONS,
} from "../../theme/tokens/tokens.js";
import { ASK_PAL_URL, CALM_URL, CHECKIN_ACTION, MAX_PENDING_CHECKINS, STATE_ORDER, WIDGET_STATES } from "../constants.js";
import {
  TEXT_SP,
  WIDGET_FONTS,
  WORD_EM_BY_SKIN,
  appendCheckin,
  buildSnapshot,
  buildViewModel,
  effectiveState,
  calmLinkKey,
  calmUrlFor,
  isAskPalUrl,
  isCalmUrl,
  latestCheckin,
  layoutFor,
  parseCheckins,
  parseSnapshot,
  pickNextAnchor,
  relativeIn,
  relativeSpeech,
  snapshotKey,
  widgetColors,
} from "../model.js";
import { glyphSvg, palSvg } from "../palSvg.js";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (h, m) => new Date(2026, 9, 24, h, m, 0);
const cr = (a, b) => contrastRatio(hexToRgb(a), hexToRgb(b));

const reduxAnchors = [
  { id: "a-1", title: "Morning meds", time: { hour: 8, minute: 15 }, status: "done" },
  { id: "a-3", title: "Meds", time: { hour: 14, minute: 30 }, status: "upcoming" },
  { id: "a-2", title: "Lunch", time: { hour: 12, minute: 30 }, status: "current" },
  { id: "a-4", title: "Walk + sunlight", time: { hour: 16, minute: 0 }, status: "pending" },
];

function snapshotAt(now, overrides = {}) {
  const palette = resolveClassicPalette({ theme: "dark", accent: "ruby" });
  return buildSnapshot({
    home: { nervousState: "green", anchors: reduxAnchors, tasks: [{ title: "Take meds", done: false }], dayStamp: "2026-10-24", ...overrides.home },
    look: { pal: { name: "Bo", colour: "Mint" }, skin: "classic", ...overrides.look },
    palette: overrides.palette || palette,
    stateAt: overrides.stateAt ?? at(9, 0).toISOString(),
    now,
  });
}

// ------------------------------------------------------------- snapshot ----

test("snapshot has exactly the contract's fields", () => {
  const snap = snapshotAt(at(14, 10));
  assert.deepEqual(Object.keys(snap).sort(), [
    "anchorsToday", "colors", "line", "linkKey", "nextAnchor", "pal", "palName", "skin", "state", "stateAt", "updatedAt", "v",
  ]);
  assert.equal(snap.linkKey, null, "no key until the app passes one");
  assert.equal(snap.v, 1);
  assert.deepEqual(Object.keys(snap.colors).sort(), ["accent", "accentInk", "onSurface", "onSurfaceVariant", "surface"]);
  assert.deepEqual(snap.nextAnchor, { title: "Meds", hour: 14, minute: 30 });
  assert.deepEqual(snap.anchorsToday.map((a) => a.title), ["Morning meds", "Lunch", "Meds", "Walk + sunlight"]);
  assert.deepEqual(Object.keys(snap.anchorsToday[0]).sort(), ["hour", "minute", "status", "title"]);
  assert.equal(snap.palName, "Bo");
  assert.equal(snap.line, "No rush. Want to try two minutes on “Take meds”?");
  // Signal's accent as a fill (accentFill), with the ink the tokens pair it with.
  const signal = resolveSignalPalette({ acc: "#3DDC84", base: "Concrete" });
  const s = buildSnapshot({ home: {}, look: { skin: "signal" }, palette: signal, now: at(9, 0) });
  assert.equal(s.colors.accent, "#3DDC84");
  assert.equal(s.colors.accentInk, signal.accentInk);
  assert.equal(s.skin, "signal");
  assert.equal(s.state, null);
  assert.equal(s.stateAt, null);
});

test("a stale day's anchor statuses are reset in the snapshot", () => {
  const snap = snapshotAt(at(7, 0), { home: { dayStamp: "2026-10-23" } });
  assert.ok(snap.anchorsToday.every((a) => a.status === "upcoming"));
  assert.deepEqual(snap.nextAnchor, { title: "Morning meds", hour: 8, minute: 15 });
});

test("parseSnapshot rejects junk and never lets markup into colours", () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot("{not json"), null);
  assert.equal(parseSnapshot({ v: 2 }), null);
  const snap = parseSnapshot({ v: 1, colors: { surface: '#fff" onload="x', accent: "red" }, state: "purple", anchorsToday: [{ title: "", hour: 3, minute: 0 }, { title: "Ok", hour: 25, minute: 0 }] });
  assert.equal(snap.state, null);
  assert.equal(snap.colors.surface, "#131313");
  assert.equal(snap.colors.accent, "#FF7F8E");
  assert.deepEqual(snap.anchorsToday, []);
  assert.equal(snapshotKey(snapshotAt(at(10, 0))), snapshotKey({ ...snapshotAt(at(10, 0)), updatedAt: "later" }));
});

// --------------------------------------------------------------- anchors ---

test("next anchor rolls forward as time passes, without the app", () => {
  const list = parseSnapshot(snapshotAt(at(7, 0))).anchorsToday;
  assert.equal(pickNextAnchor(list, at(7, 0)).title, "Lunch"); // morning meds already done
  assert.equal(pickNextAnchor(list, at(12, 30)).minutesUntil, 0);
  assert.equal(pickNextAnchor(list, at(14, 10)).title, "Meds");
  assert.equal(pickNextAnchor(list, at(14, 10)).minutesUntil, 20);
  assert.equal(pickNextAnchor(list, at(15, 59)).title, "Walk + sunlight");
  assert.equal(pickNextAnchor(list, at(16, 1)), null);
  // Statuses from another day don't count.
  assert.equal(pickNextAnchor(list, at(7, 0), { statusesValid: false }).title, "Morning meds");
});

test("anchor line and speech", () => {
  const vm = buildViewModel({ snapshot: snapshotAt(at(14, 10)), checkins: [], width: 360, height: 200, now: at(14, 10) });
  assert.equal(vm.anchor.text, "Meds · 14:30 · in 20 min");
  assert.equal(vm.anchor.speech, "Next anchor: Meds at 14:30, in 20 minutes");
  const late = buildViewModel({ snapshot: snapshotAt(at(14, 10)), checkins: [], width: 360, height: 200, now: at(20, 0) });
  assert.equal(late.anchor.text, "No more anchors today");
  // Next morning, before the app has been opened: yesterday's "done" is ignored.
  const tomorrow = new Date(2026, 9, 25, 7, 0);
  const next = buildViewModel({ snapshot: snapshotAt(at(14, 10)), checkins: [], width: 360, height: 200, now: tomorrow });
  assert.match(next.anchor.text, /^Morning meds · 08:15/);
  // Long titles are shortened before the time is ever dropped.
  const long = snapshotAt(at(9, 0), { home: { anchors: [{ title: "A very long anchor title that goes on and on", time: { hour: 10, minute: 5 } }] } });
  const tight = buildViewModel({ snapshot: long, checkins: [], width: 250, height: 160, now: at(9, 0) });
  assert.match(tight.anchor.text, /…/);
  assert.match(tight.anchor.text, /10:05/);
  const none = buildViewModel({ snapshot: null, checkins: [], width: 300, height: 160, now: at(9, 0) });
  assert.equal(none.anchor.text, "Open NeuroPal once to sync your day");
});

test("relative time formatting", () => {
  assert.equal(relativeIn(0), "now");
  assert.equal(relativeIn(1), "in 1 min");
  assert.equal(relativeIn(20), "in 20 min");
  assert.equal(relativeIn(60), "in 1 h");
  assert.equal(relativeIn(65), "in 1 h 5 min");
  assert.equal(relativeSpeech(1), "in 1 minute");
  assert.equal(relativeSpeech(125), "in 2 hours 5 minutes");
});

// ----------------------------------------------------------- check-ins -----

test("a widget check-in shows immediately and beats an older app state", () => {
  const snap = snapshotAt(at(14, 10), { stateAt: at(9, 0).toISOString() });
  const pending = appendCheckin([], "red", at(14, 11).toISOString());
  assert.deepEqual(effectiveState(parseSnapshot(snap), pending), { state: "red", at: at(14, 11).toISOString(), pending: true });
  // The app's own newer state wins over a stale pending entry.
  const newer = snapshotAt(at(14, 10), { stateAt: at(14, 20).toISOString() });
  assert.equal(effectiveState(parseSnapshot(newer), pending).state, "green");
  // No stateAt known → the pending check-in wins.
  const unknown = { ...snap, stateAt: null };
  assert.equal(effectiveState(parseSnapshot(unknown), pending).state, "red");
  assert.deepEqual(effectiveState(null, []), { state: null, at: null, pending: false });

  const vm = buildViewModel({ snapshot: snap, checkins: pending, width: 320, height: 180, now: at(14, 12) });
  assert.equal(vm.state.word, "Overwhelmed");
  assert.deepEqual(vm.buttons.map((b) => b.selected), [false, false, true]);
  assert.equal(vm.line, "Everything else can wait. I’m here when you want me.");
});

test("check-in list: latest wins, junk ignored, capped", () => {
  const list = [
    { state: "green", at: at(9, 0).toISOString() },
    { state: "nope", at: at(11, 0).toISOString() },
    { state: "yellow", at: "not a date" },
    { state: "red", at: at(10, 0).toISOString() },
  ];
  assert.equal(latestCheckin(list).state, "red");
  assert.equal(parseCheckins(JSON.stringify(list)).length, 2);
  assert.deepEqual(parseCheckins("garbage"), []);
  let many = [];
  for (let i = 0; i < 80; i += 1) many = appendCheckin(many, "green", new Date(2026, 0, 1, 0, i).toISOString());
  assert.equal(many.length, MAX_PENDING_CHECKINS);
  assert.equal(appendCheckin(many, "blue", "x").length, MAX_PENDING_CHECKINS);
});

test("Ask Pal deep link", () => {
  assert.equal(ASK_PAL_URL, "neuropal://pal");
  assert.ok(isAskPalUrl("neuropal://pal"));
  assert.ok(isAskPalUrl("neuropal://pal/"));
  assert.ok(isAskPalUrl("NEUROPAL://pal?from=widget"));
  assert.ok(!isAskPalUrl("neuropal://palette"));
  assert.ok(!isAskPalUrl("https://pal"));
  assert.ok(!isAskPalUrl(null));
});

test("the Overwhelmed link carries the app's key, and only a well-formed one", () => {
  const key = "0123456789abcdef0123456789abcdef";
  assert.equal(calmUrlFor(key), `neuropal://calm?k=${key}`);
  assert.equal(calmUrlFor("not-a-key"), "neuropal://calm");
  assert.equal(calmUrlFor(null), "neuropal://calm");
  assert.equal(calmLinkKey(`neuropal://calm?k=${key}`), key);
  assert.equal(calmLinkKey(`neuropal://calm?x=1&k=${key.toUpperCase()}`), key);
  assert.equal(calmLinkKey("neuropal://calm"), null);
  assert.equal(calmLinkKey(`neuropal://pal?k=${key}`), null);
  assert.equal(calmLinkKey(`neuropal://calm?k=${key}0`), null, "too long");
  // the snapshot keeps a good key and drops anything else
  const withKey = snapshotAt(at(14, 10));
  const snap = buildSnapshot({ home: { nervousState: "green" }, look: {}, palette: {}, linkKey: key, now: at(14, 10) });
  assert.equal(snap.linkKey, key);
  assert.equal(parseSnapshot(JSON.stringify({ ...snap, linkKey: "<x>" })).linkKey, null);
  assert.equal(parseSnapshot(JSON.stringify(snap)).linkKey, key);
  // and the red button uses it
  const vm = buildViewModel({ snapshot: snap, checkins: [], width: 320, height: 180, now: at(14, 12) });
  assert.deepEqual(vm.buttons[2].clickActionData, { uri: `neuropal://calm?k=${key}` });
  assert.equal(withKey.linkKey, null);
});

test("calming-steps deep link (the Overwhelmed button)", () => {
  assert.equal(CALM_URL, "neuropal://calm");
  assert.ok(isCalmUrl("neuropal://calm"));
  assert.ok(isCalmUrl("NEUROPAL://calm?from=widget"));
  assert.ok(!isCalmUrl("neuropal://calmer"));
  assert.ok(!isCalmUrl("neuropal://pal"));
  assert.ok(!isAskPalUrl(CALM_URL));
  assert.ok(!isCalmUrl(undefined));
});

// ---------------------------------------------------------------- colour ---

function allPalettes() {
  const out = [];
  for (const theme of CLASSIC_THEME_NAMES) {
    for (const accent of CLASSIC_ACCENT_NAMES) out.push({ skin: "classic", name: `${theme}/${accent}`, palette: resolveClassicPalette({ theme, accent }) });
  }
  const accents = [...SIGNAL_ACCENTS.map((a) => a.hex), ...Object.keys(SIGNAL_EXTRA_ACCENT_NAMES), "#7F7F7F", "#FFFF00", "#0000FF"];
  for (const base of SIGNAL_OPTIONS.base) {
    for (const acc of accents) out.push({ skin: "signal", name: `${base}/${acc}`, palette: resolveSignalPalette({ base, acc }) });
  }
  return out;
}

test("every skin × accent gives AA text on the widget", () => {
  for (const { skin, name, palette } of allPalettes()) {
    const snap = buildSnapshot({ look: { skin }, palette, now: at(9, 0) });
    const c = widgetColors(snap.colors, skin);
    const pairs = {
      "text/bg": [c.text, c.bg],
      "muted/bg": [c.muted, c.bg],
      "btnText/buttonBg": [c.btnText, c.buttonBg],
      "fillInk/fill": [c.fillInk, c.fill],
      "askText/buttonBg": [c.askText, c.buttonBg],
      "accentText/bg": [c.accentText, c.bg],
    };
    for (const [pair, [fg, bg]] of Object.entries(pairs)) {
      assert.ok(cr(fg, bg) >= 4.5, `${name} ${pair} = ${cr(fg, bg).toFixed(2)}`);
    }
  }
});

test("hostile snapshot colours are still forced to AA", () => {
  const c = widgetColors({ surface: "#808080", onSurface: "#888888", onSurfaceVariant: "#777777", accent: "#7F7F7F", accentInk: "#808080" }, "signal");
  assert.ok(cr(c.text, c.bg) >= 4.5);
  assert.ok(cr(c.muted, c.bg) >= 4.5);
  assert.ok(cr(c.btnText, c.buttonBg) >= 4.5);
  assert.ok(cr(c.fillInk, c.fill) >= 4.5);
  assert.ok(cr(c.askText, c.buttonBg) >= 4.5);
});

// ---------------------------------------------------------------- layout ---

// Widths from 140 dp (app.json minWidth) and heights from 110 dp (minHeight).
const SIZES = [
  [250, 110], [250, 130], [290, 130], [300, 150], [320, 170], [360, 200], [360, 280], [400, 160],
  [140, 110], [140, 140], [150, 160], [180, 180], [199, 250], [220, 150],
];

function usedHeight(l) {
  const lb = (sp) => Math.ceil(sp * l.fontScale * 1.34);
  const rowH = { state: lb(TEXT_SP.state), anchor: lb(TEXT_SP.anchor), line: 2 * lb(TEXT_SP.line) };
  return 2 * l.pad + l.headerH + l.rows.reduce((s, r) => s + l.gap + rowH[r], 0) + l.gap + l.buttonH;
}

// Characters in the longest state word ("Overwhelmed"): the layout sizes for it.
const LONGEST = Math.max(...STATE_ORDER.map((id) => WIDGET_STATES[id].word.length));

test("layout fits every size and font scale; tap targets stay large", () => {
  for (const border of [0, 2]) {
    for (const fs of [1, 1.15, 1.3]) {
      for (const [w, h] of SIZES) {
        const skin = border === 2 ? "signal" : "classic"; // Signal = outline + brutal controls
        const em = WORD_EM_BY_SKIN[skin];
        const l = layoutFor(w, h, fs, { border, brutal: skin === "signal", wordEm: em });
        const at = `${w}×${h} @${fs} border ${border} (${l.mode})`;
        assert.ok(usedHeight(l) <= l.contentH, `${at}: ${usedHeight(l)} > ${l.contentH}`);
        // Check-in tap areas: full thirds of the widget, reaching into the bottom padding.
        assert.ok(l.buttonH >= 44, `${at}: button ${l.buttonH}`);
        assert.ok(l.buttonH + l.pad >= 48, `${at}: tap height ${l.buttonH + l.pad}`);
        if (l.contentH >= 130) assert.ok(l.buttonH >= 48, `${at}: button ${l.buttonH}`);
        assert.equal(l.targets.reduce((a, b) => a + b, 0), l.contentW, at);
        assert.ok(Math.min(...l.targets) >= 44, `${at}: targets ${l.targets}`);
        if (!l.narrow) {
          assert.ok(l.askH >= 40, `${at}: ask ${l.askH}`);
          if (l.contentH >= 130) assert.equal(l.askH, 48, at);
          assert.ok(l.askW >= 44, `${at}: ask width ${l.askW}`);
        }
        assert.ok(l.palH >= 24, at);
        if (l.narrow) {
          // Header holds the name (the state has its own full-width row) or,
          // when short, the state itself — which must then fit beside Pal.
          assert.ok(l.textColW >= 48, `${at}: text column ${l.textColW}`);
          // The header is the Ask Pal target; its tap area includes the top padding.
          assert.ok(l.headerH + l.pad >= 44, `${at}: ask target ${l.headerH + l.pad}`);
          // (With enlarged system text at the 140×110 minimum the word can
          // only be shortened; TalkBack still reads it in full.)
          if (l.header[0] === "state" && fs === 1) {
            const stateLine = (l.stateGlyph ? 12 + 6 : 0) + Math.ceil(LONGEST * l.stateSp * fs * em);
            assert.ok(l.textColW >= stateLine, `${at}: state ${l.textColW} < ${stateLine}`);
          }
        } else if (fs < 1.3) {
          // "● Overwhelmed" always fits beside Pal and the Ask pill.
          const stateLine = 12 + 6 + Math.ceil(LONGEST * TEXT_SP.state * fs * em);
          assert.ok(l.textColW >= stateLine, `${at}: text column ${l.textColW} < ${stateLine}`);
        }
      }
    }
  }
  // Enlarged text (up to 1.3) keeps the words on 300 dp and wider 4×2s.
  for (const fs of [1, 1.15, 1.3]) {
    for (const [w, h] of [[300, 150], [320, 170], [360, 200], [400, 160]]) {
      for (const skin of ["classic", "signal"]) {
        const l = layoutFor(w, h, fs, { border: skin === "signal" ? 2 : 0, brutal: skin === "signal", wordEm: WORD_EM_BY_SKIN[skin] });
        assert.notEqual(l.buttonKind, "glyph", `${w}×${h} @${fs} ${skin} lost its words`);
      }
    }
  }
  // The default 4×2 on a typical phone shows the words on the buttons.
  assert.equal(layoutFor(300, 150).buttonKind, "column");
  assert.equal(layoutFor(360, 200).buttonKind, "column");
  assert.equal(layoutFor(400, 200).buttonKind, "row");
  assert.equal(layoutFor(300, 150).mode, "standard"); // name, state and a full anchor row
  assert.equal(layoutFor(360, 200).ask, "full");
  assert.equal(layoutFor(140, 140).narrow, true);
  assert.ok(Object.values(TEXT_SP).every((sp) => sp >= 12));
});

test("view model: labels for TalkBack, actions, never colour alone", () => {
  const vm = buildViewModel({ snapshot: snapshotAt(at(14, 10)), checkins: [], width: 320, height: 180, now: at(14, 10) });
  assert.equal(vm.a11y, "Bo: checked in as okay. Next anchor: Meds at 14:30, in 20 minutes.");
  assert.deepEqual(vm.buttons.map((b) => b.word), STATE_ORDER.map((id) => WIDGET_STATES[id].word));
  assert.deepEqual(vm.buttons.map((b) => b.word), ["Okay", "Bit off", "Overwhelmed"]);
  for (const b of vm.buttons) {
    if (b.id === "red") {
      // Overwhelmed opens the calming steps in the app, which checks in there.
      assert.equal(b.clickAction, "OPEN_URI");
      assert.deepEqual(b.clickActionData, { uri: "neuropal://calm" });
      assert.match(b.a11y, /Opens the calming steps\.$/);
    } else {
      assert.equal(b.clickAction, CHECKIN_ACTION);
      assert.deepEqual(b.clickActionData, { state: b.id });
    }
    assert.match(b.a11y, new RegExp(`Check in as ${b.word}`));
    assert.match(b.glyph, /<(circle|polygon|rect) /); // a shape for every state
  }
  assert.match(vm.buttons[0].a11y, /current check-in/);
  assert.equal(vm.ask.url, "neuropal://pal");
  assert.equal(vm.ask.a11y, "Ask Bo, your Pal. Opens NeuroPal.");
  assert.equal(vm.state.word, "Okay");
  const empty = buildViewModel({ snapshot: null, checkins: [], width: 320, height: 180, now: at(9, 0) });
  assert.equal(empty.stateText, "How are you?");
  assert.equal(empty.a11y, "Pal: no check-in yet. Open NeuroPal once to sync your day.");
});

// ------------------------------------------------------------------- svg ---

test("Pal SVG renders every look and mood as plain, well-formed markup", () => {
  const moods = ["okay", "off", "over"];
  for (const shape of Object.keys(PAL_OPTIONS.shape)) {
    for (const eyes of PAL_OPTIONS.eyes) {
      for (const mouth of PAL_OPTIONS.mouth) {
        for (const extra of PAL_OPTIONS.extra) {
          for (const mood of moods) {
            const svg = palSvg({ shape, eyes, mouth, extra, colour: "Lilac" }, { mood, accent: "#FF3D2E", stroke: "#000000", shadow: 5, width: 64 });
            assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"));
            assert.doesNotMatch(svg, /rgba|undefined|NaN|null/);
            assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length);
            const opens = (svg.match(/<[a-z]+[ >]/g) || []).length;
            const selfClosed = (svg.match(/\/>/g) || []).length;
            const closes = (svg.match(/<\/[a-z]+>/g) || []).length;
            assert.equal(opens, selfClosed + closes, `${shape}/${eyes}/${mouth}/${extra}/${mood}`);
          }
        }
      }
    }
  }
  // Mood narrows and dims the visor, like the in-app Pal.
  assert.match(palSvg({}, { mood: "over" }), /<g opacity="0.45">/);
  assert.match(palSvg({}, { mood: "okay" }), /<rect x="24" y="44" width="120"/);
  // Bad colours fall back instead of reaching the markup.
  assert.doesNotMatch(palSvg({}, { accent: '"><script>' }), /script/);
  assert.match(glyphSvg("triangle", "#FFFFFF"), /<polygon/);
  assert.match(glyphSvg("square", "#FFFFFF"), /<rect/);
});

// ------------------------------------------------------------- app.json ----

test("app.json bundles every font the widget names and registers the widget", () => {
  const app = JSON.parse(readFileSync(join(APP_ROOT, "app.json"), "utf8"));
  const entry = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === "react-native-android-widget");
  assert.ok(entry, "widget plugin configured");
  const { fonts, widgets } = entry[1];
  const bundled = new Set(fonts.map((f) => basename(f).replace(/\.(ttf|otf)$/, "")));
  for (const skin of Object.values(WIDGET_FONTS)) {
    for (const role of Object.values(skin)) assert.ok(bundled.has(role.family), `font ${role.family} bundled`);
  }
  for (const f of fonts) readFileSync(join(APP_ROOT, f)); // every file exists
  const pal = widgets.find((w) => w.name === "Pal");
  assert.equal(pal.targetCellWidth, 4);
  assert.equal(pal.targetCellHeight, 2);
  assert.equal(pal.resizeMode, "horizontal|vertical");
  readFileSync(join(APP_ROOT, pal.previewImage));
  assert.equal(app.expo.android.package, "io.neuropal.app");
  assert.equal(app.expo.scheme, "neuropal");
});
