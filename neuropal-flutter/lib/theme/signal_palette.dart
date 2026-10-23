// Signal skin ("brutal glass") — a 1:1 port of packages/tokens/src/signal.js.
//
// Signal is red on graphite by default and every value is a user setting.
// All text colours are contrast-fitted, so any accent hue stays readable.

import 'dart:math' as math;

import 'color_math.dart';
import 'js_compat.dart';
import 'token_palette.dart';
import 'tokens.g.dart';

/// The eight Signal settings, exactly as stored in the appearance object.
class SignalSettings {
  const SignalSettings({
    required this.acc,
    required this.base,
    required this.motion,
    required this.field,
    required this.brutality,
    required this.corners,
    required this.texture,
    required this.type,
  });

  /// Accent colour, `#RRGGBB` upper-case.
  final String acc;

  /// "Graphite" | "Concrete" | "Black" | "Warm".
  final String base;

  /// "Still" | "Calm" | "Lively" | "Wild".
  final String motion;

  /// "Chladni" | "Interference" | "Grid" | "None".
  final String field;

  /// 0–3: border width and hard-shadow depth.
  final int brutality;

  /// "Sharp" | "Soft" | "Round".
  final String corners;

  /// "Grain" | "Scanlines" | "None".
  final String texture;

  /// Display type: "Wide" | "Condensed" | "Grotesk".
  final String type;

  Map<String, Object?> toJson() => {
    'acc': acc,
    'base': base,
    'motion': motion,
    'field': field,
    'brutality': brutality,
    'corners': corners,
    'texture': texture,
    'type': type,
  };
}

/// Coerces anything (old saves, server payloads, user typing) into valid
/// Signal settings. Unknown values fall back to the default; never throws.
SignalSettings normalizeSignal(Object? input) {
  final src = jsObject(input);
  final def = kSignalDefault;

  String pick(String key) {
    final options = kSignalOptions[key]!;
    final value = src[key];
    return options.contains(value) ? value as String : def[key] as String;
  }

  var acc = def['acc'] as String;
  if (isHex(src['acc'])) acc = rgbToHex(hexToRgb(src['acc'] as String)!);

  var brutality = def['brutality'] as int;
  final b = jsRound(jsNumber(src['brutality']));
  if (b.isFinite && b >= 0 && b <= 3) brutality = b.toInt();

  return SignalSettings(
    acc: acc,
    base: pick('base'),
    motion: pick('motion'),
    field: pick('field'),
    brutality: brutality,
    corners: pick('corners'),
    texture: pick('texture'),
    type: pick('type'),
  );
}

/// True when two settings describe the same look (accent case-insensitive).
bool sameSignal(Object? a, Object? b) {
  final x = normalizeSignal(a is SignalSettings ? a.toJson() : a).toJson();
  final y = normalizeSignal(b is SignalSettings ? b.toJson() : b).toJson();
  return x.keys.every(
    (k) => '${x[k]}'.toUpperCase() == '${y[k]}'.toUpperCase(),
  );
}

/// Human name for an accent hex ("Signal red"), or the hex itself.
String accentName(String? hex) {
  final h = (hex ?? '').toUpperCase();
  final extra = kSignalExtraAccentNames[h];
  if (extra != null) return extra;
  for (final a in kSignalAccents) {
    if (a['hex'] == h) return a['name']!;
  }
  return h;
}

/// The preset these settings match exactly, or null.
String? matchPreset(Object? settings) {
  for (final name in kSignalPresets.keys) {
    if (sameSignal(kSignalPresets[name], settings)) return name;
  }
  return null;
}

/// Signal settings → the same Material-style token names Classic produces,
/// plus skin extras. Every text colour is contrast-fitted (≥ 4.6:1).
TokenPalette resolveSignalPalette(Object? input) {
  final s = normalizeSignal(input is SignalSettings ? input.toJson() : input);
  final base = kSignalBases[s.base]!;
  String bs(String key) => base[key] as String;
  double bd(String key) => (base[key] as num).toDouble();

  final acc = hexToRgb(s.acc)!;
  final container = hexToRgb(bs('surfaceContainer'))!;
  final surface = hexToRgb(bs('surface'))!;
  // Accent used AS TEXT must read on both the page and the panels.
  final accText = fitContrast(fitContrast(acc, container), surface);
  final ink = inkFor(acc);
  final deep = mix(acc, Rgb.black, 0.5);
  final r = kSignalCorners[s.corners]!;
  final ratio = math.min(
    contrastRatio(ink, acc),
    math.min(contrastRatio(accText, container), contrastRatio(accText, surface)),
  );

  return TokenPalette(
    surface: bs('surface'),
    surfaceLowest: bs('surfaceLowest'),
    surfaceLow: bs('surfaceLow'),
    surfaceContainer: bs('surfaceContainer'),
    surfaceHigh: bs('surfaceHigh'),
    surfaceHighest: bs('surfaceHighest'),
    onSurface: bs('onSurface'),
    onSurfaceVariant: bs('onSurfaceVariant'),
    outline: bs('outline'),
    outlineVariant: bs('outlineVariant'),
    primary: s.acc,
    primaryContainer: rgbToHex(deep),
    onPrimary: rgbToHex(ink),
    secondary: bs('secondary'),
    tertiary: bs('tertiary'),
    error: bs('error'),
    warn: bs('warn'),
    accent: rgbToHex(accText),
    accentGlow: withAlpha(s.acc, 0.3),
    skin: 'signal',
    dark: base['dark'] as bool,
    accentFill: s.acc,
    accentInk: rgbToHex(ink),
    accentDeep: rgbToHex(deep),
    accentText: rgbToHex(accText),
    line: bs('line'),
    control: bs('control'),
    shadowColor: bs('shadow'),
    panelColor: bs('surfaceContainer'),
    panelAlpha: bd('panelAlpha'),
    grid: bs('grid'),
    gridAlpha: bd('gridAlpha'),
    palBody: bs('palBody'),
    shape: PaletteShape(
      radius: r,
      radiusMedium: jsRoundInt(r * 0.72),
      radiusControl: jsRoundInt(r * 0.72),
      border: kSignalBrutalityBorder[s.brutality],
      shadow: kSignalBrutalityShadow[s.brutality],
    ),
    motion: PaletteMotion(level: s.motion, speed: kSignalMotionSpeed[s.motion]!),
    field: s.field,
    texture: s.texture,
    type: s.type,
    ratio: jsRound(ratio * 10) / 10,
  );
}

/// The device's reduce-motion setting always wins over the user's pick.
String effectiveMotion(String level, {required bool reduceMotion}) =>
    reduceMotion ? 'Still' : level;
