// "Ask Pal" — natural language → a PROPOSED settings change. The proposal is
// shown as a preview + change list and only applied when the user says so
// (preview → apply → undo). This keyword interpreter is the offline floor;
// when the AI backend is reachable a model can map free text onto the SAME
// output shape, so every client keeps one flow.
import { diffAppearance, normalizeAppearance } from "./appearance.js";
import { normalizeHome, ordinal } from "./home.js";
import { HOME_TILES } from "./tokens.js";

const MOTION = ["Still", "Calm", "Lively", "Wild"];

function clean(text) {
  return ` ${String(text || "").toLowerCase().replace(/[^a-z0-9#\s-]/g, " ")} `;
}

export function interpretAppearance(text, appearance) {
  const s = clean(text);
  const has = (re) => re.test(s);
  const cur = normalizeAppearance(appearance);
  const n = JSON.parse(JSON.stringify(cur));

  if (has(/\b(classic|original|old look|minimal look)\b/)) n.skin = "classic";
  if (has(/\b(signal|funky|funkier|brutal|brutalist)\b/)) n.skin = "signal";

  if (n.skin === "classic") {
    const c = n.classic;
    if (has(/\b(sepia|paper|book|warm|warmer|evening|cozy|cosy)\b/)) c.theme = "sepia";
    if (has(/\b(light|bright|brighter|daylight|day)\b/)) c.theme = "light";
    if (has(/\b(dark|darker|night)\b/)) c.theme = "dark";
    if (has(/\b(contrast|readable|legible|low vision)\b/)) c.theme = "contrast";
    if (has(/\b(ruby|red|pink|rose)\b/)) c.accent = "ruby";
    if (has(/\b(cyan|blue|teal|aqua)\b/)) c.accent = "cyan";
    if (has(/\b(purple|violet|lilac)\b/)) c.accent = "purple";
    if (has(/\b(green|mint|sage)\b/)) c.accent = "green";
  } else {
    const g = n.signal;
    let mi = Math.max(0, MOTION.indexOf(g.motion));
    if (has(/\b(still|static|no motion|no animation|stop moving|freeze)\b/)) mi = 0;
    else if (has(/\b(calm|calmer|gentle|gentler|quiet|quieter|slower|less motion|less animation|less busy)\b/)) mi = Math.max(0, mi - 1);
    else if (has(/\b(wild|wilder|more motion|more animated|more animation|livelier|energetic|more energy|faster|alive)\b/)) mi = Math.min(3, mi + 1);
    g.motion = MOTION[mi];
    if (has(/\b(evening|night|bedtime|late)\b/)) {
      g.base = "Black";
      if (MOTION.indexOf(g.motion) > 1) g.motion = "Calm";
      g.texture = "None";
    }
    if (has(/\b(contrast|readable|legible|low vision)\b/)) {
      if (g.base !== "Concrete") g.base = "Black";
      g.texture = "None";
      g.brutality = 3;
    }
    if (has(/\b(light|bright|brighter|daylight|day)\b/)) g.base = "Concrete";
    if (has(/\b(warm|warmer|cozy|cosy)\b/)) g.base = "Warm";
    if (has(/\b(grey|gray|graphite)\b/)) g.base = "Graphite";
    const cols = [
      [/\b(red|crimson|scarlet)\b/, "#FF3D2E"],
      [/\b(orange|ember)\b/, "#FF6A1A"],
      [/\b(amber|yellow|gold)\b/, "#FFB21A"],
      [/\b(green|lime|mint)\b/, "#3DDC84"],
      [/\b(cyan|blue|teal|aqua)\b/, "#2EC7F0"],
      [/\b(purple|violet|ultraviolet|uv)\b/, "#8B5CFF"],
      [/\b(pink|magenta)\b/, "#FF4FA3"],
    ];
    for (const [re, hex] of cols) if (has(re)) g.acc = hex;
    const hexm = s.match(/#([0-9a-f]{6})\b/);
    if (hexm) g.acc = `#${hexm[1].toUpperCase()}`;
    if (has(/\b(sharp|sharper|square|boxy)\b/)) g.corners = "Sharp";
    if (has(/\b(round|rounder|rounded|bubbly)\b/)) g.corners = "Round";
    if (has(/\b(grain|grainy|film)\b/)) g.texture = "Grain";
    if (has(/\b(scanline|scanlines|crt|retro)\b/)) g.texture = "Scanlines";
    if (has(/\b(clean|smooth|no texture)\b/)) g.texture = "None";
    if (has(/\b(bolder|heavier|chunkier|more brutal|harder)\b/)) g.brutality = Math.min(3, Number(g.brutality) + 1);
    if (has(/\b(flatter|flat|subtle|subtler|softer)\b/)) g.brutality = Math.max(0, Number(g.brutality) - 1);
    if (has(/\b(chladni|plate|sand|cymatics)\b/)) g.field = "Chladni";
    if (has(/\b(interference|wave|waves|fringes|double slit|ripples)\b/)) g.field = "Interference";
    if (has(/\b(grid|graph paper)\b/)) g.field = "Grid";
    if (has(/\b(plain|no background|no field|less busy|simpler|simple)\b/)) g.field = "None";
    if (has(/\b(condensed|narrow|narrower)\b/)) g.type = "Condensed";
    if (has(/\b(wide|wider|extended)\b/)) g.type = "Wide";
    if (has(/\b(grotesk)\b/)) g.type = "Grotesk";
  }

  const next = normalizeAppearance(n);
  const rows = diffAppearance(cur, next);
  if (!rows.length) {
    return { error: "I can’t map that yet. I can change colour, motion, background, texture, corners, contrast or skin." };
  }
  return { next, rows };
}

function findTile(s) {
  let best = null;
  let at = Infinity;
  for (const id of Object.keys(HOME_TILES)) {
    for (const w of HOME_TILES[id].words) {
      const k = s.indexOf(w);
      if (k >= 0 && k < at) {
        at = k;
        best = id;
      }
    }
  }
  return best;
}

// "reading first on weekdays" → a day rule; "hide Pal's note" → base change.
export function interpretHome(text, home) {
  const s = ` ${String(text || "").toLowerCase()} `;
  const h = normalizeHome(home);
  const id = findTile(s);
  if (!id) return { error: "I couldn’t tell which tile you mean. Try reading, focus, anchor, check-in, tasks or Pal." };
  const name = HOME_TILES[id].name;
  const scope = /weekday/.test(s) ? "Weekdays" : /weekend/.test(s) ? "Weekends" : null;
  let act = null;
  if (/\b(hide|remove|don.?t show|without)\b/.test(s)) act = "hide";
  else if (/\b(first|top|start|lead)\b/.test(s)) act = "first";
  else if (/\b(last|bottom|end)\b/.test(s)) act = "last";
  else if (/\b(show|add|bring back|include)\b/.test(s)) act = "show";
  else if (/\b(bigger|larger|more space|expand|big)\b/.test(s)) act = "bigger";
  else if (/\b(smaller|compact|less space|shrink|small)\b/.test(s)) act = "smaller";
  if (!act) return { error: `I found ${name}, but not what to do with it. Try first, last, hide, show, bigger or smaller.` };

  const idx = h.tiles.findIndex((t) => t.id === id);
  const tile = h.tiles[idx];
  if (scope && ["first", "last", "hide"].includes(act)) {
    const rules = h.rules.filter((r) => !(r.scope === scope && r.tile === id)).concat([{ scope, tile: id, act }]);
    const label = act === "hide" ? "hidden" : act;
    return {
      next: { tiles: h.tiles, rules },
      title: `${name} ${label} on ${scope.toLowerCase()}?`,
      message: "A day rule. Your base layout stays as it is for the other days.",
      rows: [{ k: scope, from: tile.hidden ? "hidden" : ordinal(idx + 1), to: label }],
    };
  }

  const tiles = h.tiles.map((t) => ({ ...t }));
  const i = tiles.findIndex((t) => t.id === id);
  const SIZES = ["S", "M", "L"];
  let row;
  if (act === "first" || act === "last") {
    const [t] = tiles.splice(i, 1);
    t.hidden = false;
    if (act === "first") tiles.unshift(t);
    else tiles.push(t);
    row = { k: "Position", from: ordinal(i + 1), to: act === "first" ? "1st" : ordinal(tiles.length) };
  } else if (act === "hide" || act === "show") {
    tiles[i].hidden = act === "hide";
    row = { k: "Visible", from: tile.hidden ? "no" : "yes", to: act === "hide" ? "no" : "yes" };
  } else {
    const k = SIZES.indexOf(tiles[i].size);
    tiles[i].size = SIZES[Math.max(0, Math.min(2, k + (act === "bigger" ? 1 : -1)))];
    row = { k: "Size", from: tile.size, to: tiles[i].size };
  }
  if (row.from === row.to) return { error: `${name} is already like that.` };
  return {
    next: { tiles, rules: h.rules },
    title: `Change ${name}?`,
    message: "Every day. The preview shows the result first.",
    rows: [row],
  };
}
