// Renders the main screens in both skins to PNG files, with the real
// bundled fonts — a quick way to review the look without a phone.
//
//   flutter test tool/screenshots_test.dart
//   → build/screenshots/*.png        (build/ is git-ignored)
//
// It lives in tool/, not test/, so the normal `flutter test` run (and CI)
// never executes it: it writes files instead of checking anything.
// Fonts come from the app's own FontManifest.json, so no machine-specific
// paths are involved.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/app.dart';
import 'package:neuropal/reader/reader_controller.dart';
import 'package:neuropal/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../test/helpers/fakes.dart';

/// Registers every font in FontManifest.json (the app's fonts and the
/// Material icon font) so text renders as on a phone, not as test boxes.
Future<void> loadAppFonts() async {
  final manifest =
      jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
  for (final family in manifest.cast<Map<String, dynamic>>()) {
    final loader = FontLoader(family['family'] as String);
    for (final font in (family['fonts'] as List).cast<Map<String, dynamic>>()) {
      loader.addFont(rootBundle.load(font['asset'] as String));
    }
    await loader.load();
  }
}

Future<AppServices> boot(
  WidgetTester tester,
  Map<String, Object> prefs, {
  bool online = false,
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 2, 915 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  // Test-only API: fine here, this file runs under `flutter test` too.
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues(prefs);
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: online
        ? fakeBackend(
            routes: {
              'POST /api/documents/a/query': (_) => jsonResponse({
                'answer':
                    r'**Short answer:** the correlation function '
                    r'$\Gamma(\rho_a,\rho_b)$ keeps both the spatial and the '
                    'directional information, so refocusing is done *after* '
                    'the measurement.\n\n- Detector A images the object\n'
                    '- Detector B images the lens',
                'citations': [
                  {
                    'chunkId': 'c1',
                    'page': 3,
                    'excerpt': 'The correlation between intensity fluctuations retrieved by the two detectors encodes the light field.',
                  },
                  {
                    'chunkId': 'c2',
                    'page': null,
                    'excerpt': 'Refocusing is achieved by integrating over the coordinates of the lens plane.',
                  },
                ],
                'mode': 'rag',
                'model': 'gemini-2.5-flash',
                'provider': 'gemini',
              }),
              'GET /api/documents/a/text': (_) => jsonResponse({
                'id': 'a',
                'title': 'CPI',
                'text': 'Plenoptic imaging.\n\nSome text here.',
                'toc': [],
              }),
              'GET /api/documents/a/progress': (_) =>
                  jsonResponse({'progress': 0, 'lastWordIndex': 0}),
              'GET /api/documents': (_) => jsonResponse([
                {
                  '_id': 'a',
                  'title':
                      'Correlation plenoptic imaging with entangled photons',
                  'subtitle': 'D’Angelo, Pepe · QuOT Lab',
                  'type': 'pdf',
                  'status': 'ready',
                  'readingProgress': 0.38,
                  'pageCount': 12,
                  'wordCount': 6400,
                },
                {
                  '_id': 'b',
                  'title':
                      'Introduction to Quantum Mechanics (Griffiths, 3rd ed.)',
                  'type': 'epub',
                  'status': 'embedding',
                  'progress': 0.45,
                },
                {
                  '_id': 'c',
                  'title': 'Scanned lab notebook 2019',
                  'type': 'pdf',
                  'status': 'failed',
                  'ingestError': 'failed at parsing: no extractable text (OCR found 0 words)',
                },
              ]),
            },
          )
        : offlineBackend(),
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

Future<void> shot(WidgetTester tester, String name) async {
  await tester.pumpAndSettle();
  // Paths are relative to this file: tool/../build/screenshots/<name>.png
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('../build/screenshots/$name.png'),
  );
}

const signal =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';
const concrete =
    '{"v":1,"skin":"signal","signal":{"acc":"#E5261F","base":"Concrete","motion":"Calm","field":"Grid","brutality":3,"corners":"Sharp","texture":"None","type":"Condensed"}}';
const classicLight =
    '{"v":1,"skin":"classic","classic":{"theme":"light","accent":"cyan"}}';

Future<void> openReader(
  WidgetTester tester,
  String title, {
  int word = 40,
}) async {
  await tester.tap(find.text(title));
  await tester.pumpAndSettle();
  final reader = tester
      .element(find.byType(Scaffold).first)
      .read<ReaderController>();
  await reader.seekTo(word);
  await tester.pumpAndSettle();
}

void main() {
  autoUpdateGoldenFiles = true; // write the PNGs, never compare
  setUpAll(loadAppFonts);

  for (final (name, look) in [
    ('classic', null),
    ('signal', signal),
    ('concrete', concrete),
    ('classiclight', classicLight),
  ]) {
    testWidgets('library-$name', (tester) async {
      await boot(tester, {'np.appearance': ?look}, online: true);
      await shot(tester, 'library-$name');
      await tester.pumpWidget(const SizedBox());
    });
    testWidgets('reader-$name', (tester) async {
      await boot(tester, {'np.demoMode': true, 'np.appearance': ?look});
      await openReader(tester, 'Correlation plenoptic imaging: the basics');
      await shot(tester, 'reader-$name');
    });
  }

  testWidgets('ask-classic', (tester) async {
    await boot(tester, {}, online: true);
    await tester.tap(
      find.text('Correlation plenoptic imaging with entangled photons'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'Why can CPI refocus after the fact?',
    );
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    await shot(tester, 'ask-classic');
  });

  testWidgets('bigtext-signal', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await boot(tester, {'np.demoMode': true, 'np.appearance': signal});
    await shot(tester, 'bigtext-library-signal');
    await openReader(tester, 'Correlation plenoptic imaging: the basics');
    await shot(tester, 'bigtext-reader-signal');
  });

  testWidgets('bigtext-classic', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await boot(tester, {'np.demoMode': true});
    await openReader(tester, 'Correlation plenoptic imaging: the basics');
    await shot(tester, 'bigtext-reader-classic');
  });

  testWidgets('offline-signal', (tester) async {
    await boot(tester, {'np.appearance': signal});
    await shot(tester, 'offline-signal');
  });

  testWidgets('settings-signal', (tester) async {
    await boot(tester, {'np.demoMode': true, 'np.appearance': signal});
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await shot(tester, 'drawer-signal');
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    await shot(tester, 'settings-signal');
    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await shot(tester, 'settings-signal-2');
  });

  testWidgets('settings-classic', (tester) async {
    await boot(tester, {'np.demoMode': true});
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await shot(tester, 'settings-classic-2');
  });

  testWidgets('reader-collapsed-and-sheets-signal', (tester) async {
    await boot(tester, {'np.demoMode': true, 'np.appearance': signal});
    await openReader(
      tester,
      'Single-photon avalanche diodes in brief',
      word: 60,
    );
    await tester.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
    await shot(tester, 'reader-collapsed-signal');
    await tester.tap(find.byIcon(Icons.text_fields_rounded));
    await shot(tester, 'sheet-text-signal');
  });
}
