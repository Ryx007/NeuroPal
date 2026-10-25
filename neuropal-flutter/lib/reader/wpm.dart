// Reading speed (words per minute) → the speech engine's rate, and the
// Soft / Natural / Deep tone → pitch.
//
// CALIBRATION (why these numbers):
// * Speech engines have no "WPM" setting, only a rate multiplier where 1.0
//   is the voice's natural pace. Google's and Samsung's English voices
//   speak ≈ 160–190 WPM at 1.0 on paper prose; [kEngineNormalWpm] = 175 is
//   the middle of that range. If speech on a device is consistently faster
//   or slower than the WPM shown, adjust this one constant.
// * Android: rate scales linearly (2.0 = twice as fast). flutter_tts maps
//   its own 0.5 to Android's 1.0 (it doubles the value), so
//   flutterRate = multiplier / 2.
// * iOS: AVSpeechUtterance's rate is not linear: 0.5 is normal and 1.0 is
//   roughly 3×. We use 0.5 × m below normal and 0.5 + 0.25 × (m − 1) above
//   it (2× → 0.75). Approximate, but the karaoke stays exact on iOS because
//   AVSpeechSynthesizer always reports word ranges.
// * The highlight never depends on this mapping when the engine reports
//   word ranges; it only seeds the timer estimator used when it doesn't
//   (and that estimator re-learns the real pace after every chunk).

import 'package:flutter/foundation.dart';

const int kMinWpm = 120;
const int kMaxWpm = 400;
const int kDefaultWpm = 225;

/// The engine's pace at rate multiplier 1.0, in words per minute.
const double kEngineNormalWpm = 175;

const List<String> kTones = ['Soft', 'Natural', 'Deep'];

int clampWpm(int wpm) => wpm.clamp(kMinWpm, kMaxWpm);

/// The value to pass to `FlutterTts.setSpeechRate` for [wpm] on [platform].
double speechRateForWpm(int wpm, TargetPlatform platform) {
  final multiplier = clampWpm(wpm) / kEngineNormalWpm;
  if (platform == TargetPlatform.iOS || platform == TargetPlatform.macOS) {
    final rate = multiplier <= 1
        ? 0.5 * multiplier
        : 0.5 + 0.25 * (multiplier - 1);
    return rate.clamp(0.1, 1.0);
  }
  // Android (and anything else): linear; flutter_tts doubles it again.
  // flutter_tts reports 1.5 (= Android 3.0×) as the valid maximum.
  return (multiplier / 2).clamp(0.1, 1.5);
}

/// Pitch multiplier for a tone (same values as the Expo app).
double pitchForTone(String tone) => switch (tone) {
  'Soft' => 1.1,
  'Deep' => 0.85,
  _ => 1.0,
};

/// "1.3×" relative to the engine's natural pace, for the WPM read-out.
String speedMultiplierLabel(int wpm) =>
    '${(clampWpm(wpm) / kEngineNormalWpm).toStringAsFixed(1)}×';
