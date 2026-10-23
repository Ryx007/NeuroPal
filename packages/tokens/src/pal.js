import { contrastRatio, hexToRgb } from "./color.js";
import { PAL_DEFAULT, PAL_OPTIONS } from "./tokens.js";

export function normalizePal(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...PAL_DEFAULT };
  const name = typeof src.name === "string" ? src.name.trim().slice(0, 14) : "";
  if (name) out.name = name;
  if (PAL_OPTIONS.shape[src.shape]) out.shape = src.shape;
  if (PAL_OPTIONS.colour[src.colour]) out.colour = src.colour;
  if (PAL_OPTIONS.eyes.includes(src.eyes)) out.eyes = src.eyes;
  if (PAL_OPTIONS.mouth.includes(src.mouth)) out.mouth = src.mouth;
  if (PAL_OPTIONS.extra.includes(src.extra)) out.extra = src.extra;
  if (PAL_OPTIONS.talk[src.talk]) out.talk = src.talk;
  if (PAL_OPTIONS.voice[src.voice]) out.voice = src.voice;
  if (typeof src.people === "boolean") out.people = src.people;
  return out;
}

// {task} is a complete phrase: "the CPI notes", or a quoted task title
// ("“Stay hydrated”") — templates carry no article of their own.
export function palLine(pal, task = "the CPI notes") {
  const p = normalizePal(pal);
  return PAL_OPTIONS.talk[p.talk].replace("{task}", task);
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
