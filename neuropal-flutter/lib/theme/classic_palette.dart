// Classic skin — a 1:1 port of packages/tokens/src/classic.js.
//
// Classic is the original NeuroPal look (4 themes × 4 accents). The values
// live in tokens.g.dart (generated); this file only holds the logic.

import 'dart:math' as math;

import 'color_math.dart';
import 'js_compat.dart';
import 'token_palette.dart';
import 'tokens.g.dart';

/// The user's Classic choice: theme × accent.
class ClassicSettings {
  const ClassicSettings({required this.theme, required this.accent});

  /// "dark" | "sepia" | "light" | "contrast".
  final String theme;

  /// "ruby" | "cyan" | "purple" | "green" (ignored by "contrast").
  final String accent;

  Map<String, Object?> toJson() => {'theme': theme, 'accent': accent};

  @override
  bool operator ==(Object other) =>
      other is ClassicSettings &&
      other.theme == theme &&
      other.accent == accent;

  @override
  int get hashCode => Object.hash(theme, accent);
}

/// Repairs anything invalid (old saves, server payloads) instead of
/// throwing: unknown themes become "dark", unknown accents "ruby".
ClassicSettings normalizeClassic(Object? input) {
  final src = jsObject(input);
  final theme = kClassicThemeNames.contains(src['theme'])
      ? src['theme'] as String
      : 'dark';
  final accent = kClassicAccentNames.contains(src['accent'])
      ? src['accent'] as String
      : 'ruby';
  return ClassicSettings(theme: theme, accent: accent);
}

/// The original palette.js#resolvePalette token map, kept byte-for-byte
/// compatible: the theme's base colours with the accent variant on top.
Map<String, String> resolveClassicTokens(String theme, String accent) {
  final base = kClassicThemes[theme] ?? kClassicThemes['dark']!;
  if (theme == 'contrast') return {...base};
  final variants = kClassicAccentVariants[theme] ?? const {};
  // The dark base already IS ruby, so dark has no "ruby" variant; unknown
  // accents fall back to the theme's ruby variant.
  final chosen = variants[accent] ?? (accent == 'ruby' ? null : variants['ruby']);
  return chosen != null
      ? {...base, ...chosen}
      : {...base, ...(variants['ruby'] ?? const {})};
}

/// Classic tokens + the skin-neutral extras skin-aware widgets read
/// (shape, motion, field…). Classic's answers reproduce the original look.
TokenPalette resolveClassicPalette(Object? input) {
  final settings = normalizeClassic(input);
  final theme = settings.theme;
  final t = resolveClassicTokens(theme, settings.accent);
  final dark = theme == 'dark' || theme == 'contrast';
  final surf = hexToRgb(t['surfaceContainer'])!;
  final accText = fitContrast(hexToRgb(t['accent'])!, surf);
  final ratio = math.min(
    contrastRatio(hexToRgb(t['onPrimary'])!, hexToRgb(t['primary'])!),
    contrastRatio(accText, surf),
  );

  return TokenPalette(
    surface: t['surface']!,
    surfaceLowest: t['surfaceLowest']!,
    surfaceLow: t['surfaceLow']!,
    surfaceContainer: t['surfaceContainer']!,
    surfaceHigh: t['surfaceHigh']!,
    surfaceHighest: t['surfaceHighest']!,
    onSurface: t['onSurface']!,
    onSurfaceVariant: t['onSurfaceVariant']!,
    outline: t['outline']!,
    outlineVariant: t['outlineVariant']!,
    primary: t['primary']!,
    primaryContainer: t['primaryContainer']!,
    onPrimary: t['onPrimary']!,
    secondary: t['secondary']!,
    tertiary: t['tertiary']!,
    error: t['error']!,
    warn: t['warn']!,
    accent: t['accent']!,
    accentGlow: t['accentGlow']!,
    skin: 'classic',
    dark: dark,
    accentFill: t['primary']!,
    accentInk: t['onPrimary']!,
    accentDeep: t['primaryContainer']!,
    accentText: rgbToHex(accText),
    line: t['outlineVariant']!,
    control: t['outline']!,
    shadowColor: '#000000',
    panelColor: t['surfaceContainer']!,
    panelAlpha: kClassicShape['glassAlpha']!.toDouble(),
    grid: '#000000',
    gridAlpha: 0,
    palBody: dark ? '#E4E2E1' : '#FFFFFF',
    shape: PaletteShape(
      radius: kClassicShape['radius']!.toInt(),
      radiusMedium: kClassicShape['radiusMedium']!.toInt(),
      radiusControl: kClassicShape['radiusControl']!.toInt(),
      border: kClassicShape['border']!.toInt(),
      shadow: kClassicShape['shadow']!.toInt(),
    ),
    motion: const PaletteMotion(level: 'Calm', speed: 0.35),
    field: 'None',
    texture: 'None',
    type: 'Classic',
    ratio: jsRound(ratio * 10) / 10,
  );
}
