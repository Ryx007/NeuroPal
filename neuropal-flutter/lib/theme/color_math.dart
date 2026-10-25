// Colour maths shared by every NeuroPal client — a 1:1 port of
// packages/tokens/src/color.js. Pure functions only.
//
// Any change must be made in the JS source first; the parity tests
// (test/tokens_parity_test.dart) prove this port still agrees with it.

import 'dart:math' as math;

import 'js_compat.dart';

/// A colour as three 0–255 channels. The JS code uses `[r, g, b]` arrays;
/// a tiny class keeps the Dart side type-safe. Channels may temporarily
/// hold out-of-range values; [rgbToHex] clamps them like the JS does.
class Rgb {
  const Rgb(this.r, this.g, this.b);

  final int r;
  final int g;
  final int b;

  static const white = Rgb(255, 255, 255);
  static const black = Rgb(0, 0, 0);

  /// The "near-black ink" the design uses instead of pure black.
  static const ink = Rgb(20, 20, 22);

  List<int> get channels => [r, g, b];

  @override
  bool operator ==(Object other) =>
      other is Rgb && other.r == r && other.g == g && other.b == b;

  @override
  int get hashCode => Object.hash(r, g, b);

  @override
  String toString() => 'Rgb($r, $g, $b)';
}

final RegExp _hexPattern = RegExp(r'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$');

/// `#RGB` or `#RRGGBB` (any case).
bool isHex(Object? value) => value is String && _hexPattern.hasMatch(value);

/// Parses `#RRGGBB` / `#RGB` (with or without `#`). Returns null for
/// anything unreadable, exactly where the JS returns null.
Rgb? hexToRgb(String? hex) {
  // JS: String(hex || "").replace("#", "") — only the FIRST '#' goes.
  var s = (hex ?? '').replaceFirst('#', '');
  if (s.length == 3) {
    s = s.split('').map((c) => '$c$c').join();
  }
  final n = _jsParseHexInt(s.length > 6 ? s.substring(0, 6) : s);
  if (n == null || s.length < 6) return null;
  return Rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/// JS `parseInt(str, 16)`: reads leading hex digits and ignores the rest
/// ("12zz" → 0x12); returns null where JS returns NaN.
int? _jsParseHexInt(String str) {
  var s = str.trimLeft();
  var sign = 1;
  if (s.startsWith('-') || s.startsWith('+')) {
    if (s.startsWith('-')) sign = -1;
    s = s.substring(1);
  }
  if (s.startsWith('0x') || s.startsWith('0X')) s = s.substring(2);
  final digits = RegExp(r'^[0-9a-fA-F]+').stringMatch(s);
  if (digits == null) return null;
  return sign * int.parse(digits, radix: 16);
}

/// `#RRGGBB`, upper-case. Channels are rounded (JS rules) and clamped.
String rgbToHex(Rgb rgb) {
  String channel(int v) =>
      v.clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}'.toUpperCase();
}

/// WCAG 2.x relative luminance (0 = black, 1 = white).
double luminance(Rgb rgb) {
  double f(int v) {
    final c = v / 255;
    return c <= 0.03928
        ? c / 12.92
        : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/// WCAG contrast ratio between two colours (1 … 21).
double contrastRatio(Rgb a, Rgb b) {
  final x = luminance(a);
  final y = luminance(b);
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}

/// Linear blend from [a] (t = 0) to [b] (t = 1), rounded per channel.
Rgb mix(Rgb a, Rgb b, double t) => Rgb(
  jsRoundInt(a.r + (b.r - a.r) * t),
  jsRoundInt(a.g + (b.g - a.g) * t),
  jsRoundInt(a.b + (b.b - a.b) * t),
);

/// Nudges [fg] toward white (dark backgrounds) or black (light backgrounds)
/// in 10% steps until it reads at [min]:1 on [bg]. This auto-contrast is
/// what lets users pick ANY accent hue and still get AA text.
Rgb fitContrast(Rgb fg, Rgb bg, [double min = 4.6]) {
  var c = fg;
  final target = luminance(bg) < 0.2 ? Rgb.white : Rgb.black;
  for (var i = 0; i < 24 && contrastRatio(c, bg) < min; i += 1) {
    c = mix(c, target, 0.1);
  }
  return c;
}

/// Text colour for a filled accent surface (button label, selected chip):
/// near-black ink or white, whichever reads better; if neither clears
/// 4.6:1 (mid-luminance hues), pure black or white — one of those always
/// passes AA.
Rgb inkFor(Rgb fill, [Rgb ink = Rgb.ink]) {
  var best = contrastRatio(ink, fill) >= contrastRatio(Rgb.white, fill)
      ? ink
      : Rgb.white;
  if (contrastRatio(best, fill) < 4.6) {
    best = contrastRatio(Rgb.black, fill) >= contrastRatio(Rgb.white, fill)
        ? Rgb.black
        : Rgb.white;
  }
  return best;
}

/// HSL (h in degrees, s and l in 0…1) → `#RRGGBB`.
String hslToHex(num h, num s, num l) {
  int f(int n) {
    // JS `%` is a truncating remainder — Dart's `remainder`, not `%`.
    final k = (n + h / 30).remainder(12);
    final q = s * math.min(l, 1 - l);
    final clamp = math.max(-1, math.min(math.min(k - 3, 9 - k), 1));
    return jsRoundInt(255 * (l - q * clamp));
  }

  return rgbToHex(Rgb(f(0), f(8), f(4)));
}

/// Hue (0–359°) of a hex colour; 0 for greys and unreadable input.
int hueOf(String? hex) {
  final rgb = hexToRgb(hex);
  if (rgb == null) return 0;
  final r = rgb.r / 255;
  final g = rgb.g / 255;
  final b = rgb.b / 255;
  final mx = math.max(r, math.max(g, b));
  final mn = math.min(r, math.min(g, b));
  final d = mx - mn;
  if (d == 0) return 0;
  double h;
  if (mx == r) {
    h = ((g - b) / d).remainder(6);
  } else if (mx == g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  final deg = jsRoundInt(h * 60);
  return deg < 0 ? deg + 360 : deg;
}

/// `rgba(r,g,b,alpha)` CSS string, or [hex] unchanged if unreadable.
String withAlpha(String hex, num alpha) {
  final rgb = hexToRgb(hex);
  if (rgb == null) return hex;
  return 'rgba(${rgb.r},${rgb.g},${rgb.b},${jsNumberToString(alpha)})';
}
