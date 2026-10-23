// TEMPORARY visual QA harness (not part of the suite): renders key screens
// with the real fonts to PNGs in the scratchpad.
// ignore_for_file: avoid_print
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/app.dart';
import 'package:neuropal/reader/reader_controller.dart';
import 'package:neuropal/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const out = '/tmp/claude-0/-home-claude/aa7fe01a-faa2-5b24-9f30-0260a7a33b2d/scratchpad/shots';

Future<void> loadFonts() async {
  final families = <String, List<String>>{
    'Space Grotesk': ['SpaceGrotesk-600', 'SpaceGrotesk-700'],
    'Inter': ['Inter-400', 'Inter-500', 'Inter-600', 'Inter-700'],
    'JetBrains Mono': ['JetBrainsMono-400'],
    'Archivo': ['Archivo-Bold', 'Archivo-SemiExpanded-Black'],
    'Archivo Condensed': ['Archivo-Condensed-ExtraBold'],
    'Atkinson Hyperlegible Next': [
      'AtkinsonHyperlegibleNext-400',
      'AtkinsonHyperlegibleNext-500',
      'AtkinsonHyperlegibleNext-600',
      'AtkinsonHyperlegibleNext-700',
    ],
    'Atkinson Hyperlegible Mono': ['AtkinsonHyperlegibleMono-400', 'AtkinsonHyperlegibleMono-700'],
    'Atkinson Hyperlegible': ['AtkinsonHyperlegible-400', 'AtkinsonHyperlegible-700'],
    'Lora': ['Lora-400'],
    'Fraunces': ['Fraunces-400'],
  };
  for (final e in families.entries) {
    final loader = FontLoader(e.key);
    for (final f in e.value) {
      final bytes = File('assets/fonts/$f.ttf').readAsBytesSync();
      loader.addFont(Future.value(ByteData.view(Uint8List.fromList(bytes).buffer)));
    }
    await loader.load();
  }
  final icons = FontLoader('MaterialIcons');
  final bytes = File('/opt/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync();
  icons.addFont(Future.value(ByteData.view(Uint8List.fromList(bytes).buffer)));
  await icons.load();
}

Future<AppServices> boot(WidgetTester tester, Map<String, Object> prefs, {bool online = false}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 2, 915 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(prefs);
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: online
        ? fakeBackend(routes: {
            'POST /api/documents/a/query': (_) => jsonResponse({
                  'answer': r'**Short answer:** the correlation function $\Gamma(\rho_a,\rho_b)$ keeps both the spatial and the directional information, so refocusing is done *after* the measurement.\n\n- Detector A images the object\n- Detector B images the lens',
                  'citations': [
                    {'chunkId': 'c1', 'page': 3, 'excerpt': 'The correlation between intensity fluctuations retrieved by the two detectors encodes the light field.'},
                    {'chunkId': 'c2', 'page': null, 'excerpt': 'Refocusing is achieved by integrating over the coordinates of the lens plane.'},
                  ],
                  'mode': 'rag', 'model': 'gemini-2.5-flash', 'provider': 'gemini',
                }),
            'GET /api/documents/a/text': (_) => jsonResponse({'id': 'a', 'title': 'CPI', 'text': 'Plenoptic imaging.\n\nSome text here.', 'toc': []}),
            'GET /api/documents/a/progress': (_) => jsonResponse({'progress': 0, 'lastWordIndex': 0}),
            'GET /api/documents': (_) => jsonResponse([
                  {'_id': 'a', 'title': 'Correlation plenoptic imaging with entangled photons', 'subtitle': 'D’Angelo, Pepe · QuOT Lab', 'type': 'pdf', 'status': 'ready', 'readingProgress': 0.38, 'pageCount': 12, 'wordCount': 6400},
                  {'_id': 'b', 'title': 'Introduction to Quantum Mechanics (Griffiths, 3rd ed.)', 'type': 'epub', 'status': 'embedding', 'progress': 0.45},
                  {'_id': 'c', 'title': 'Scanned lab notebook 2019', 'type': 'pdf', 'status': 'failed', 'ingestError': 'failed at parsing: no extractable text (OCR found 0 words)'},
                ]),
          })
        : offlineBackend(),
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

Future<void> shot(WidgetTester tester, String name) async {
  await tester.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('$out/$name.png'));
}

const signal = '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';
const concrete = '{"v":1,"skin":"signal","signal":{"acc":"#E5261F","base":"Concrete","motion":"Calm","field":"Grid","brutality":3,"corners":"Sharp","texture":"None","type":"Condensed"}}';
const classicLight = '{"v":1,"skin":"classic","classic":{"theme":"light","accent":"cyan"}}';

Future<void> openReader(WidgetTester tester, String title, {int word = 40}) async {
  await tester.tap(find.text(title));
  await tester.pumpAndSettle();
  final reader = tester.element(find.byType(Scaffold).first).read<ReaderController>();
  await reader.seekTo(word);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);

  for (final (name, look) in [('classic', null), ('signal', signal), ('concrete', concrete), ('classiclight', classicLight)]) {
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
    await tester.tap(find.text('Correlation plenoptic imaging with entangled photons'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Why can CPI refocus after the fact?');
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
    await openReader(tester, 'Single-photon avalanche diodes in brief', word: 60);
    await tester.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
    await shot(tester, 'reader-collapsed-signal');
    await tester.tap(find.byIcon(Icons.text_fields_rounded));
    await shot(tester, 'sheet-text-signal');
  });
}
