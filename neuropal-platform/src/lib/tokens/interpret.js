// GENERATED from packages/tokens/src — do not edit here.
// Change packages/tokens, then run: node packages/tokens/scripts/sync.js
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
  return ` ${String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9#\s-]/g, " ").replace(/\s+/g, " ")} `;
}

// Words the user explicitly does NOT want: "no grid", "without grain",
// "not so wild", "less red". Returns the negated words and the text with
// those phrases removed, so a negated keyword never counts as a request.
function splitNegations(s) {
  const neg = new Set();
  const re = /\b(?:no|not|without|less|fewer|never|dont want|do not want)\s+(?:so\s+|too\s+|that\s+|very\s+|the\s+|any\s+|more\s+)?([a-z0-9#-]+)/g;
  const positive = s.replace(re, (m, word) => {
    neg.add(word);
    return " ";
  });
  return { neg, positive };
}

export function interpretAppearance(text, appearance) {
  const raw = clean(text);
  const cur = normalizeAppearance(appearance);
  const n = JSON.parse(JSON.stringify(cur));
  let matched = false;
  const hit = (cond) => {
    if (cond) matched = true;
    return cond;
  };

  // Phrases whose meaning includes a negator are read whole, first.
  const still = /\b(no motion|no animation|no movement|stop moving|freeze|still|static)\b/.test(raw);
  const calmer = /\b(calm it down|calm down|calmer|gentler|quieter|slower|less motion|less animation|less movement|less busy|tone it down)\b/.test(raw);
  const noField = /\b(no background|no field|no pattern|plain background|plain|less busy|simpler|simple)\b/.test(raw);
  const noTexture = /\b(no texture|clean|smooth)\b/.test(raw);
  const darker = /\b(less bright|not so bright|not as bright|dimmer|darker)\b/.test(raw);
  const stripped = raw.replace(
    /\b(no motion|no animation|no movement|stop moving|calm it down|calm down|less motion|less animation|less movement|less busy|tone it down|no background|no field|no pattern|plain background|no texture|less bright|not so bright|not as bright)\b/g,
    " ",
  );
  const { neg, positive } = splitNegations(stripped);
  const has = (re) => re.test(positive);
  const negated = (...words) => words.some((w) => neg.has(w));

  if (hit(has(/\b(classic|original|old look|minimal look)\b/))) n.skin = "classic";
  if (hit(has(/\b(signal|funky|funkier|brutal|brutalist)\b/))) n.skin = "signal";

  if (n.skin === "classic") {
    const c = n.classic;
    if (hit(has(/\b(sepia|paper|book|warm|warmer|evening|cozy|cosy)\b/))) c.theme = "sepia";
    if (hit(has(/\b(light|bright|brighter|daylight|day)\b/))) c.theme = "light";
    if (hit(darker || has(/\b(dark|night)\b/) || negated("bright", "light"))) c.theme = "dark";
    if (hit(has(/\b(contrast|readable|legible|low vision)\b/))) c.theme = "contrast";
    if (hit(negated("contrast")) && c.theme === "contrast") c.theme = "dark";
    if (hit(has(/\b(ruby|red|pink|rose)\b/))) c.accent = "ruby";
    if (hit(has(/\b(cyan|blue|teal|aqua)\b/))) c.accent = "cyan";
    if (hit(has(/\b(purple|violet|lilac)\b/))) c.accent = "purple";
    if (hit(has(/\b(green|mint|sage)\b/))) c.accent = "green";
  } else {
    const g = n.signal;
    let mi = Math.max(0, MOTION.indexOf(g.motion));
    if (hit(still || negated("motion", "animation", "animated", "moving", "movement"))) mi = 0;
    else if (hit(calmer)) mi = Math.max(0, mi - 1);
    else if (hit(has(/\b(wilder|more motion|more animated|more animation|livelier|more energy|energetic|faster|alive)\b/))) mi = Math.min(3, mi + 1);
    else if (hit(has(/\b(calm|gentle|quiet)\b/))) mi = 1;
    else if (hit(has(/\blively\b/))) mi = 2;
    else if (hit(has(/\bwild\b/))) mi = 3;
    else if (hit(negated("wild")) && mi === 3) mi = 2;
    g.motion = MOTION[mi];
    if (hit(has(/\b(evening|night|bedtime|late)\b/))) {
      g.base = "Black";
      if (MOTION.indexOf(g.motion) > 1) g.motion = "Calm";
      g.texture = "None";
    }
    if (hit(has(/\b(contrast|readable|legible|low vision)\b/))) {
      if (g.base !== "Concrete") g.base = "Black";
      g.texture = "None";
      g.brutality = 3;
    }
    if (hit(negated("contrast"))) {
      if (g.base === "Black" || g.base === "Concrete") g.base = "Graphite";
      g.brutality = Math.max(0, Number(g.brutality) - 1);
    }
    if (hit(has(/\b(light|bright|brighter|daylight|day)\b/))) g.base = "Concrete";
    if (hit(darker || negated("bright", "light"))) g.base = g.base === "Concrete" ? "Graphite" : "Black";
    if (hit(has(/\bdark\b/)) && g.base === "Concrete") g.base = "Graphite";
    if (hit(has(/\b(warm|warmer|cozy|cosy)\b/))) g.base = "Warm";
    if (hit(negated("warm", "warmer")) && g.base === "Warm") g.base = "Graphite";
    if (hit(has(/\b(grey|gray|graphite)\b/))) g.base = "Graphite";
    const cols = [
      [/\b(red|crimson|scarlet)\b/, "#FF3D2E"],
      [/\b(orange|ember)\b/, "#FF6A1A"],
      [/\b(amber|yellow|gold)\b/, "#FFB21A"],
      [/\b(green|lime|mint)\b/, "#3DDC84"],
      [/\b(cyan|blue|teal|aqua)\b/, "#2EC7F0"],
      [/\b(purple|violet|ultraviolet|uv)\b/, "#8B5CFF"],
      [/\b(pink|magenta)\b/, "#FF4FA3"],
    ];
    for (const [re, hex] of cols) if (hit(has(re))) g.acc = hex;
    const hexm = positive.match(/#([0-9a-f]{6})\b/);
    if (hit(Boolean(hexm))) g.acc = `#${hexm[1].toUpperCase()}`;
    if (hit(has(/\b(sharp|sharper|square|boxy)\b/))) g.corners = "Sharp";
    if (hit(has(/\b(round|rounder|rounded|bubbly)\b/))) g.corners = "Round";
    if (hit(negated("round", "rounder", "rounded", "sharp", "sharper"))) g.corners = "Soft";
    if (hit(has(/\b(grain|grainy|film)\b/))) g.texture = "Grain";
    if (hit(has(/\b(scanline|scanlines|crt|retro)\b/))) g.texture = "Scanlines";
    if (hit(noTexture || negated("texture"))) g.texture = "None";
    if (hit(negated("grain", "grainy", "film")) && g.texture === "Grain") g.texture = "None";
    if (hit(negated("scanline", "scanlines", "crt")) && g.texture === "Scanlines") g.texture = "None";
    if (hit(has(/\b(bolder|heavier|chunkier|more brutal|harder)\b/))) g.brutality = Math.min(3, Number(g.brutality) + 1);
    if (hit(has(/\b(flatter|flat|subtle|subtler|softer)\b/) || negated("brutal", "bold", "heavy"))) g.brutality = Math.max(0, Number(g.brutality) - 1);
    if (hit(has(/\b(chladni|plate|sand|cymatics)\b/))) g.field = "Chladni";
    if (hit(has(/\b(interference|wave|waves|fringes|double slit|ripples)\b/))) g.field = "Interference";
    if (hit(has(/\b(grid|graph paper)\b/))) g.field = "Grid";
    if (hit(noField || negated("background", "field", "pattern"))) g.field = "None";
    if (hit(negated("grid")) && g.field === "Grid") g.field = "None";
    if (hit(negated("chladni", "sand", "plate")) && g.field === "Chladni") g.field = "None";
    if (hit(negated("interference", "wave", "waves", "fringes", "ripples")) && g.field === "Interference") g.field = "None";
    if (hit(has(/\b(condensed|narrow|narrower)\b/))) g.type = "Condensed";
    if (hit(has(/\b(wide|wider|extended)\b/))) g.type = "Wide";
    if (hit(has(/\b(grotesk)\b/))) g.type = "Grotesk";
  }

  const next = normalizeAppearance(n);
  const rows = diffAppearance(cur, next);
  if (!rows.length) {
    return matched
      ? { error: "That’s already how it looks." }
      : { error: "I can’t map that yet. I can change colour, motion, background, texture, corners, contrast or skin." };
  }
  return { next, rows };
}

// Tile words match whole words only ("read" is not in "ready", "pal" is not
// in "palette"); the earliest mention wins.
function findTile(s) {
  let best = null;
  let at = Infinity;
  for (const id of Object.keys(HOME_TILES)) {
    for (const w of HOME_TILES[id].words) {
      const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`);
      const m = re.exec(s);
      if (m) {
        const k = m.index + m[1].length;
        if (k < at) {
          at = k;
          best = id;
        }
      }
    }
  }
  return best;
}

// "reading first on weekdays" → a day rule; "hide Pal's note" → base change.
export function interpretHome(text, home) {
  const s = ` ${String(text || "").toLowerCase().replace(/[’']/g, "")} `;
  const h = normalizeHome(home);
  const id = findTile(s);
  if (!id) return { error: "I couldn’t tell which tile you mean. Try reading, focus, anchor, check-in, tasks or Pal." };
  const name = HOME_TILES[id].name;
  const scope = /weekday/.test(s) ? "Weekdays" : /weekend/.test(s) ? "Weekends" : null;
  let act = null;
  if (/\b(hide|remove|dont show|do not show|without)\b/.test(s)) act = "hide";
  else if (/\b(first|top|start|lead)\b/.test(s)) act = "first";
  else if (/\b(last|bottom|end)\b/.test(s)) act = "last";
  else if (/\b(show|add|bring back|bring it back|include|unhide)\b/.test(s)) act = "show";
  else if (/\b(bigger|larger|more space|expand|big)\b/.test(s)) act = "bigger";
  else if (/\b(smaller|compact|less space|shrink|small)\b/.test(s)) act = "smaller";
  if (!act) return { error: `I found ${name}, but not what to do with it. Try first, last, hide, show, bigger or smaller.` };

  const idx = h.tiles.findIndex((t) => t.id === id);
  const tile = h.tiles[idx];
  const tiles = h.tiles.map((t) => ({ ...t }));
  const i = idx;
  const rule = scope ? h.rules.find((r) => r.scope === scope && r.tile === id) : null;
  const already = { error: `${name} is already like that.` };
  const labelOf = (a) => (a === "hide" ? "hidden" : a);

  // ---- day rules ------------------------------------------------------------
  if (scope && act === "show") {
    if (rule && rule.act === "hide") {
      return {
        next: { tiles: h.tiles, rules: h.rules.filter((r) => r !== rule) },
        title: `Show ${name} on ${scope.toLowerCase()} again?`,
        message: "Removes the day rule that hid it.",
        rows: [{ k: scope, from: "hidden", to: "shown" }],
      };
    }
    if (tile.hidden) return { error: `${name} is hidden every day. Say “show ${name.toLowerCase()}” to bring it back.` };
    return already;
  }
  if (scope && ["first", "last", "hide"].includes(act)) {
    if (act === "hide" && tile.hidden) return { error: `${name} is already hidden every day.` };
    if (rule && rule.act === act) return already;
    const rules = h.rules.filter((r) => r !== rule).concat([{ scope, tile: id, act }]);
    const rows = [];
    // A position rule for a tile hidden everywhere would do nothing: bring
    // it back too, and say so.
    if (act !== "hide" && tile.hidden) {
      tiles[i].hidden = false;
      rows.push({ k: "Visible", from: "no", to: "yes" });
    }
    rows.push({ k: scope, from: rule ? labelOf(rule.act) : ordinal(idx + 1), to: labelOf(act) });
    return {
      next: { tiles, rules },
      title: `${name} ${labelOf(act)} on ${scope.toLowerCase()}?`,
      message: "A day rule. Your base layout stays as it is for the other days.",
      rows,
    };
  }

  // ---- base layout ----------------------------------------------------------
  const SIZES = ["S", "M", "L"];
  const rows = [];
  let rules = h.rules;
  if (act === "first" || act === "last") {
    const [t] = tiles.splice(i, 1);
    if (act === "first") tiles.unshift(t);
    else tiles.push(t);
    const to = act === "first" ? 1 : tiles.length;
    if (to !== i + 1) rows.push({ k: "Position", from: ordinal(i + 1), to: ordinal(to) });
    if (t.hidden) {
      t.hidden = false;
      rows.push({ k: "Visible", from: "no", to: "yes" });
    }
  } else if (act === "hide") {
    if (!tile.hidden) {
      tiles[i].hidden = true;
      rows.push({ k: "Visible", from: "yes", to: "no" });
    }
  } else if (act === "show") {
    if (tile.hidden) {
      tiles[i].hidden = false;
      rows.push({ k: "Visible", from: "no", to: "yes" });
    }
    // "Bring back focus" also lifts any day rule that hides it.
    const hides = h.rules.filter((r) => r.tile === id && r.act === "hide");
    if (hides.length) {
      rules = h.rules.filter((r) => !hides.includes(r));
      for (const r of hides) rows.push({ k: r.scope, from: "hidden", to: "shown" });
    }
  } else {
    const k = SIZES.indexOf(tiles[i].size);
    tiles[i].size = SIZES[Math.max(0, Math.min(2, k + (act === "bigger" ? 1 : -1)))];
    if (tiles[i].size !== tile.size) rows.push({ k: "Size", from: tile.size, to: tiles[i].size });
  }
  if (!rows.length) return already;
  return {
    next: { tiles, rules },
    title: `Change ${name}?`,
    message: "Every day. The preview shows the result first.",
    rows,
  };
}
