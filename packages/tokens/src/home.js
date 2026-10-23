import { HOME_DEFAULT, HOME_RULE_ACTS, HOME_RULE_SCOPES, HOME_SIZES, HOME_TILES } from "./tokens.js";

const TILE_IDS = Object.keys(HOME_TILES);

// Keep every known tile exactly once (new tiles shipped later get appended),
// drop unknown ids, coerce sizes, de-duplicate rules (one per scope+tile).
export function normalizeHome(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const seen = new Set();
  const tiles = [];
  for (const t of Array.isArray(src.tiles) ? src.tiles : []) {
    if (!t || !TILE_IDS.includes(t.id) || seen.has(t.id)) continue;
    seen.add(t.id);
    tiles.push({ id: t.id, size: HOME_SIZES.includes(t.size) ? t.size : "M", hidden: Boolean(t.hidden) });
  }
  for (const d of HOME_DEFAULT.tiles) {
    if (!seen.has(d.id)) tiles.push({ ...d });
  }
  const rules = [];
  const ruleKeys = new Set();
  for (const r of Array.isArray(src.rules) ? src.rules : []) {
    if (!r || !HOME_RULE_SCOPES.includes(r.scope) || !TILE_IDS.includes(r.tile) || !HOME_RULE_ACTS.includes(r.act)) continue;
    const key = `${r.scope}:${r.tile}`;
    if (ruleKeys.has(key)) continue;
    ruleKeys.add(key);
    rules.push({ scope: r.scope, tile: r.tile, act: r.act });
  }
  return { tiles, rules };
}

export function scopeForDate(date = new Date()) {
  const d = date.getDay();
  return d === 0 || d === 6 ? "Weekends" : "Weekdays";
}

// The layout Home actually shows on `date`: the base order with that day's
// rules applied, hidden tiles removed.
export function effectiveTiles(home, date = new Date()) {
  const h = normalizeHome(home);
  const scope = scopeForDate(date);
  const out = h.tiles.map((t) => ({ ...t }));
  for (const r of h.rules.filter((x) => x.scope === scope)) {
    const i = out.findIndex((t) => t.id === r.tile);
    if (i < 0) continue;
    const [t] = out.splice(i, 1);
    if (r.act === "hide") {
      t.hidden = true;
      out.splice(i, 0, t);
    } else if (r.act === "first") {
      t.hidden = false;
      out.unshift(t);
    } else {
      out.push(t);
    }
  }
  return out.filter((t) => !t.hidden);
}

export function moveTile(home, id, dir) {
  const h = normalizeHome(home);
  const i = h.tiles.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= h.tiles.length) return h;
  const tiles = h.tiles.slice();
  [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  return { ...h, tiles };
}

export function patchTile(home, id, patch) {
  const h = normalizeHome(home);
  return { ...h, tiles: h.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  return `${n}${s}`;
}
