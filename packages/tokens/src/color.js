// Colour maths shared by every NeuroPal client (Expo, web platform) and
// ported 1:1 to Dart (Flutter) and Swift (iOS widgets). Pure functions only.
// Any change here must be mirrored in those ports; fixtures/cases.json
// (written by scripts/sync.js) is how the ports prove they still agree.

export function isHex(value) {
  return typeof value === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function hexToRgb(hex) {
  let s = String(hex || "").replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n) || s.length < 6) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

// WCAG 2.x relative luminance.
export function luminance(rgb) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function contrastRatio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// Nudge `fg` toward white (dark backgrounds) or black (light backgrounds)
// in 10% steps until it reads at `min`:1 on `bg`. This is the auto-contrast
// that lets users pick ANY accent hue and still get AA text.
export function fitContrast(fg, bg, min = 4.6) {
  let c = fg.slice();
  const target = luminance(bg) < 0.2 ? [255, 255, 255] : [0, 0, 0];
  for (let i = 0; i < 24 && contrastRatio(c, bg) < min; i += 1) c = mix(c, target, 0.1);
  return c;
}

// Text colour for a filled accent surface (button label, selected chip).
// Near-black ink or white, whichever reads better; if neither clears 4.6:1
// (mid-luminance hues), pure black — max(cr(black), cr(white)) ≥ 4.58 for
// every colour, so the result always passes AA.
export function inkFor(fill, ink = [20, 20, 22]) {
  const white = [255, 255, 255];
  let best = contrastRatio(ink, fill) >= contrastRatio(white, fill) ? ink : white;
  if (contrastRatio(best, fill) < 4.6) {
    best = contrastRatio([0, 0, 0], fill) >= contrastRatio(white, fill) ? [0, 0, 0] : white;
  }
  return best;
}

export function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const q = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return rgbToHex([f(0), f(8), f(4)]);
}

export function hueOf(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

export function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}
