// The resolved palette: what resolveClassicPalette / resolveSignalPalette
// return. Both skins produce the SAME token names, so every widget can be
// written once and restyle for either skin.
//
// Values stay as strings ("#RRGGBB", "rgba(…)") exactly like the JS output,
// which keeps the parity tests byte-exact. Widgets convert them to Flutter
// `Color`s through lib/theme/np_style.dart.

/// Corner radii, border width and hard-shadow offset (logical pixels).
class PaletteShape {
  const PaletteShape({
    required this.radius,
    required this.radiusMedium,
    required this.radiusControl,
    required this.border,
    required this.shadow,
  });

  final int radius;
  final int radiusMedium;
  final int radiusControl;
  final int border;
  final int shadow;

  Map<String, Object?> toJson() => {
    'radius': radius,
    'radiusMedium': radiusMedium,
    'radiusControl': radiusControl,
    'border': border,
    'shadow': shadow,
  };
}

/// Motion level ("Still" | "Calm" | "Lively" | "Wild") and its speed
/// multiplier for ambient animation.
class PaletteMotion {
  const PaletteMotion({required this.level, required this.speed});

  final String level;
  final double speed;

  Map<String, Object?> toJson() => {'level': level, 'speed': speed};
}

class TokenPalette {
  const TokenPalette({
    required this.surface,
    required this.surfaceLowest,
    required this.surfaceLow,
    required this.surfaceContainer,
    required this.surfaceHigh,
    required this.surfaceHighest,
    required this.onSurface,
    required this.onSurfaceVariant,
    required this.outline,
    required this.outlineVariant,
    required this.primary,
    required this.primaryContainer,
    required this.onPrimary,
    required this.secondary,
    required this.tertiary,
    required this.error,
    required this.warn,
    required this.accent,
    required this.accentGlow,
    required this.skin,
    required this.dark,
    required this.accentFill,
    required this.accentInk,
    required this.accentDeep,
    required this.accentText,
    required this.line,
    required this.control,
    required this.shadowColor,
    required this.panelColor,
    required this.panelAlpha,
    required this.grid,
    required this.gridAlpha,
    required this.palBody,
    required this.shape,
    required this.motion,
    required this.field,
    required this.texture,
    required this.type,
    required this.ratio,
  });

  // Material-style surface ladder.
  final String surface;
  final String surfaceLowest;
  final String surfaceLow;
  final String surfaceContainer;
  final String surfaceHigh;
  final String surfaceHighest;
  final String onSurface;
  final String onSurfaceVariant;
  final String outline;
  final String outlineVariant;
  final String primary;
  final String primaryContainer;
  final String onPrimary;
  final String secondary;
  final String tertiary;
  final String error;
  final String warn;
  final String accent;

  /// A CSS `rgba(…)` string.
  final String accentGlow;

  /// "classic" | "signal".
  final String skin;
  final bool dark;

  // Skin-neutral extras that skin-aware components read.
  /// Filled accent surfaces (play button, selected chip).
  final String accentFill;

  /// Text/icons ON [accentFill] (always ≥ 4.6:1).
  final String accentInk;

  /// Darker accent for pressed states / hard shadows under accent buttons.
  final String accentDeep;

  /// Accent used AS TEXT on the page and on panels (always ≥ 4.6:1).
  final String accentText;
  final String line;
  final String control;
  final String shadowColor;
  final String panelColor;
  final double panelAlpha;
  final String grid;
  final double gridAlpha;
  final String palBody;
  final PaletteShape shape;
  final PaletteMotion motion;

  /// Background field: "Chladni" | "Interference" | "Grid" | "None".
  final String field;

  /// "Grain" | "Scanlines" | "None".
  final String texture;

  /// Display type: "Classic" | "Wide" | "Condensed" | "Grotesk".
  final String type;

  /// The worst accent contrast ratio in this palette, 1 decimal.
  final double ratio;

  bool get isSignal => skin == 'signal';

  /// The same keys (and value shapes) the JS fixtures contain.
  Map<String, Object?> toJson() => {
    'surface': surface,
    'surfaceLowest': surfaceLowest,
    'surfaceLow': surfaceLow,
    'surfaceContainer': surfaceContainer,
    'surfaceHigh': surfaceHigh,
    'surfaceHighest': surfaceHighest,
    'onSurface': onSurface,
    'onSurfaceVariant': onSurfaceVariant,
    'outline': outline,
    'outlineVariant': outlineVariant,
    'primary': primary,
    'primaryContainer': primaryContainer,
    'onPrimary': onPrimary,
    'secondary': secondary,
    'tertiary': tertiary,
    'error': error,
    'warn': warn,
    'accent': accent,
    'accentGlow': accentGlow,
    'skin': skin,
    'dark': dark,
    'accentFill': accentFill,
    'accentInk': accentInk,
    'accentDeep': accentDeep,
    'accentText': accentText,
    'line': line,
    'control': control,
    'shadowColor': shadowColor,
    'panelColor': panelColor,
    'panelAlpha': panelAlpha,
    'grid': grid,
    'gridAlpha': gridAlpha,
    'palBody': palBody,
    'shape': shape.toJson(),
    'motion': motion.toJson(),
    'field': field,
    'texture': texture,
    'type': type,
    'ratio': ratio,
  };
}
