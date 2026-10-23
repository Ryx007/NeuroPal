// The appearance object: defaults, persistence on the device, and the
// best-effort sync to the backend.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/theme/appearance.dart';
import 'package:neuropal/theme/appearance_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<SharedPreferences> prefsWith(Map<String, Object> values) async {
  SharedPreferences.setMockInitialValues(values);
  return SharedPreferences.getInstance();
}

void main() {
  test('first launch: Classic dark × ruby', () async {
    final c = AppearanceController(prefs: await prefsWith({}));
    expect(c.appearance.skin, 'classic');
    expect(c.appearance.classic.theme, 'dark');
    expect(c.appearance.classic.accent, 'ruby');
    expect(c.palette.skin, 'classic');
    expect(c.appearance.updatedAt, isNull);
  });

  test('changes are saved as the full normalised object', () async {
    final prefs = await prefsWith({});
    final c = AppearanceController(prefs: prefs);
    c.applySignalPreset('Night lab');

    final saved = jsonDecode(prefs.getString('np.appearance')!) as Map;
    expect(saved['v'], 1);
    expect(saved['skin'], 'signal');
    expect((saved['signal'] as Map)['base'], 'Black');
    expect(saved['pal'], isA<Map>()); // untouched parts are kept
    expect(saved['home'], isA<Map>());
    expect(saved['updatedAt'], isA<String>());
    expect(c.signalPreset, 'Night lab');

    // A fresh start reads it back.
    final again = AppearanceController(prefs: prefs);
    expect(again.appearance.skin, 'signal');
    expect(again.palette.surface, '#000000');
  });

  test('classic theme and accent', () async {
    final c = AppearanceController(prefs: await prefsWith({}));
    c.setClassicTheme('sepia');
    c.setClassicAccent('green');
    expect(c.appearance.classic.toJson(), {'theme': 'sepia', 'accent': 'green'});
    expect(c.palette.accentFill, '#4A6B2A');
  });

  test('a corrupt saved value falls back to defaults', () async {
    final c = AppearanceController(
      prefs: await prefsWith({'np.appearance': '{not json'}),
    );
    expect(c.appearance.toJson(), Appearance.initial().toJson());
  });

  test('sync gets the object; its failures are ignored', () async {
    final sent = <Map<String, Object?>>[];
    final c = AppearanceController(
      prefs: await prefsWith({}),
      sync: (json) async {
        sent.add(json);
        throw Exception('404: no /api/me/appearance on this backend');
      },
    );
    c.setSkin('signal');
    await Future<void>.delayed(Duration.zero);
    expect(sent.single['skin'], 'signal');
    expect(c.appearance.skin, 'signal'); // still applied locally
  });

  test('reduce-motion forces a still style', () async {
    final c = AppearanceController(prefs: await prefsWith({}));
    c.applySignalPreset('UV'); // motion: Wild
    expect(c.style(reduceMotion: false).still, isFalse);
    expect(c.style(reduceMotion: true).still, isTrue);
  });
}
