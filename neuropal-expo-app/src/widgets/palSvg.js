// SVG markup for the home-screen widget. The widget library renders SVG
// strings natively (AndroidSVG), so Pal is drawn here as markup instead of
// react-native-svg components. Geometry is a static copy of
// src/components/pal/Pal.jsx (same 168×148 body box in a padded
// -46 -50 260 240 viewBox): no blink or breathing, the mood still narrows
// and dims the visor exactly like the in-app Pal.
//
// Pure functions, no React Native imports (node --test runs this file).

import { isHex } from "../theme/tokens/color.js";
import { palFaceInk, palVisor, normalizePal } from "../theme/tokens/pal.js";
import { PAL_OPTIONS } from "../theme/tokens/tokens.js";

const BODY = {
  Pebble: "M84 0 C131 0 168 32 168 78 C168 121 131 148 84 148 C37 148 0 121 0 78 C0 32 37 0 84 0 Z",
  Bean: "M66 3 C116 -6 167 25 165 78 C163 127 124 150 76 146 C29 142 1 113 3 70 C5 30 28 9 66 3 Z",
};

// Only plain hex colours ever reach the markup: snapshot values are user
// data, and a stray quote would break the XML.
const hex = (value, fallback) => (isHex(value) ? value : fallback);

const num = (n) => String(Math.round(n * 100) / 100);

function bodyShape(shape, { dx = 0, dy = 0, fill, stroke, strokeWidth = 0 }) {
  const paint = `fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ""}`;
  if (shape === "Box") return `<rect x="${dx}" y="${dy}" width="168" height="148" rx="27" ${paint}/>`;
  if (shape === "Moon") return `<ellipse cx="${84 + dx}" cy="${74 + dy}" rx="84" ry="74" ${paint}/>`;
  const move = dx || dy ? ` transform="translate(${dx} ${dy})"` : "";
  return `<path d="${BODY[shape] || BODY.Pebble}"${move} ${paint}/>`;
}

/**
 * The user's Pal as an SVG string.
 * @param {object} rawPal  look.pal (normalised here)
 * @param {object} opts
 *   mood    'okay' | 'off' | 'over' (green / yellow / red)
 *   accent  accent fill (visor, headphones, scarf, antenna tip)
 *   stroke  outline colour (Classic: a soft outline, Signal: the hard ink)
 *   shadow  Signal's hard offset shadow in viewBox units (0 = none)
 *   width   output width in px (height follows the 260:240 viewBox)
 */
export function palSvg(rawPal, { mood = "okay", accent, stroke, shadow = 0, width = 96 } = {}) {
  const pal = normalizePal(rawPal);
  const body = PAL_OPTIONS.colour[pal.colour];
  const acc = hex(accent, "#FF7F8E");
  const line = hex(stroke, "#534347");
  const ink = palFaceInk(body);
  const visor = palVisor(body, acc);
  const visorIsAccent = visor === acc;
  const height = (width * 240) / 260;

  const visorInset = mood === "over" ? 13 : mood === "off" ? 8 : 0;
  const visorOpacity = mood === "over" ? 0.45 : mood === "off" ? 0.85 : 1;

  const parts = [];
  if (pal.extra === "Antenna") {
    parts.push(
      `<path d="M84 2 V-28" fill="none" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`,
      `<circle cx="84" cy="-37" r="9" fill="${acc}" stroke="${line}" stroke-width="3"/>`
    );
  }
  if (shadow > 0) parts.push(bodyShape(pal.shape, { dx: shadow, dy: shadow, fill: line }));
  parts.push(bodyShape(pal.shape, { fill: body, stroke: line, strokeWidth: 3 }));
  if (pal.extra === "Headphones") {
    parts.push(
      `<path d="M-6 74 C-10 -26 178 -26 174 74" fill="none" stroke="${line}" stroke-width="9" stroke-linecap="round"/>`,
      `<rect x="-22" y="54" width="26" height="46" rx="11" fill="${acc}" stroke="${line}" stroke-width="3"/>`,
      `<rect x="164" y="54" width="26" height="46" rx="11" fill="${acc}" stroke="${line}" stroke-width="3"/>`
    );
  }
  if (pal.extra === "Lab goggles") {
    parts.push(
      `<path d="M0 22 H168" fill="none" stroke="${line}" stroke-width="7"/>`,
      `<circle cx="60" cy="22" r="17" fill="#BEEBFF" fill-opacity="0.6" stroke="${line}" stroke-width="4"/>`,
      `<circle cx="108" cy="22" r="17" fill="#BEEBFF" fill-opacity="0.6" stroke="${line}" stroke-width="4"/>`
    );
  }

  const eyes = [];
  if (pal.eyes === "Visor") {
    const glint = visorIsAccent ? `fill="#FFFFFF" fill-opacity="0.85"` : `fill="${body}"`;
    eyes.push(
      `<rect x="${num(24 + visorInset)}" y="44" width="${num(120 - 2 * visorInset)}" height="32" rx="16" fill="${visor}" stroke="${line}" stroke-width="3"/>`,
      `<rect x="${num(46 + visorInset / 2)}" y="53" width="16" height="12" rx="5" ${glint}/>`,
      `<rect x="${num(106 - visorInset / 2)}" y="53" width="16" height="12" rx="5" ${glint}/>`
    );
  } else if (pal.eyes === "Dots") {
    eyes.push(
      `<circle cx="60" cy="62" r="11" fill="${ink}"/>`,
      `<circle cx="108" cy="62" r="11" fill="${ink}"/>`,
      `<circle cx="64" cy="58" r="3.5" fill="${body}"/>`,
      `<circle cx="112" cy="58" r="3.5" fill="${body}"/>`
    );
  } else if (pal.eyes === "Sleepy") {
    eyes.push(`<path d="M46 60 q14 12 28 0 M94 60 q14 12 28 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);
  } else if (pal.eyes === "Wide") {
    eyes.push(
      `<circle cx="58" cy="60" r="18" fill="#FFFFFF" stroke="${line}" stroke-width="3"/>`,
      `<circle cx="110" cy="60" r="18" fill="#FFFFFF" stroke="${line}" stroke-width="3"/>`,
      `<circle cx="62" cy="64" r="8" fill="#141416"/>`,
      `<circle cx="114" cy="64" r="8" fill="#141416"/>`
    );
  }
  parts.push(visorOpacity < 1 ? `<g opacity="${visorOpacity}">${eyes.join("")}</g>` : eyes.join(""));

  if (pal.mouth === "Oh") parts.push(`<ellipse cx="84" cy="104" rx="8" ry="9" fill="${ink}"/>`);
  if (pal.mouth === "Smile") parts.push(`<path d="M66 98 q18 16 36 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);
  if (pal.mouth === "Flat") parts.push(`<path d="M70 104 h28" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);

  if (pal.extra === "Scarf") {
    parts.push(
      `<rect x="10" y="114" width="148" height="22" rx="11" fill="${acc}" stroke="${line}" stroke-width="3"/>`,
      `<rect x="116" y="122" width="20" height="46" rx="6" transform="rotate(-10 126 145)" fill="${acc}" stroke="${line}" stroke-width="3"/>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="-46 -50 260 240">` +
    parts.join("") +
    `</svg>`
  );
}

// Shape cue for a state (never colour alone): circle / triangle / square.
export function glyphSvg(shape, color, size = 12) {
  const c = hex(color, "#000000");
  let mark = `<circle cx="6" cy="6" r="5" fill="${c}"/>`;
  if (shape === "triangle") mark = `<polygon points="6,1 11.5,11 0.5,11" fill="${c}"/>`;
  if (shape === "square") mark = `<rect x="1" y="1" width="10" height="10" fill="${c}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12">${mark}</svg>`;
}

// Speech bubble for "Ask Pal".
export function askGlyphSvg(color, size = 18) {
  const c = hex(color, "#000000");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="${c}"/>` +
    `</svg>`
  );
}
