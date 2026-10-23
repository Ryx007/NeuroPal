// Owns the user's appearance object (skin, Classic theme × accent, Signal
// settings) and the palette resolved from it.
//
// Persistence: the whole normalised object is saved on the device after
// every change, then sent to the backend (PUT /api/me/appearance) on a
// best-effort basis — an older backend without that route (404) or no
// network is silently fine; the device copy is the source of truth in M1.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'appearance.dart';
import 'classic_palette.dart';
import 'np_style.dart';
import 'signal_palette.dart';
import 'token_palette.dart';
import 'tokens.g.dart';

typedef AppearanceSync = Future<void> Function(Map<String, Object?> appearance);

class AppearanceController extends ChangeNotifier {
  AppearanceController({required SharedPreferences prefs, this.sync})
    : _prefs = prefs {
    Object? saved;
    final raw = prefs.getString(_key);
    if (raw != null) {
      try {
        saved = jsonDecode(raw);
      } on FormatException {
        saved = null; // corrupt → defaults (normalizeAppearance repairs)
      }
    }
    _apply(normalizeAppearance(saved));
  }

  static const _key = 'np.appearance';

  final SharedPreferences _prefs;

  /// Sends the saved object to the backend. Errors are ignored.
  final AppearanceSync? sync;

  late Appearance _appearance;
  late TokenPalette _palette;
  NpStyle? _style;
  NpStyle? _stillStyle;

  Appearance get appearance => _appearance;
  TokenPalette get palette => _palette;

  /// The style for widgets; [reduceMotion] = the OS setting.
  NpStyle style({required bool reduceMotion}) => reduceMotion
      ? (_stillStyle ??= NpStyle.fromPalette(_palette, reduceMotion: true))
      : (_style ??= NpStyle.fromPalette(_palette));

  /// The Signal preset the current settings match, if any.
  String? get signalPreset => matchPreset(_appearance.signal);

  void setSkin(String skin) =>
      _update(_appearance.copyWith(skin: skin == 'signal' ? 'signal' : 'classic'));

  void setClassicTheme(String theme) => _update(
    _appearance.copyWith(
      skin: 'classic',
      classic: normalizeClassic({
        'theme': theme,
        'accent': _appearance.classic.accent,
      }),
    ),
  );

  void setClassicAccent(String accent) => _update(
    _appearance.copyWith(
      skin: 'classic',
      classic: normalizeClassic({
        'theme': _appearance.classic.theme,
        'accent': accent,
      }),
    ),
  );

  void applySignalPreset(String name) {
    final preset = kSignalPresets[name];
    if (preset == null) return;
    _update(
      _appearance.copyWith(skin: 'signal', signal: normalizeSignal(preset)),
    );
  }

  void _apply(Appearance next) {
    _appearance = next;
    _palette = resolveAppearancePalette(next);
    _style = null;
    _stillStyle = null;
  }

  void _update(Appearance next) {
    final stamped = normalizeAppearance(
      next.copyWith(updatedAt: DateTime.now().toUtc().toIso8601String()),
    );
    _apply(stamped);
    notifyListeners();
    final json = stamped.toJson();
    _prefs.setString(_key, jsonEncode(json));
    final send = sync;
    if (send != null) {
      unawaited(
        send(json).catchError((Object e) {
          debugPrint('Appearance sync skipped: $e');
        }),
      );
    }
  }
}
