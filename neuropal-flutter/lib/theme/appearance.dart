// The appearance object (docs/PLATFORM-PLAN.md §3.2) — port of
// packages/tokens/src/appearance.js (normalize + resolve).
//
// It is everything the "Make it yours" studio controls, in one serialisable
// object. The backend stores exactly this shape (User.appearance) and every
// client syncs it, so we always keep the WHOLE object — including the Pal
// and Home parts this M1 app does not edit yet.
//
// TODO(M2): diffAppearance / matchLook / applyLook / interpretAppearance
// (the Ask-Pal studio). Their fixtures are skipped in the parity test.

import 'classic_palette.dart';
import 'home_layout.dart';
import 'js_compat.dart';
import 'pal.dart';
import 'signal_palette.dart';
import 'token_palette.dart';

const int kAppearanceVersion = 1;

class Appearance {
  const Appearance({
    required this.skin,
    required this.classic,
    required this.signal,
    required this.suggestLooks,
    required this.pal,
    required this.home,
    required this.updatedAt,
  });

  /// The defaults every new install starts from.
  factory Appearance.initial() => normalizeAppearance(null);

  /// "classic" | "signal".
  final String skin;
  final ClassicSettings classic;
  final SignalSettings signal;

  /// Pal may SUGGEST a saved look; only the user switches.
  final bool suggestLooks;
  final PalSettings pal;
  final HomeLayout home;

  /// ISO-8601; the backend keeps the newest write. Null = never saved.
  final String? updatedAt;

  bool get isSignal => skin == 'signal';

  Appearance copyWith({
    String? skin,
    ClassicSettings? classic,
    SignalSettings? signal,
    String? updatedAt,
  }) {
    return Appearance(
      skin: skin ?? this.skin,
      classic: classic ?? this.classic,
      signal: signal ?? this.signal,
      suggestLooks: suggestLooks,
      pal: pal,
      home: home,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, Object?> toJson() => {
    'v': kAppearanceVersion,
    'skin': skin,
    'classic': classic.toJson(),
    'signal': signal.toJson(),
    'suggestLooks': suggestLooks,
    'pal': pal.toJson(),
    'home': home.toJson(),
    'updatedAt': updatedAt,
  };
}

/// Repairs anything invalid. Accepts a decoded JSON map (or an
/// [Appearance]); never throws.
///
/// One deliberate difference from the JS: there, `{classic: null}` makes
/// `normalizeClassic(null)` throw (default parameters only replace
/// `undefined`). Here every non-object part simply falls back to defaults.
Appearance normalizeAppearance(Object? input) {
  final src = jsObject(input is Appearance ? input.toJson() : input);
  final updatedAt = src['updatedAt'];
  return Appearance(
    skin: src['skin'] == 'signal' ? 'signal' : 'classic',
    classic: normalizeClassic(src['classic']),
    signal: normalizeSignal(src['signal']),
    suggestLooks: src['suggestLooks'] != false,
    pal: normalizePal(src['pal']),
    home: normalizeHome(src['home']),
    updatedAt: updatedAt is String ? updatedAt : null,
  );
}

/// The palette for whichever skin the appearance selects.
TokenPalette resolveAppearancePalette(Object? appearance) {
  final a = normalizeAppearance(appearance);
  return a.isSignal
      ? resolveSignalPalette(a.signal)
      : resolveClassicPalette(a.classic.toJson());
}
