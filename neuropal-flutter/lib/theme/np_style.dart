// NpStyle: the resolved palette as Flutter values (Colors, radii, text
// styles), attached to the Material theme as a ThemeExtension.
//
// Widgets read it with `NpStyle.of(context)`. Every colour on screen comes
// from here, and everything here comes from the token palette — no
// hard-coded colours in widgets (an accessibility requirement: the
// auto-contrast guarantees only hold for token colours).

import 'package:flutter/material.dart';

import 'css_color.dart';
import 'np_type.dart';
import 'token_palette.dart';
import 'tokens.g.dart';

@immutable
class NpStyle extends ThemeExtension<NpStyle> {
  const NpStyle._({
    required this.palette,
    required this.fonts,
    required this.still,
    required this.surface,
    required this.surfaceLowest,
    required this.surfaceLow,
    required this.surfaceContainer,
    required this.surfaceHigh,
    required this.surfaceHighest,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.line,
    required this.control,
    required this.shadow,
    required this.panel,
    required this.panelSolid,
    required this.grid,
    required this.accentFill,
    required this.accentInk,
    required this.accentDeep,
    required this.accentText,
    required this.accentGlow,
    required this.primaryContainer,
    required this.secondary,
    required this.tertiary,
    required this.error,
    required this.warn,
  });

  /// [reduceMotion] is the OS setting (MediaQuery.disableAnimations); it
  /// always wins over the user's motion choice.
  factory NpStyle.fromPalette(TokenPalette p, {bool reduceMotion = false}) {
    final panelBase = parseCssColor(p.panelColor);
    final gridBase = parseCssColor(p.grid);
    return NpStyle._(
      palette: p,
      fonts: NpType.forSkin(p.skin, p.type),
      still: reduceMotion || p.motion.level == 'Still',
      surface: parseCssColor(p.surface),
      surfaceLowest: parseCssColor(p.surfaceLowest),
      surfaceLow: parseCssColor(p.surfaceLow),
      surfaceContainer: parseCssColor(p.surfaceContainer),
      surfaceHigh: parseCssColor(p.surfaceHigh),
      surfaceHighest: parseCssColor(p.surfaceHighest),
      text: parseCssColor(p.onSurface),
      textMuted: parseCssColor(p.onSurfaceVariant),
      textFaint: parseCssColor(p.outline),
      line: parseCssColor(p.line),
      control: parseCssColor(p.control),
      shadow: parseCssColor(p.shadowColor),
      panel: panelBase.withValues(alpha: p.panelAlpha),
      panelSolid: panelBase,
      grid: gridBase.withValues(alpha: p.gridAlpha),
      accentFill: parseCssColor(p.accentFill),
      accentInk: parseCssColor(p.accentInk),
      accentDeep: parseCssColor(p.accentDeep),
      accentText: parseCssColor(p.accentText),
      accentGlow: parseCssColor(p.accentGlow),
      primaryContainer: parseCssColor(p.primaryContainer),
      secondary: parseCssColor(p.secondary),
      tertiary: parseCssColor(p.tertiary),
      error: parseCssColor(p.error),
      warn: parseCssColor(p.warn),
    );
  }

  /// The style of the nearest theme. Every NeuroPal theme carries one.
  static NpStyle of(BuildContext context) =>
      Theme.of(context).extension<NpStyle>()!;

  final TokenPalette palette;
  /// Type roles (display, body, mono, label) for this skin.
  /// (Not called `type`: ThemeExtension already uses that name as its key.)
  final NpType fonts;

  /// True when nothing may move (motion "Still" or OS reduce-motion).
  final bool still;

  final Color surface;
  final Color surfaceLowest;
  final Color surfaceLow;
  final Color surfaceContainer;
  final Color surfaceHigh;
  final Color surfaceHighest;

  /// Primary text (onSurface).
  final Color text;

  /// Secondary text (onSurfaceVariant).
  final Color textMuted;

  /// Labels and hints (outline). Still ≥ 4.5:1 on the surfaces.
  final Color textFaint;
  final Color line;
  final Color control;
  final Color shadow;

  /// Panel fill at the skin's glass alpha.
  final Color panel;

  /// The same panel colour, opaque (wells, tracks, inputs).
  final Color panelSolid;

  /// Engineering-grid line colour (alpha already applied).
  final Color grid;
  final Color accentFill;
  final Color accentInk;
  final Color accentDeep;
  final Color accentText;
  final Color accentGlow;
  final Color primaryContainer;
  final Color secondary;
  final Color tertiary;
  final Color error;
  final Color warn;

  bool get isSignal => palette.isSignal;
  bool get dark => palette.dark;
  String get texture => palette.texture;

  /// Motion speed multiplier for ambient animation (0 when still).
  double get motionSpeed => still ? 0 : palette.motion.speed;

  double get radius => palette.shape.radius.toDouble();
  double get radiusMedium => palette.shape.radiusMedium.toDouble();

  /// Classic controls are pills (999); Signal uses the medium radius.
  double get radiusControl => palette.shape.radiusControl.toDouble();
  double get borderWidth => palette.shape.border.toDouble();
  double get shadowOffset => palette.shape.shadow.toDouble();

  /// Backdrop blur sigma for glass surfaces (header, player, sheets).
  /// Classic's token is a CSS blur radius (≈ 2σ); Signal's mockups use 18px.
  double get blurSigma =>
      isSignal ? 9 : (kClassicShape['blur']!.toDouble() / 2);

  /// Colour for a status/navigation band behind the system status bar.
  Color get statusBand => isSignal ? shadow : surfaceLowest;

  @override
  NpStyle copyWith() => this;

  // Theme changes are never animated (motion stays in the frame, and fonts
  // cannot be interpolated anyway), so lerp just switches halfway.
  @override
  NpStyle lerp(covariant NpStyle? other, double t) =>
      other == null || t < 0.5 ? this : other;
}

/// The Material theme for built-in widgets (text fields, switches, sheets,
/// progress indicators…), derived from the same tokens.
ThemeData buildMaterialTheme(NpStyle s) {
  final scheme = ColorScheme(
    brightness: s.dark ? Brightness.dark : Brightness.light,
    primary: s.accentFill,
    onPrimary: s.accentInk,
    primaryContainer: s.primaryContainer,
    onPrimaryContainer: s.text,
    secondary: s.secondary,
    onSecondary: s.surface,
    tertiary: s.tertiary,
    onTertiary: s.surface,
    error: s.error,
    onError: s.surface,
    surface: s.surface,
    onSurface: s.text,
    onSurfaceVariant: s.textMuted,
    surfaceContainerLowest: s.surfaceLowest,
    surfaceContainerLow: s.surfaceLow,
    surfaceContainer: s.surfaceContainer,
    surfaceContainerHigh: s.surfaceHigh,
    surfaceContainerHighest: s.surfaceHighest,
    outline: s.textFaint,
    outlineVariant: s.line,
    shadow: s.shadow,
    scrim: s.shadow,
    inverseSurface: s.text,
    onInverseSurface: s.surface,
    inversePrimary: s.accentText,
  );

  final controlShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(s.radiusMedium),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: s.surface,
    canvasColor: s.surface,
    fontFamily: s.fonts.bodyFamily,
    splashFactory: s.still ? NoSplash.splashFactory : InkRipple.splashFactory,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    pageTransitionsTheme: s.still
        ? const PageTransitionsTheme(
            builders: {
              TargetPlatform.android: _NoTransitionsBuilder(),
              TargetPlatform.iOS: _NoTransitionsBuilder(),
              TargetPlatform.linux: _NoTransitionsBuilder(),
              TargetPlatform.macOS: _NoTransitionsBuilder(),
              TargetPlatform.windows: _NoTransitionsBuilder(),
              TargetPlatform.fuchsia: _NoTransitionsBuilder(),
            },
          )
        : null,
    textTheme: Typography.material2021().black
        .apply(
          fontFamily: s.fonts.bodyFamily,
          bodyColor: s.text,
          displayColor: s.text,
        ),
    iconTheme: IconThemeData(color: s.text),
    dividerColor: s.line,
    drawerTheme: DrawerThemeData(
      backgroundColor: s.surfaceLow,
      scrimColor: s.shadow.withValues(alpha: 0.55),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: s.surfaceLow,
      modalBackgroundColor: s.surfaceLow,
      showDragHandle: false,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(s.radius)),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: s.accentFill,
      linearTrackColor: s.panelSolid,
      circularTrackColor: s.panelSolid,
      refreshBackgroundColor: s.surfaceHigh,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: s.accentText,
      selectionColor: s.accentGlow,
      selectionHandleColor: s.accentFill,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: s.panelSolid,
      hintStyle: s.fonts.body(15, s.textFaint),
      labelStyle: s.fonts.body(15, s.textMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(s.radiusMedium),
        borderSide: BorderSide(color: s.control, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(s.radiusMedium),
        borderSide: BorderSide(color: s.accentText, width: 2.5),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(s.radiusMedium),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? s.accentInk
            : s.control,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? s.accentFill
            : s.panelSolid,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? s.accentFill
            : s.control,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: s.surfaceHighest,
      contentTextStyle: s.fonts.body(15, s.text),
      actionTextColor: s.accentText,
      behavior: SnackBarBehavior.floating,
      shape: controlShape,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: s.surfaceHighest,
        borderRadius: BorderRadius.circular(s.radiusMedium),
        border: Border.all(color: s.line),
      ),
      textStyle: s.fonts.body(13, s.text),
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(s.textFaint.withValues(alpha: 0.6)),
    ),
    extensions: [s],
  );
}

/// Page changes without animation, for motion "Still" / reduce-motion.
class _NoTransitionsBuilder extends PageTransitionsBuilder {
  const _NoTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => child;
}
