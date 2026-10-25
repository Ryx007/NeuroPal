// Everything the "Pal" home-screen widget shows, as pure functions: the
// snapshot the app writes, the check-ins the widget records, the next-anchor
// roll-forward, colour/contrast fitting and the responsive layout. No React
// Native imports, so the app, the widget's headless task and node --test all
// share exactly this logic.

import { contrastRatio, fitContrast, hexToRgb, inkFor, isHex, mix, rgbToHex } from "../theme/tokens/color.js";
import { normalizePal, palLine } from "../theme/tokens/pal.js";
import { CLASSIC_THEMES } from "../theme/tokens/tokens.js";
import {
  ASK_PAL_URL,
  CALM_URL,
  CHECKIN_ACTION,
  MAX_PENDING_CHECKINS,
  SNAPSHOT_VERSION,
  STATE_ORDER,
  WIDGET_STATES,
} from "./constants.js";
import { askGlyphSvg, glyphSvg, palSvg } from "./palSvg.js";

// ------------------------------------------------------------------ time ---

const pad2 = (n) => String(n).padStart(2, "0");

export const hhmm = (hour, minute) => `${pad2(hour)}:${pad2(minute)}`;

// Local calendar day, YYYY-MM-DD (anchors reset every morning).
export function dayStamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTime(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

const minuteOfDay = (date) => date.getHours() * 60 + date.getMinutes();

// "in 20 min" — what the widget prints.
export function relativeIn(minutes) {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

// "in 20 minutes" — what TalkBack reads.
export function relativeSpeech(minutes) {
  if (minutes <= 0) return "now";
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes < 60) return `in ${plural(minutes, "minute")}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${plural(h, "hour")}` : `in ${plural(h, "hour")} ${plural(m, "minute")}`;
}

// ----------------------------------------------------------------- state ---

export const isState = (value) => value === "green" || value === "yellow" || value === "red";

// Newest valid check-in, or null. Ties go to the later entry in the list.
export function latestCheckin(checkins) {
  let best = null;
  for (const c of Array.isArray(checkins) ? checkins : []) {
    if (!c || !isState(c.state)) continue;
    const t = toTime(c.at);
    if (t === null) continue;
    if (!best || t >= best.t) best = { state: c.state, at: c.at, t };
  }
  return best ? { state: best.state, at: best.at } : null;
}

export function parseCheckins(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && isState(c.state) && toTime(c.at) !== null)
    .map((c) => ({ state: c.state, at: String(c.at) }))
    .slice(-MAX_PENDING_CHECKINS);
}

export function appendCheckin(list, state, at) {
  if (!isState(state)) return parseCheckins(list);
  return [...parseCheckins(list), { state, at }].slice(-MAX_PENDING_CHECKINS);
}

// What the widget shows: a check-in made on the widget (not yet consumed by
// the app) wins over the app's last known state unless the app's state is
// newer.
export function effectiveState(snapshot, checkins) {
  const pending = latestCheckin(checkins);
  const snapState = snapshot && isState(snapshot.state) ? snapshot.state : null;
  if (pending) {
    const snapAt = snapshot ? toTime(snapshot.stateAt) : null;
    if (!snapState || snapAt === null || toTime(pending.at) >= snapAt) {
      return { state: pending.state, at: pending.at, pending: true };
    }
  }
  if (snapState) return { state: snapState, at: snapshot.stateAt || null, pending: false };
  return { state: null, at: null, pending: false };
}

// --------------------------------------------------------------- anchors ---

// Accepts the Redux shape ({title, time: {hour, minute}, status}) and the
// snapshot shape ({title, hour, minute, status}).
function cleanAnchor(a) {
  if (!a || typeof a !== "object") return null;
  const src = a.time && typeof a.time === "object" ? a.time : a;
  const hour = Number(src.hour);
  const minute = Number(src.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const title = typeof a.title === "string" ? a.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const status = typeof a.status === "string" ? a.status : "upcoming";
  return { title, hour, minute, status };
}

const byTime = (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

export function cleanAnchors(anchors) {
  return (Array.isArray(anchors) ? anchors : []).map(cleanAnchor).filter(Boolean).sort(byTime).slice(0, 48);
}

// The first anchor still ahead of the clock today that isn't done. When the
// statuses are from another day (the app resets them every morning) they
// are ignored. Unlike Home's card there is no fallback to a past anchor:
// the widget says "No more anchors today" instead.
export function pickNextAnchor(anchorsToday, now, { statusesValid = true } = {}) {
  const nowMin = minuteOfDay(now);
  for (const a of anchorsToday) {
    if (statusesValid && a.status === "done") continue;
    const at = a.hour * 60 + a.minute;
    if (at >= nowMin) return { ...a, minutesUntil: at - nowMin };
  }
  return null;
}

// ---------------------------------------------------------------- colour ---

const CLASSIC_DARK = CLASSIC_THEMES.dark;
export const DEFAULT_COLORS = {
  surface: CLASSIC_DARK.surface,
  onSurface: CLASSIC_DARK.onSurface,
  onSurfaceVariant: CLASSIC_DARK.onSurfaceVariant,
  accent: CLASSIC_DARK.primary,
  accentInk: CLASSIC_DARK.onPrimary,
};

const normHex = (value, fallback) => (isHex(value) ? rgbToHex(hexToRgb(value)) : fallback);

function cleanColors(colors) {
  const c = colors && typeof colors === "object" ? colors : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_COLORS)) out[key] = normHex(c[key], DEFAULT_COLORS[key]);
  return out;
}

// The widget's colours, from the user's skin snapshot. Text is re-checked
// here (the widget draws on an opaque surface, never over the wallpaper) and
// nudged with the token system's fitContrast whenever a pair would fall
// under 4.5:1, so a stale or odd snapshot can never produce unreadable text.
export function widgetColors(colors, skin = "classic") {
  const c = cleanColors(colors);
  const bg = hexToRgb(c.surface);
  const darkBg = contrastRatio([255, 255, 255], bg) >= contrastRatio([0, 0, 0], bg);
  const ensure = (fg, on) => (contrastRatio(fg, on) >= 4.5 ? fg : fitContrast(fg, on, 4.6));
  const signal = skin === "signal";

  const text = ensure(hexToRgb(c.onSurface), bg);
  const muted = ensure(hexToRgb(c.onSurfaceVariant), bg);
  // Buttons sit one opaque step off the background.
  const buttonBg = mix(bg, text, signal ? 0.07 : 0.1);
  const btnText = ensure(text, buttonBg);
  const fill = hexToRgb(c.accent);
  const fillInk = contrastRatio(hexToRgb(c.accentInk), fill) >= 4.5 ? hexToRgb(c.accentInk) : inkFor(fill);
  const accentText = ensure(fill, bg);
  // "Ask Pal" is tonal (accent text on the button tone): the accent fill is
  // kept for the current check-in so only one thing on the widget is loud.
  const askText = ensure(fill, buttonBg);
  // Decoration only (outlines, Pal's stroke). Signal's control outline is
  // the muted ink, which also clears 3:1 for UI boundaries.
  const border = signal ? muted : mix(bg, text, 0.16);
  const hardInk = darkBg ? [0, 0, 0] : text;
  const palStroke = signal ? hardInk : mix(bg, text, 0.3);

  const out = { bg, text, muted, buttonBg, btnText, fill, fillInk, accentText, askText, border, hardInk, palStroke };
  for (const key of Object.keys(out)) out[key] = rgbToHex(out[key]);
  out.dark = darkBg;
  return out;
}

// --------------------------------------------------------------- fonts -----

// Font files bundled for the widget through the react-native-android-widget
// config plugin (app.json → plugins → fonts). fontFamily = file name without
// the extension; fontWeight matches the file so Android never fakes a weight.
export const WIDGET_FONTS = {
  classic: {
    display: { family: "SpaceGrotesk_700Bold", weight: "700" },
    body: { family: "Inter_600SemiBold", weight: "600" },
    label: { family: "Inter_600SemiBold", weight: "600" },
  },
  signal: {
    display: { family: "Archivo-Bold", weight: "700" },
    body: { family: "AtkinsonHyperlegibleNext-600", weight: "600" },
    label: { family: "AtkinsonHyperlegibleMono-700", weight: "700" },
  },
};

// --------------------------------------------------------------- layout ----

// Text sizes in sp (never under 12) and width estimates. Measured with the
// bundled fonts: words run 0.40–0.62 em per character; "Overwhelmed" (the
// longest fixed word, wide w and m) is 6.75 em in Inter SemiBold (Classic)
// and 6.32 em in Atkinson Hyperlegible Next SemiBold (Signal). So ~3% over
// those for the fixed words, 0.54 for free text (titles), and ellipsis on
// the device as the backstop.
export const TEXT_SP = { name: 16, nameNarrow: 14, state: 13, anchor: 12, line: 12, button: 12, ask: 13 };
const WORD_EM = 0.633;
export const WORD_EM_BY_SKIN = { classic: 0.633, signal: 0.593 };
const TEXT_EM = 0.54;
const lineBox = (sp, fs) => Math.ceil(sp * fs * 1.34);
export const textWidth = (text, sp, fs = 1, em = WORD_EM) => Math.ceil(String(text).length * sp * fs * em);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LONGEST_WORD = STATE_ORDER.map((id) => WIDGET_STATES[id].word).reduce((a, b) => (b.length > a.length ? b : a));
const MIN_TARGET = 48;

/**
 * Responsive layout for the widget's reported size (dp) and the user's font
 * scale. Picks the richest arrangement that fits; any spare height is left
 * around a vertically centred block (some launchers report a taller widget
 * than they draw, which crops the bottom of the bitmap).
 *
 * The check-in row runs edge to edge: each button's tap area is a full third
 * of the widget (reaching into the side and bottom padding) while the
 * visible buttons stay inset and equal, so even a 140 dp-wide widget keeps
 * targets ≥ 44 dp wide and ≥ 48 dp tall.
 */
export function layoutFor(width, height, fontScale = 1, { border = 0, brutal = false, wordEm = WORD_EM } = {}) {
  // Signal's "brutal" controls: 2 dp outline + 4 dp hard shadow edge, which
  // Android counts as extra padding inside the pill / button.
  const bx = brutal ? 6 : 0;
  const wordWidth = (word, sp, scale) => textWidth(word, sp, scale, wordEm);
  const W = clamp(Math.round(Number(width) || 250), 60, 2000);
  const H = clamp(Math.round(Number(height) || 110), 60, 2000);
  const fs = clamp(Number(fontScale) || 1, 0.85, 2);
  const cw = W - 2 * border; // content box inside the widget's outline
  const ch = H - 2 * border;
  // "● Overwhelmed"; without the shape glyph only where nothing else fits
  // (the word alone still says the state — never colour alone).
  const stateLine = (sp, withGlyph = true) => (withGlyph ? 12 + 6 : 0) + wordWidth(LONGEST_WORD, sp, fs);
  // Wide = the header fits Pal (44) + "● Overwhelmed" + the smallest Ask
  // button (48) side by side; otherwise the narrow (2×2-style) layout.
  const narrow = cw < 2 * 12 + 44 + 10 + stateLine(TEXT_SP.state) + 10 + 48;
  const pad = narrow ? 6 : ch < 130 ? 8 : ch < 160 ? 10 : 12;
  const gap = narrow || ch < 130 ? 4 : ch < 160 ? 6 : 8;
  const inner = cw - 2 * pad;

  // Check-in buttons: glyph + word side by side, stacked, or glyph only.
  // Narrow widgets inset the row a little less so the middle third (the
  // smallest tap area) stays ≥ 44 dp.
  const btnGap = narrow ? 4 : 6;
  const edge = narrow ? 4 : pad;
  const visualW = (cw - 2 * edge - 2 * btnGap) / 3;
  const wordW = wordWidth(LONGEST_WORD, TEXT_SP.button, fs);
  let buttonKind = "glyph";
  if (12 + 6 + wordW + 16 + bx <= visualW) buttonKind = "row";
  // Stacked, the word is centred under the glyph: the ~3% in WORD_EM is its
  // side room, so the default 4×2 (300 dp) still shows "Overwhelmed".
  else if (wordW + 2 + bx <= visualW) buttonKind = "column";
  // With enlarged text the words stay as long as most of the longest fits:
  // "Overwhel…" still reads as the word (TalkBack says it whole), shapes
  // alone don't. Not on the shortest widgets, whose header needs the height.
  else if (ch >= 130 && visualW - 2 - bx >= 0.75 * wordW) buttonKind = "column";
  // Visible button height. The tap area adds the bottom padding below it, so
  // even the 44 dp buttons of very short widgets are ≥ 50 dp tall to touch.
  const buttonH =
    buttonKind === "column"
      ? Math.max(MIN_TARGET, 8 + 12 + 3 + lineBox(TEXT_SP.button, fs) + 8)
      : ch < 130
        ? 44
        : MIN_TARGET;
  const first = Math.round(visualW + edge + btnGap / 2);
  const middle = Math.round(visualW + btnGap);
  const targets = [first, middle, cw - first - middle];
  const avail = ch - 2 * pad - buttonH - gap;

  const nameSp = narrow ? TEXT_SP.nameNarrow : TEXT_SP.name;
  const nameH = lineBox(nameSp, fs);
  const stateH = lineBox(TEXT_SP.state, fs);
  const anchorH = lineBox(TEXT_SP.anchor, fs);
  const lineH = 2 * lineBox(TEXT_SP.line, fs);

  let mode;
  let headerH;
  let rows; // optional rows under the header, top to bottom
  let header; // what the header's text column holds
  if (narrow) {
    // The header (Pal + name) is itself the "Ask Pal" button; state and
    // anchor get full-width rows so the words are never squeezed.
    const candidates = [
      { mode: "roomy", header: ["name"], rows: ["state", "anchor"], min: 36 },
      { mode: "standard", header: ["name"], rows: ["state"], min: 36 },
      { mode: "short", header: ["state"], rows: [], min: 28 },
    ];
    const rowH = { state: stateH, anchor: anchorH };
    const textH = (c) => (c.header[0] === "name" ? nameH : stateH);
    const need = (c) => Math.max(c.min, textH(c)) + c.rows.reduce((s, r) => s + gap + rowH[r], 0);
    const pick = candidates.find((c) => need(c) <= avail) || candidates[candidates.length - 1];
    mode = pick.mode;
    header = pick.header;
    rows = pick.rows;
    const rowsH = rows.reduce((s, r) => s + gap + rowH[r], 0);
    headerH = clamp(avail - rowsH, Math.max(24, textH(pick)), 56);
  } else {
    const nameState = nameH + 2 + stateH;
    const stateAnchor = stateH + 2 + anchorH;
    const candidates = [
      { mode: "roomy", header: ["name", "state"], rows: ["anchor", "line"], text: nameState, min: MIN_TARGET },
      { mode: "standard", header: ["name", "state"], rows: ["anchor"], text: nameState, min: MIN_TARGET },
      { mode: "short", header: ["state", "anchor"], rows: [], text: stateAnchor, min: 40 },
      { mode: "tiny", header: ["state"], rows: [], text: stateH, min: 32 },
    ];
    const rowH = { anchor: anchorH, line: lineH };
    const need = (c) => Math.max(c.min, c.text) + c.rows.reduce((s, r) => s + gap + rowH[r], 0);
    const pick = candidates.find((c) => need(c) <= avail) || candidates[candidates.length - 1];
    mode = pick.mode;
    header = pick.header;
    rows = pick.rows;
    const rowsH = rows.reduce((s, r) => s + gap + rowH[r], 0);
    headerH = clamp(avail - rowsH, Math.max(pick.min, pick.text), 76);
  }

  // Pal fills the header height, within limits that keep room for the text;
  // its width follows the 260:240 view box.
  const palCap = narrow ? Math.min(52, Math.round(inner * 0.32)) : Math.min(72, Math.round(inner * 0.24));
  let palH = clamp(headerH, 24, Math.max(24, palCap));
  const palWidth = (h) => Math.round((h * 260) / 240);

  // "Ask Pal" in wide layouts: prefer the full label (shrinking Pal down to
  // 44 dp if needed), then "Ask", then the bubble alone — always leaving the
  // text column room for "● Overwhelmed".
  let ask = "header";
  let askW = 0;
  const askH = Math.min(MIN_TARGET, headerH);
  let stateSp = TEXT_SP.state;
  let stateGlyph = true;
  let askGlyphInHeader = true;
  if (!narrow) {
    const need = stateLine(TEXT_SP.state);
    const options = [
      { kind: "full", w: 12 + 18 + 6 + wordWidth("Ask Pal", TEXT_SP.ask, fs) + 12 + bx },
      { kind: "short", w: 12 + 18 + 6 + wordWidth("Ask", TEXT_SP.ask, fs) + 12 + bx },
      { kind: "icon", w: Math.max(askH, 44) },
    ];
    const roomForPal = (o) => inner - 10 - o.w - 10 - need;
    const fit = options.find((o) => roomForPal(o) >= Math.min(44, palWidth(palH))) || options[options.length - 1];
    ask = fit.kind;
    askW = fit.w;
    const maxPalW = Math.max(palWidth(24), roomForPal(fit));
    while (palWidth(palH) > maxPalW && palH > 24) palH -= 1;
  } else if (header[0] === "state") {
    // Narrow and short: Pal and "● Overwhelmed" share the header. Give up, in
    // order, the 13 sp size, the bubble, the state's shape glyph (the word
    // stays), then Pal's size (down to 24 dp).
    const options = [
      { sp: TEXT_SP.state, glyph: true, stateGlyph: true },
      { sp: TEXT_SP.button, glyph: true, stateGlyph: true },
      { sp: TEXT_SP.state, glyph: false, stateGlyph: true },
      { sp: TEXT_SP.button, glyph: false, stateGlyph: true },
      { sp: TEXT_SP.button, glyph: false, stateGlyph: false },
    ];
    const roomForPal = (o) => inner - 8 - (o.glyph ? 20 : 0) - stateLine(o.sp, o.stateGlyph);
    const fit = options.find((o) => roomForPal(o) >= Math.min(palWidth(palH), 36)) ||
      options.find((o) => roomForPal(o) >= palWidth(26)) ||
      options[options.length - 1];
    stateSp = fit.sp;
    stateGlyph = fit.stateGlyph;
    askGlyphInHeader = fit.glyph;
    const maxPalW = Math.max(palWidth(24), roomForPal(fit));
    while (palWidth(palH) > maxPalW && palH > 24) palH -= 1;
  }
  const palW = palWidth(palH);
  const textColW = narrow ? inner - palW - 8 - (askGlyphInHeader ? 20 : 0) : inner - palW - 10 - askW - 10;

  return {
    width: W,
    height: H,
    fontScale: fs,
    border,
    contentW: cw,
    contentH: ch,
    narrow,
    mode,
    pad,
    gap,
    inner,
    header,
    rows,
    headerH,
    palW,
    palH,
    textColW,
    stateSp,
    stateGlyph,
    ask,
    askW,
    askH,
    askGlyphInHeader,
    buttonKind,
    buttonH,
    btnGap,
    edge,
    targets,
    visualW: Math.floor(visualW),
    glyph: buttonKind === "glyph" ? 16 : 12,
    nameSp,
  };
}

// Fit "Title · 14:30 · in 20 min" into `maxW` dp: the title is shortened
// first, then the relative part dropped — the clock time always survives.
function anchorText(next, maxW, sp, fs) {
  const time = hhmm(next.hour, next.minute);
  const rel = relativeIn(next.minutesUntil);
  const charW = sp * fs * TEXT_EM;
  const tryWith = (suffix) => {
    const room = Math.floor((maxW - textWidth(suffix, sp, fs, TEXT_EM)) / charW);
    if (next.title.length <= room) return `${next.title}${suffix}`;
    if (room >= 5) return `${next.title.slice(0, room - 1).trimEnd()}…${suffix}`;
    return null;
  };
  return tryWith(` · ${time} · ${rel}`) || tryWith(` · ${time}`) || `${time} · ${next.title}`;
}

// ------------------------------------------------------------- snapshot ----

// What the app writes to SNAPSHOT_KEY. `palette` is the resolved palette
// from ThemeProvider (accentFill is the accent as a fill; accentInk is the
// text colour the token system guarantees on it).
const LINK_KEY_RE = /^[a-f0-9]{32}$/;

export function buildSnapshot({ home = {}, look = {}, palette = {}, stateAt = null, now = new Date(), linkKey = null } = {}) {
  const pal = normalizePal(look.pal);
  const sameDay = !home.dayStamp || home.dayStamp === dayStamp(now);
  const anchorsToday = cleanAnchors(home.anchors).map((a) => (sameDay ? a : { ...a, status: "upcoming" }));
  const next = pickNextAnchor(anchorsToday, now);
  const tasks = Array.isArray(home.tasks) ? home.tasks : [];
  const firstOpen = tasks.find((t) => t && !t.done && typeof t.title === "string" && t.title.trim());
  const state = isState(home.nervousState) ? home.nervousState : null;
  return {
    v: SNAPSHOT_VERSION,
    state,
    stateAt: state ? stateAt || null : null,
    nextAnchor: next ? { title: next.title, hour: next.hour, minute: next.minute } : null,
    anchorsToday,
    pal,
    palName: pal.name,
    // Same line Home's Pal note shows (HomeScreen.jsx).
    line: palLine(pal, firstOpen ? `“${firstOpen.title.trim()}”` : "your next task"),
    skin: look.skin === "signal" ? "signal" : "classic",
    colors: {
      surface: normHex(palette.surface, DEFAULT_COLORS.surface),
      onSurface: normHex(palette.onSurface, DEFAULT_COLORS.onSurface),
      onSurfaceVariant: normHex(palette.onSurfaceVariant, DEFAULT_COLORS.onSurfaceVariant),
      accent: normHex(palette.accentFill || palette.accent, DEFAULT_COLORS.accent),
      accentInk: normHex(palette.accentInk, DEFAULT_COLORS.accentInk),
    },
    linkKey: typeof linkKey === "string" && LINK_KEY_RE.test(linkKey) ? linkKey : null,
    updatedAt: now.toISOString(),
  };
}

// Defensive read of SNAPSHOT_KEY (string or object). Null if absent/unknown.
export function parseSnapshot(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || obj.v !== SNAPSHOT_VERSION) return null;
  const pal = normalizePal(obj.pal);
  const palName = typeof obj.palName === "string" && obj.palName.trim() ? obj.palName.trim().slice(0, 14) : pal.name;
  const next = cleanAnchor(obj.nextAnchor);
  return {
    v: SNAPSHOT_VERSION,
    state: isState(obj.state) ? obj.state : null,
    stateAt: typeof obj.stateAt === "string" ? obj.stateAt : null,
    nextAnchor: next ? { title: next.title, hour: next.hour, minute: next.minute } : null,
    anchorsToday: cleanAnchors(obj.anchorsToday),
    pal,
    palName,
    line: typeof obj.line === "string" ? obj.line.trim().slice(0, 160) : "",
    skin: obj.skin === "signal" ? "signal" : "classic",
    colors: cleanColors(obj.colors),
    linkKey: typeof obj.linkKey === "string" && LINK_KEY_RE.test(obj.linkKey) ? obj.linkKey : null,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : null,
  };
}

// Stable comparison key (ignores updatedAt) so unchanged state isn't rewritten.
export function snapshotKey(snapshot) {
  if (!snapshot) return "";
  const { updatedAt, ...rest } = snapshot;
  return JSON.stringify(rest);
}

export function isAskPalUrl(url) {
  return typeof url === "string" && /^neuropal:\/\/pal(?:[/?#]|$)/i.test(url.trim());
}

export function isCalmUrl(url) {
  return typeof url === "string" && /^neuropal:\/\/calm(?:[/?#]|$)/i.test(url.trim());
}

// The widget's link for "Overwhelmed": with the app's secret key when known.
export function calmUrlFor(linkKey) {
  return typeof linkKey === "string" && LINK_KEY_RE.test(linkKey) ? `${CALM_URL}?k=${linkKey}` : CALM_URL;
}

// The key a calm link carries, or null.
export function calmLinkKey(url) {
  if (!isCalmUrl(url)) return null;
  const m = /[?&]k=([a-f0-9]{32})(?:[&#]|$)/i.exec(String(url).trim());
  return m ? m[1].toLowerCase() : null;
}

// ----------------------------------------------------------- view model ----

const RED_LINE = "Everything else can wait. I’m here when you want me.";

function lineFor(stateId, snapshot) {
  if (stateId === "red") return RED_LINE;
  if (!snapshot) return "Tap how you feel. Open NeuroPal any time.";
  if (!stateId) return "How are you right now? One tap is enough.";
  return snapshot.line;
}

/**
 * Everything PalWidget.jsx draws, for one widget instance.
 * @param {object} p
 *   snapshot  SNAPSHOT_KEY contents (string/object/null)
 *   checkins  CHECKINS_KEY contents (pending widget check-ins)
 *   width, height  widget size in dp (WidgetInfo)
 *   fontScale  WidgetInfo.screenInfo.fontScale
 *   now  Date
 */
export function buildViewModel({ snapshot: rawSnapshot, checkins: rawCheckins, width, height, fontScale = 1, now = new Date() } = {}) {
  const snapshot = parseSnapshot(rawSnapshot);
  const checkins = parseCheckins(rawCheckins);
  const skin = snapshot ? snapshot.skin : "classic";
  const colors = widgetColors(snapshot ? snapshot.colors : null, skin);
  const fonts = WIDGET_FONTS[skin];
  // Signal draws a 2 dp outline around the widget and brutal controls.
  const signal = skin === "signal";
  const layout = layoutFor(width, height, fontScale, {
    border: signal ? 2 : 0,
    brutal: signal,
    wordEm: WORD_EM_BY_SKIN[skin],
  });
  const fs = layout.fontScale;

  const current = effectiveState(snapshot, checkins);
  const st = current.state ? WIDGET_STATES[current.state] : null;
  const pal = snapshot ? snapshot.pal : normalizePal({});
  const name = snapshot ? snapshot.palName : pal.name;

  // Next anchor, rolled forward to the current time.
  let anchor;
  if (!snapshot) {
    anchor = { next: null, text: "Open NeuroPal once to sync your day", speech: "Open NeuroPal once to sync your day" };
  } else {
    const sameDay = snapshot.updatedAt ? dayStamp(new Date(snapshot.updatedAt)) === dayStamp(now) : false;
    const list = snapshot.anchorsToday.length
      ? snapshot.anchorsToday
      : snapshot.nextAnchor
        ? [{ ...snapshot.nextAnchor, status: "upcoming" }]
        : [];
    const next = pickNextAnchor(list, now, { statusesValid: sameDay });
    if (next) {
      const inHeader = layout.header.includes("anchor");
      const labelW = layout.narrow || inHeader ? 0 : textWidth(skin === "signal" ? "NEXT" : "Next", TEXT_SP.anchor, fs) + 8;
      const maxW = (inHeader ? layout.textColW : layout.inner) - labelW;
      anchor = {
        next,
        text: anchorText(next, maxW, TEXT_SP.anchor, fs),
        speech: `Next anchor: ${next.title} at ${hhmm(next.hour, next.minute)}, ${relativeSpeech(next.minutesUntil)}`,
      };
    } else {
      anchor = { next: null, text: "No more anchors today", speech: "No more anchors today" };
    }
  }

  const stateSpeech = st ? `Checked in as ${st.word}` : "No check-in yet";
  const askLabel = layout.ask === "full" ? "Ask Pal" : layout.ask === "short" ? "Ask" : "";
  // Narrow widgets: the header is the "Ask Pal" button and the bubble sits on
  // the background; wide widgets: the bubble is inside the tonal pill.
  const askInk = layout.narrow ? colors.accentText : colors.askText;

  return {
    skin,
    colors,
    fonts,
    layout,
    name,
    pal: {
      svg: palSvg(pal, {
        mood: st ? st.mood : "okay",
        accent: colors.fill,
        stroke: colors.palStroke,
        shadow: skin === "signal" ? 5 : 0,
        width: layout.palW,
      }),
      width: layout.palW,
      height: layout.palH,
    },
    state: st
      ? { id: st.id, word: st.word, glyph: glyphSvg(st.glyph, colors.text, 12), pending: current.pending }
      : null,
    stateText: st ? st.word : "How are you?",
    anchor,
    line: lineFor(st ? st.id : null, snapshot),
    buttons: STATE_ORDER.map((id) => {
      const s = WIDGET_STATES[id];
      const selected = current.state === id;
      return {
        id,
        word: s.word,
        selected,
        glyph: glyphSvg(s.glyph, selected ? colors.fillInk : colors.btnText, layout.glyph),
        // Red opens the app on the calming steps (it checks in there).
        clickAction: id === "red" ? "OPEN_URI" : CHECKIN_ACTION,
        clickActionData: id === "red" ? { uri: calmUrlFor(snapshot ? snapshot.linkKey : null) } : { state: id },
        a11y:
          (selected ? `Check in as ${s.word}. This is your current check-in.` : `Check in as ${s.word}`) +
          (id === "red" ? `${selected ? "" : "."} Opens the calming steps.` : ""),
      };
    }),
    ask: {
      url: ASK_PAL_URL,
      label: askLabel,
      glyph: askGlyphSvg(askInk, layout.narrow ? 16 : 18),
      a11y: `Ask ${name === "Pal" ? "Pal" : `${name}, your Pal`}. Opens NeuroPal.`,
    },
    a11y: `${name}: ${stateSpeech.toLowerCase()}. ${anchor.speech}.${layout.rows.includes("line") ? ` ${lineFor(st ? st.id : null, snapshot)}` : ""}`,
  };
}
