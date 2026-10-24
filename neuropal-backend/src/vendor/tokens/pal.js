// GENERATED from packages/tokens/src — do not edit here.
// Change packages/tokens, then run: node packages/tokens/scripts/sync.js
import { contrastRatio, hexToRgb } from "./color.js";
import { PAL_DEFAULT, PAL_LINES, PAL_OPTIONS } from "./tokens.js";

// Own keys only: a synced value like "constructor" or "__proto__" must fall
// back to the default, never resolve to an inherited Object member.
const own = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

export function normalizePal(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...PAL_DEFAULT };
  const name = typeof src.name === "string" ? src.name.trim().slice(0, 14) : "";
  if (name) out.name = name;
  if (own(PAL_OPTIONS.shape, src.shape)) out.shape = src.shape;
  if (own(PAL_OPTIONS.colour, src.colour)) out.colour = src.colour;
  if (PAL_OPTIONS.eyes.includes(src.eyes)) out.eyes = src.eyes;
  if (PAL_OPTIONS.mouth.includes(src.mouth)) out.mouth = src.mouth;
  if (PAL_OPTIONS.extra.includes(src.extra)) out.extra = src.extra;
  if (own(PAL_OPTIONS.talk, src.talk)) out.talk = src.talk;
  if (own(PAL_OPTIONS.voice, src.voice)) out.voice = src.voice;
  if (typeof src.people === "boolean") out.people = src.people;
  return out;
}

// {task} is a complete phrase: "the CPI notes", or a quoted task title
// ("“Stay hydrated”") — templates carry no article of their own.
export function palLine(pal, task = "the CPI notes") {
  const p = normalizePal(pal);
  return PAL_OPTIONS.talk[p.talk].replace("{task}", task);
}

// One of Pal's assistant lines (PAL_LINES) in the user's talk style. A key a
// style doesn't define falls back to Gentle; unknown keys give "". `vars`
// fill {placeholders}; a placeholder without a value stays as written.
export function palSay(pal, key, vars = {}) {
  const p = normalizePal(pal);
  const style = own(PAL_LINES, p.talk) ? PAL_LINES[p.talk] : PAL_LINES.Gentle;
  const line = own(style, key) ? style[key] : own(PAL_LINES.Gentle, key) ? PAL_LINES.Gentle[key] : "";
  const v = vars && typeof vars === "object" ? vars : {};
  return line.replace(/\{(\w+)\}/g, (m, k) => (own(v, k) ? String(v[k]) : m));
}

// Face ink (eyes/mouth) that reads on the chosen body colour.
export function palFaceInk(bodyHex) {
  const body = hexToRgb(bodyHex) || [228, 228, 232];
  return contrastRatio([20, 20, 22], body) >= contrastRatio([255, 255, 255], body) ? "#141416" : "#FFFFFF";
}

// The visor is the accent — unless the body IS (nearly) the accent, in which
// case it would vanish, so it takes the face ink instead.
export function palVisor(bodyHex, accentHex) {
  const body = hexToRgb(bodyHex) || [228, 228, 232];
  const acc = hexToRgb(accentHex) || [255, 61, 46];
  return contrastRatio(acc, body) < 1.6 ? palFaceInk(bodyHex) : accentHex;
}

export function palDescription(pal) {
  const p = normalizePal(pal);
  const extra = p.extra === "None" ? "no extras" : p.extra.toLowerCase();
  const mouth = p.mouth === "None" ? "no mouth" : `${p.mouth.toLowerCase()} mouth`;
  return `${p.name}: ${p.shape.toLowerCase()} shape, ${p.colour.toLowerCase()} body, ${p.eyes.toLowerCase()} eyes, ${mouth}, ${extra}`;
}
