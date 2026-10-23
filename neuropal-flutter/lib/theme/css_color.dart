// Turns the token strings ("#RRGGBB", "rgba(r,g,b,a)") into Flutter Colors.
//
// Tokens stay strings so they match the JS output exactly; this is the one
// place where they become `Color`s for painting.

import 'dart:ui' show Color;

final RegExp _rgba = RegExp(
  r'^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$',
);

/// Parses `#RGB`, `#RRGGBB`, `rgb(…)` or `rgba(…)`. Unknown input becomes
/// magenta so a broken token is obvious on screen instead of invisible.
Color parseCssColor(String css) {
  final s = css.trim();
  if (s.startsWith('#')) {
    var hex = s.substring(1);
    if (hex.length == 3) hex = hex.split('').map((c) => '$c$c').join();
    final value = int.tryParse(hex, radix: 16);
    if (hex.length == 6 && value != null) return Color(0xFF000000 | value);
  }
  final m = _rgba.firstMatch(s);
  if (m != null) {
    int channel(int i) => double.parse(m.group(i)!).round().clamp(0, 255);
    final alpha = m.group(4) == null ? 1.0 : double.parse(m.group(4)!);
    return Color.fromARGB(
      (alpha.clamp(0.0, 1.0) * 255).round(),
      channel(1),
      channel(2),
      channel(3),
    );
  }
  return const Color(0xFFFF00FF);
}
