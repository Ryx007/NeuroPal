// WPM → engine rate calibration and tone → pitch.

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/reader/wpm.dart';

void main() {
  test('Android: linear, halved for flutter_tts (which doubles it)', () {
    final normal = speechRateForWpm(kEngineNormalWpm.round(), TargetPlatform.android);
    expect(normal, closeTo(0.5, 0.01)); // = Android rate 1.0
    final twice = speechRateForWpm(350, TargetPlatform.android);
    expect(twice, closeTo(1.0, 0.01)); // twice the natural pace
  });

  test('rate grows with WPM and stays in the valid range', () {
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      var previous = 0.0;
      for (var wpm = kMinWpm; wpm <= kMaxWpm; wpm += 10) {
        final rate = speechRateForWpm(wpm, platform);
        expect(rate, greaterThan(previous), reason: '$platform $wpm');
        expect(rate, inInclusiveRange(0.1, 1.5));
        previous = rate;
      }
    }
    expect(speechRateForWpm(kMaxWpm, TargetPlatform.iOS), lessThanOrEqualTo(1.0));
  });

  test('WPM is clamped to 120–400', () {
    expect(clampWpm(50), kMinWpm);
    expect(clampWpm(999), kMaxWpm);
    expect(kDefaultWpm, 225);
  });

  test('tones map to the Expo pitches', () {
    expect(pitchForTone('Soft'), 1.1);
    expect(pitchForTone('Natural'), 1.0);
    expect(pitchForTone('Deep'), 0.85);
  });
}
