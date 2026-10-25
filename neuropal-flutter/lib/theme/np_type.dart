// Type roles for both skins, read from TYPE_ROLES in tokens.g.dart.
//
// The font family names in pubspec.yaml match TYPE_ROLES exactly, so a role
// like {family: "Archivo", weight: 900} maps straight onto a bundled file
// (weight 900 of "Archivo" = the SemiExpanded Black cut = the "Wide" look).

import 'package:flutter/painting.dart';

import 'tokens.g.dart';

/// Bundled fonts that cover Greek letters, sub/superscripts and most math
/// symbols — used when the main font lacks a glyph (Atkinson, Fraunces and
/// Archivo have no Greek). Without this, the OS would substitute a random
/// system font; the few symbols missing here (ℏ, ∇, ⊥…) still fall back to
/// the system's math font.
const List<String> kGlyphFallback = ['Inter', 'JetBrains Mono'];

FontWeight _weight(Object? value) {
  final w = (value is num ? value.toInt() : 400).clamp(100, 900);
  return FontWeight.values.firstWhere(
    (fw) => fw.value == (w ~/ 100) * 100,
    orElse: () => FontWeight.w400,
  );
}

class NpType {
  const NpType({
    required this.displayFamily,
    required this.displayWeight,
    required this.displayTracking,
    required this.displaySemiFamily,
    required this.displaySemiWeight,
    required this.bodyFamily,
    required this.monoFamily,
    required this.monoWeight,
    required this.labelFamily,
    required this.labelWeight,
    required this.labelTracking,
  });

  /// Builds the roles for a skin. [displayType] is the Signal "type"
  /// setting ("Wide" | "Condensed" | "Grotesk"); Classic passes "Classic".
  factory NpType.forSkin(String skin, String displayType) {
    final roles = kTypeRoles[skin == 'signal' ? 'signal' : 'classic']!;
    String family(String role) => roles[role]!['family']! as String;
    FontWeight weight(String role) => _weight(roles[role]!['weight']);

    var displayFamily = family('display');
    var displayWeight = weight('display');
    var tracking = -0.02;
    if (skin == 'signal') {
      switch (displayType) {
        case 'Condensed':
          displayFamily = 'Archivo Condensed';
          displayWeight = FontWeight.w800;
          tracking = -0.005;
        case 'Grotesk':
          displayFamily = 'Space Grotesk';
          displayWeight = FontWeight.w700;
          tracking = -0.02;
        default: // "Wide": Archivo 900 → the SemiExpanded Black cut.
          tracking = -0.025;
      }
    }

    return NpType(
      displayFamily: displayFamily,
      displayWeight: displayWeight,
      displayTracking: tracking,
      displaySemiFamily: family('displaySemi'),
      displaySemiWeight: weight('displaySemi'),
      bodyFamily: family('body'),
      monoFamily: family('mono'),
      monoWeight: weight('mono'),
      labelFamily: family('label'),
      labelWeight: weight('label'),
      // Signal labels: 0.14em; Classic eyebrows breathe a little more.
      labelTracking: skin == 'signal' ? 0.14 : 0.2,
    );
  }

  final String displayFamily;
  final FontWeight displayWeight;

  /// Letter spacing in em (multiplied by the font size).
  final double displayTracking;
  final String displaySemiFamily;
  final FontWeight displaySemiWeight;
  final String bodyFamily;
  final String monoFamily;
  final FontWeight monoWeight;
  final String labelFamily;
  final FontWeight labelWeight;
  final double labelTracking;

  /// Big headings ("Hello, Ryx.", screen titles).
  TextStyle display(double size, Color color) => TextStyle(
    fontFamily: displayFamily,
    fontFamilyFallback: kGlyphFallback,
    fontWeight: displayWeight,
    fontSize: size,
    height: 1.05,
    letterSpacing: size * displayTracking,
    color: color,
  );

  /// Smaller headings (card titles, section names).
  TextStyle displaySemi(double size, Color color) => TextStyle(
    fontFamily: displaySemiFamily,
    fontFamilyFallback: kGlyphFallback,
    fontWeight: displaySemiWeight,
    fontSize: size,
    height: 1.15,
    color: color,
  );

  /// Interface and body text.
  TextStyle body(
    double size,
    Color color, {
    FontWeight weight = FontWeight.w400,
    double height = 1.4,
  }) => TextStyle(
    fontFamily: bodyFamily,
    fontFamilyFallback: kGlyphFallback,
    fontWeight: weight,
    fontSize: size,
    height: height,
    color: color,
  );

  /// Numbers, timings, technical metadata (tabular figures).
  TextStyle mono(double size, Color color, {FontWeight? weight}) => TextStyle(
    fontFamily: monoFamily,
    fontFamilyFallback: kGlyphFallback,
    fontWeight: weight ?? monoWeight,
    fontSize: size,
    height: 1.3,
    color: color,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// Upper-case section labels. Render through NpLabel, which upper-cases
  /// the text but keeps the original wording for screen readers.
  TextStyle label(Color color, {double size = 11}) => TextStyle(
    fontFamily: labelFamily,
    fontFamilyFallback: kGlyphFallback,
    fontWeight: labelWeight,
    fontSize: size,
    height: 1.25,
    letterSpacing: size * labelTracking,
    color: color,
  );
}
