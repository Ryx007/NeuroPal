// App-wide preferences that are not part of the appearance object:
// demo mode and the reader's listening/reading settings.
//
// Stored on the device with shared_preferences. Every setter saves
// immediately, so nothing is lost if the OS kills the app.

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../reader/wpm.dart';

/// A TTS voice as the user picked it (enough to select it again later).
class VoiceChoice {
  const VoiceChoice({required this.name, required this.locale, this.identifier});

  factory VoiceChoice.fromJson(Map<String, Object?> json) => VoiceChoice(
    name: json['name'] as String? ?? '',
    locale: json['locale'] as String? ?? '',
    identifier: json['identifier'] as String?,
  );

  final String name;
  final String locale;

  /// iOS voice identifier (Android voices are addressed by name).
  final String? identifier;

  // `?identifier` adds the entry only when identifier is not null.
  Map<String, String> toJson() => {
    'name': name,
    'locale': locale,
    'identifier': ?identifier,
  };
}

/// Reader font choices. All are bundled; "Skin" uses the skin's body font.
const List<String> kReaderFonts = [
  'Atkinson Hyperlegible',
  'Lora',
  'Fraunces',
  'Skin',
];

class SettingsController extends ChangeNotifier {
  SettingsController(this._prefs) {
    _demoMode = _prefs.getBool(_kDemo) ?? false;
    _wpm = clampWpm(_prefs.getInt(_kWpm) ?? kDefaultWpm);
    final tone = _prefs.getString(_kTone);
    _tone = kTones.contains(tone) ? tone! : 'Natural';
    final voiceJson = _prefs.getString(_kVoice);
    if (voiceJson != null) {
      try {
        _voice = VoiceChoice.fromJson(
          (jsonDecode(voiceJson) as Map).cast<String, Object?>(),
        );
      } on Object {
        _voice = null; // a corrupt value just means "engine default"
      }
    }
    final font = _prefs.getString(_kFont);
    _readerFont = kReaderFonts.contains(font) ? font! : kReaderFonts.first;
    _readerFontSize = (_prefs.getDouble(_kFontSize) ?? 18).clamp(14, 30);
    _readerLineHeight = (_prefs.getDouble(_kLineHeight) ?? 1.6).clamp(1.3, 2.0);
  }

  static const _kDemo = 'np.demoMode';
  static const _kWpm = 'np.reader.wpm';
  static const _kTone = 'np.reader.tone';
  static const _kVoice = 'np.reader.voice';
  static const _kFont = 'np.reader.font';
  static const _kFontSize = 'np.reader.fontSize';
  static const _kLineHeight = 'np.reader.lineHeight';

  final SharedPreferences _prefs;

  late bool _demoMode;
  late int _wpm;
  late String _tone;
  VoiceChoice? _voice;
  late String _readerFont;
  late double _readerFontSize;
  late double _readerLineHeight;

  /// "Demo library (offline)": bundled samples instead of the backend.
  /// Explicit opt-in only — real mode never silently fakes data.
  bool get demoMode => _demoMode;
  int get wpm => _wpm;

  /// "Soft" | "Natural" | "Deep" (maps to pitch, see wpm.dart).
  String get tone => _tone;

  /// Null = the engine's default English voice.
  VoiceChoice? get voice => _voice;
  String get readerFont => _readerFont;
  double get readerFontSize => _readerFontSize;
  double get readerLineHeight => _readerLineHeight;

  SharedPreferences get prefs => _prefs;

  void setDemoMode(bool value) {
    if (value == _demoMode) return;
    _demoMode = value;
    _prefs.setBool(_kDemo, value);
    notifyListeners();
  }

  void setWpm(int value) {
    final v = clampWpm(value);
    if (v == _wpm) return;
    _wpm = v;
    _prefs.setInt(_kWpm, v);
    notifyListeners();
  }

  void setTone(String value) {
    if (!kTones.contains(value) || value == _tone) return;
    _tone = value;
    _prefs.setString(_kTone, value);
    notifyListeners();
  }

  void setVoice(VoiceChoice? value) {
    _voice = value;
    if (value == null) {
      _prefs.remove(_kVoice);
    } else {
      _prefs.setString(_kVoice, jsonEncode(value.toJson()));
    }
    notifyListeners();
  }

  void setReaderFont(String value) {
    if (!kReaderFonts.contains(value)) return;
    _readerFont = value;
    _prefs.setString(_kFont, value);
    notifyListeners();
  }

  void setReaderFontSize(double value) {
    _readerFontSize = value.clamp(14, 30);
    _prefs.setDouble(_kFontSize, _readerFontSize);
    notifyListeners();
  }

  void setReaderLineHeight(double value) {
    _readerLineHeight = value.clamp(1.3, 2.0);
    _prefs.setDouble(_kLineHeight, _readerLineHeight);
    notifyListeners();
  }
}
