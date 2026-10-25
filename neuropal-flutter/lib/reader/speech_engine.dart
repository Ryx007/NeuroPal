// The on-device speech engine behind a small interface.
//
// WHY an interface: the playback logic (chunk chaining, word sync, the
// timer estimator) lives in TtsPlayer and is unit-tested with a fake
// engine; FlutterTtsEngine is the thin real adapter around flutter_tts.
// All voices are the device's own; no network TTS.

import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../data/settings_controller.dart';

/// A voice as reported by the engine.
class TtsVoice {
  const TtsVoice({
    required this.name,
    required this.locale,
    this.identifier,
    this.quality,
    this.networkRequired = false,
  });

  final String name;
  final String locale;
  final String? identifier;

  /// Engine wording: "very high", "high", "normal", "enhanced", "premium"…
  final String? quality;

  /// Android voices that stream from Google's servers.
  final bool networkRequired;

  VoiceChoice toChoice() =>
      VoiceChoice(name: name, locale: locale, identifier: identifier);

  bool matches(VoiceChoice? choice) =>
      choice != null &&
      (identifier != null && identifier == choice.identifier ||
          name == choice.name && locale == choice.locale);

  /// For sorting: English first, then the best on-device quality.
  int get score {
    var s = 0;
    final q = (quality ?? '').toLowerCase();
    if (q.contains('premium') || q == 'very high') s += 120;
    if (q.contains('enhanced') || q == 'high') s += 100;
    if (RegExp('enhanced|premium|neural|natural', caseSensitive: false)
        .hasMatch(name)) {
      s += 50;
    }
    if (locale.toLowerCase().startsWith('en')) s += 200;
    if (networkRequired) s -= 30; // needs internet: worse offline
    return s;
  }
}

typedef ProgressCallback = void Function(String text, int start, int end);

abstract class SpeechEngine {
  /// Engine events. Set once by TtsPlayer.
  VoidCallback? onStart;
  VoidCallback? onComplete;
  ProgressCallback? onProgress;
  void Function(String message)? onError;

  Future<void> init();
  Future<void> setRate(double rate);
  Future<void> setPitch(double pitch);

  /// Null = the engine's default English voice.
  Future<void> setVoice(VoiceChoice? voice);

  /// Starts speaking [text], replacing whatever was being spoken. Returns
  /// as soon as the engine accepted it; completion arrives via [onComplete].
  Future<void> speak(String text);
  Future<void> stop();
  Future<List<TtsVoice>> voices();
}

class FlutterTtsEngine extends SpeechEngine {
  final FlutterTts _tts = FlutterTts();
  Future<void>? _ready;

  @override
  Future<void> init() => _ready ??= _init();

  Future<void> _init() async {
    _tts.setStartHandler(() => onStart?.call());
    _tts.setCompletionHandler(() => onComplete?.call());
    _tts.setProgressHandler((text, start, end, word) {
      onProgress?.call(text, start, end);
    });
    _tts.setErrorHandler((message) => onError?.call('$message'));
    // Completion arrives through the handler above; speak() must not wait
    // for it (iOS never resolves that future after stop()).
    await _tts.awaitSpeakCompletion(false);
    if (!kIsWeb && Platform.isIOS) {
      try {
        await _tts.setSharedInstance(true);
        // Play even with the silent switch on, like an audiobook.
        await _tts.setIosAudioCategory(
          IosTextToSpeechAudioCategory.playback,
          [
            IosTextToSpeechAudioCategoryOptions.allowBluetooth,
            IosTextToSpeechAudioCategoryOptions.allowBluetoothA2DP,
            IosTextToSpeechAudioCategoryOptions.duckOthers,
          ],
          IosTextToSpeechAudioMode.spokenAudio,
        );
      } on Object catch (e) {
        debugPrint('TTS: iOS audio session setup failed: $e');
      }
    }
  }

  @override
  Future<void> setRate(double rate) async {
    await init();
    await _tts.setSpeechRate(rate);
  }

  @override
  Future<void> setPitch(double pitch) async {
    await init();
    await _tts.setPitch(pitch);
  }

  @override
  Future<void> setVoice(VoiceChoice? voice) async {
    await init();
    if (voice == null) {
      // Reading material is English; the device locale may not be.
      await _tts.setLanguage('en-US');
      return;
    }
    await _tts.setVoice(voice.toJson());
  }

  @override
  Future<void> speak(String text) async {
    await init();
    await _tts.speak(text);
  }

  @override
  Future<void> stop() async {
    await init();
    await _tts.stop();
  }

  @override
  Future<List<TtsVoice>> voices() async {
    await init();
    final raw = await _tts.getVoices;
    if (raw is! List) return const [];
    final out = <TtsVoice>[];
    for (final v in raw) {
      if (v is! Map) continue;
      final name = '${v['name'] ?? ''}';
      if (name.isEmpty) continue;
      out.add(
        TtsVoice(
          name: name,
          locale: '${v['locale'] ?? ''}',
          identifier: v['identifier'] as String?,
          quality: v['quality'] as String?,
          networkRequired: '${v['network_required']}' == '1',
        ),
      );
    }
    out.sort((a, b) {
      final byScore = b.score.compareTo(a.score);
      return byScore != 0 ? byScore : a.name.compareTo(b.name);
    });
    return out;
  }
}
