// End-to-end widget tests: the real app with a fake speech engine and an
// in-memory backend. Reduce-motion is on, which also proves the "Still"
// path (nothing animates forever).

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/reader/karaoke_text.dart';
import 'package:neuropal/reader/reader_controller.dart';
import 'package:neuropal/services.dart';
import 'package:neuropal/theme/np_style.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

late FakeSpeechEngine engine;

Future<AppServices> boot(
  WidgetTester tester, {
  Map<String, Object> prefs = const {},
  http.Client? client,
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues(prefs);
  engine = FakeSpeechEngine();
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: engine,
    httpClient: client ?? offlineBackend(),
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

NpStyle styleOf(WidgetTester tester) =>
    NpStyle.of(tester.element(find.byType(Scaffold).first));

/// The screen's main list (text fields have their own Scrollables).
Finder mainList() => find
    .descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable))
    .first;

void main() {
  testWidgets('offline real mode shows the failure, never fake data', (
    tester,
  ) async {
    await boot(tester);
    expect(find.text('Can’t reach the NeuroPal backend'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining('Correlation plenoptic'), findsNothing);
  });

  testWidgets('real mode lists the backend documents with their status', (
    tester,
  ) async {
    await boot(
      tester,
      client: fakeBackend(
        routes: {
          'GET /api/documents': (_) => jsonResponse([
            {
              '_id': 'a',
              'title': 'Ghost imaging review',
              'type': 'pdf',
              'status': 'ready',
              'readingProgress': 0.38,
            },
            {
              '_id': 'b',
              'title': 'Griffiths QM',
              'type': 'epub',
              'status': 'embedding',
              'progress': 0.45,
            },
          ]),
        },
      ),
    );
    expect(find.text('Ghost imaging review'), findsOneWidget);
    expect(find.text('38% read'), findsOneWidget);
    expect(find.text('Processing · embedding · 45%'), findsOneWidget);
    // The library keeps polling while something is processing; stop it.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('demo library: open, play with karaoke sync, pause saves', (
    tester,
  ) async {
    final services = await boot(tester, prefs: {'np.demoMode': true});
    expect(find.text('Demo library (offline)'), findsOneWidget);
    expect(
      find.text('Correlation plenoptic imaging: the basics'),
      findsOneWidget,
    );

    await tester.tap(find.text('Correlation plenoptic imaging: the basics'));
    await tester.pumpAndSettle();
    expect(find.byType(KaraokeParagraph), findsWidgets);
    // The display equation is further down: scroll the text to it.
    await tester.scrollUntilVisible(
      find.byType(EquationCard),
      400,
      scrollable: mainList(),
    );
    expect(find.byType(EquationCard), findsOneWidget);

    // Play: the engine gets the first chunk; equations are "equation".
    await tester.tap(find.byIcon(Icons.play_arrow_rounded).first);
    await tester.pump();
    expect(engine.spoken, hasLength(1));
    // (the heading ends in "?", so no pause full stop is added)
    expect(engine.last, startsWith('Why plenoptic imaging? A conventional'));
    expect(engine.last, contains(' equation '));
    expect(engine.last, isNot(contains(r'$')));
    expect(engine.rate, isNotNull);
    expect(engine.pitch, 1.0); // Natural

    // The engine reports the range of word 4, "conventional" (chars 25–37).
    engine
      ..fireStart()
      ..fireRange(25, 37);
    await tester.pump();
    final controller = tester
        .element(find.byType(Scaffold).first)
        .read<ReaderController>();
    expect(controller.cursor.index, 4);
    expect(controller.playing, isTrue);

    await tester.tap(find.byIcon(Icons.pause_rounded).first);
    await tester.pump();
    expect(controller.playing, isFalse);
    final saved = jsonDecode(
      services.prefs.getString('np.demo.progress.demo-cpi-basics')!,
    ) as Map;
    expect(saved['lastWordIndex'], 4);

    // Skip forward moves the cursor to the next paragraph.
    await tester.tap(find.byIcon(Icons.fast_forward_rounded));
    await tester.pump();
    expect(controller.cursor.index, greaterThan(4));
  });

  testWidgets('Ask in demo mode explains why it cannot answer', (tester) async {
    await boot(tester, prefs: {'np.demoMode': true});
    final spad = find.text('Single-photon avalanche diodes in brief');
    await tester.scrollUntilVisible(spad, 300, scrollable: mainList());
    await tester.pump();
    await tester.tap(spad);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'What is dead time?');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Ask needs the backend'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('both skins render; switching in Settings applies + saves', (
    tester,
  ) async {
    final services = await boot(tester, prefs: {'np.demoMode': true});
    expect(styleOf(tester).isSignal, isFalse);

    // Drawer → Settings.
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Backend connection'), findsOneWidget);

    // (Three server rows push the skin picker below the fold.)
    await tester.scrollUntilVisible(
      find.text('Signal').first,
      200,
      scrollable: mainList(),
    );
    await tester.pump(); // lay out the scrolled list before tapping
    await tester.tap(find.text('Signal').first);
    await tester.pumpAndSettle();
    expect(styleOf(tester).isSignal, isTrue);
    expect(styleOf(tester).still, isTrue); // reduce-motion wins
    final saved = jsonDecode(services.prefs.getString('np.appearance')!) as Map;
    expect(saved['skin'], 'signal');

    // A preset applies its whole look.
    await tester.scrollUntilVisible(
      find.text('Concrete'),
      200,
      scrollable: mainList(),
    );
    await tester.pump(); // lay out the scrolled list before tapping
    await tester.tap(find.text('Concrete'));
    await tester.pumpAndSettle();
    expect(styleOf(tester).palette.surface, '#D9D9D4');

    // The reader renders in Signal too.
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Library'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Correlation plenoptic imaging: the basics'));
    await tester.pumpAndSettle();
    expect(find.byType(KaraokeParagraph), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
