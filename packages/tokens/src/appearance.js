import { normalizeClassic, resolveClassicPalette } from "./classic.js";
import { normalizeHome } from "./home.js";
import { normalizePal } from "./pal.js";
import { accentName, normalizeSignal, resolveSignalPalette, sameSignal } from "./signal.js";
import { LOOKS } from "./tokens.js";

export const APPEARANCE_VERSION = 1;

// Everything the Make-it-yours studio controls, in one serialisable object.
// This exact shape is what the backend stores (User.appearance) and what
// every client syncs.
export function normalizeAppearance(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  return {
    v: APPEARANCE_VERSION,
    skin: src.skin === "signal" ? "signal" : "classic",
    classic: normalizeClassic(src.classic),
    signal: normalizeSignal(src.signal),
    suggestLooks: src.suggestLooks !== false,
    pal: normalizePal(src.pal),
    home: normalizeHome(src.home),
    updatedAt: typeof src.updatedAt === "string" ? src.updatedAt : null,
  };
}

export function resolveAppearancePalette(appearance) {
  const a = normalizeAppearance(appearance);
  return a.skin === "signal" ? resolveSignalPalette(a.signal) : resolveClassicPalette(a.classic);
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// Human-readable change list for the preview → apply → undo flow.
export function diffAppearance(before, after) {
  const a = normalizeAppearance(before);
  const b = normalizeAppearance(after);
  const rows = [];
  const add = (k, x, y) => {
    if (String(x) !== String(y)) rows.push({ k, from: String(x), to: String(y) });
  };
  add("Skin", cap(a.skin), cap(b.skin));
  if (b.skin === "classic") {
    add("Theme", cap(a.classic.theme), cap(b.classic.theme));
    if (b.classic.theme !== "contrast") add("Accent", cap(a.classic.accent), cap(b.classic.accent));
  } else {
    const x = a.signal;
    const y = b.signal;
    add("Accent", accentName(x.acc), accentName(y.acc));
    add("Base", x.base, y.base);
    add("Motion", x.motion, y.motion);
    add("Background", x.field, y.field);
    add("Brutality", x.brutality, y.brutality);
    add("Corners", x.corners, y.corners);
    add("Texture", x.texture, y.texture);
    add("Type", x.type, y.type);
  }
  return rows;
}

export function matchLook(appearance) {
  const a = normalizeAppearance(appearance);
  const looks = LOOKS[a.skin];
  return (
    Object.keys(looks).find((name) => {
      const d = looks[name];
      return a.skin === "signal" ? sameSignal(d.sig, a.signal) : d.theme === a.classic.theme && d.accent === a.classic.accent;
    }) || null
  );
}

const ownLook = (skin, name) => (typeof name === "string" && Object.prototype.hasOwnProperty.call(LOOKS[skin] || {}, name) ? LOOKS[skin][name] : null);

export function applyLook(appearance, name) {
  const a = normalizeAppearance(appearance);
  const d = ownLook(a.skin, name);
  if (!d) return a;
  if (a.skin === "signal") return { ...a, signal: normalizeSignal(d.sig) };
  return { ...a, classic: normalizeClassic({ theme: d.theme, accent: d.accent }) };
}

export function lookDescription(skin, name) {
  const d = ownLook(skin, name);
  return d ? d.desc : "";
}
