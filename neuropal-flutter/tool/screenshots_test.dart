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
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/library/document_picker.dart';
import 'package:neuropal/pal/crisis.dart';
import 'package:neuropal/pal/pal_bubble.dart';
import 'package:neuropal/pal/pal_controller.dart';
import 'package:neuropal/pal/pal_models.dart';
import 'package:neuropal/pal/pal_sheet.dart';
import 'package:neuropal/reader/reader_controller.dart';
import 'package:neuropal/services.dart';
import 'package:neuropal/widgets/np_buttons.dart';
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
  http.Client? client,
  SessionStore? sessions,
  DateTime Function()? clock,
  Widget Function(Widget app)? wrap,
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
    httpClient: client ?? (online
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
                  'lastReadAt': '2026-11-18T21:10:00.000Z',
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
        : offlineBackend()),
    sessions: sessions,
    clock: clock,
  );
  final app = NeuroPalApp(services: services);
  await tester.pumpWidget(wrap == null ? app : wrap(app));
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

/// The app opens on Home; the drawer leads to the Library.
Future<void> goLibrary(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.menu_rounded));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Library'));
  await tester.pumpAndSettle();
}

/// A Thursday late morning, so countdowns read the same every run.
DateTime homeClock() => DateTime(2026, 11, 19, 11, 35);

/// A realistic day: three anchors (the first done), a fourth task, one
/// task ticked.
void seedDay(AppServices services) {
  final day = services.day;
  final meds = day.addAnchor(
    const AnchorInput(
      title: 'Morning meds',
      subtitle: 'Blue, with water',
      hour: 8,
      minute: 15,
      category: AnchorCategory.medication,
    ),
  )!;
  day.setAnchorDone(meds, true);
  day.addAnchor(
    const AnchorInput(
      title: 'Lunch break',
      hour: 12,
      minute: 30,
      flexMinutes: 15,
      category: AnchorCategory.rest,
    ),
  );
  day.addAnchor(
    const AnchorInput(
      title: 'CPI paper, one section',
      hour: 15,
      minute: 0,
      flexMinutes: 45,
      category: AnchorCategory.study,
    ),
  );
  day.setTaskDone('mvd-2', true);
  day.addTask('Email the lab about the SPAD array');
}

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
      await goLibrary(tester);
      await shot(tester, 'library-$name');
      await tester.pumpWidget(const SizedBox());
    });
    testWidgets('reader-$name', (tester) async {
      await boot(tester, {'np.demoMode': true, 'np.appearance': ?look});
      await goLibrary(tester);
      await openReader(tester, 'Correlation plenoptic imaging: the basics');
      await shot(tester, 'reader-$name');
    });
  }

  testWidgets('ask-classic', (tester) async {
    await boot(tester, {}, online: true);
    await goLibrary(tester);
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
    await goLibrary(tester);
    await shot(tester, 'bigtext-library-signal');
    await openReader(tester, 'Correlation plenoptic imaging: the basics');
    await shot(tester, 'bigtext-reader-signal');
  });

  testWidgets('bigtext-classic', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await boot(tester, {'np.demoMode': true});
    await goLibrary(tester);
    await openReader(tester, 'Correlation plenoptic imaging: the basics');
    await shot(tester, 'bigtext-reader-classic');
  });

  testWidgets('offline-signal', (tester) async {
    await boot(tester, {'np.appearance': signal});
    await goLibrary(tester);
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

  // ---- sign-in (a server with accounts, no session) -----------------------
  for (final (name, look) in [('classic', null), ('signal', signal)]) {
    testWidgets('sign-in-$name', (tester) async {
      await boot(
        tester,
        {'np.appearance': ?look},
        client: FakeAccountsServer().client(),
      );
      await shot(tester, 'sign-in-$name');
      await tester.enterText(
        find.widgetWithText(TextField, 'Email'),
        'ryx@example.com',
      );
      await tester.enterText(find.widgetWithText(TextField, 'Password'), 'x');
      await tester.tap(find.widgetWithText(NpButton, 'Sign in'));
      await shot(tester, 'sign-in-error-$name');
      await tester.tap(find.widgetWithText(NpButton, 'Create an account'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NpButton, 'Create account'));
      await shot(tester, 'sign-in-create-$name');
    });
  }

  for (final (name, look) in [('classic', null), ('signal', signal)]) {
    testWidgets('settings-account-$name', (tester) async {
      final server = FakeAccountsServer(
        routes: {'GET /api/documents': (_) => jsonResponse([])},
      );
      await boot(
        tester,
        {'np.appearance': ?look},
        client: server.client(),
        sessions: SessionStore.memory({
          cloudBase: server.issue('ryx@example.com'),
        }),
      );
      await tester.tap(find.byIcon(Icons.menu_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Sign out'),
        300,
        scrollable: find
            .descendant(
              of: find.byType(ListView).first,
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.drag(find.byType(ListView).first, const Offset(0, -200));
      await shot(tester, 'settings-account-$name');
    });
  }

  testWidgets('bigtext-sign-in-signal', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await boot(
      tester,
      {'np.appearance': signal},
      client: FakeAccountsServer().client(),
    );
    await shot(tester, 'bigtext-sign-in-signal');
  });

  testWidgets('reader-collapsed-and-sheets-signal', (tester) async {
    await boot(tester, {'np.demoMode': true, 'np.appearance': signal});
    await goLibrary(tester);
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


  // ---- Home: no check-in / okay / overwhelmed, both skins -----------------
  for (final (name, look) in [('classic', null), ('signal', signal)]) {
    testWidgets('home-$name', (tester) async {
      final services = await boot(
        tester,
        {'np.appearance': ?look},
        online: true,
        clock: homeClock,
      );
      seedDay(services);
      await shot(tester, 'home-$name');
      await tester.drag(find.byType(ListView).first, const Offset(0, -640));
      await shot(tester, 'home-$name-2');
      await tester.drag(find.byType(ListView).first, const Offset(0, -640));
      await shot(tester, 'home-$name-3');
      await tester.pumpWidget(const SizedBox());
    });
    for (final (state, level) in [
      (NervousState.green, 0.22),
      (NervousState.red, 0.86),
    ]) {
      testWidgets('home-${state.id}-$name', (tester) async {
        final services = await boot(
          tester,
          {'np.appearance': ?look},
          online: true,
          clock: homeClock,
        );
        seedDay(services);
        services.day.recordCheckin(state, level);
        await shot(tester, 'home-${state.id}-$name');
        if (state == NervousState.red) {
          await tester.drag(find.byType(ListView).first, const Offset(0, -380));
          await shot(tester, 'home-red-$name-2');
        }
        await tester.pumpWidget(const SizedBox());
      });
    }

    // ---- the anchors sheet: the list, and the editor ----------------------
    testWidgets('anchors-$name', (tester) async {
      final services = await boot(
        tester,
        {'np.appearance': ?look},
        clock: homeClock,
      );
      seedDay(services);
      await tester.pumpAndSettle();
      final all = find.textContaining('All anchors');
      await tester.ensureVisible(all);
      await tester.pumpAndSettle();
      await tester.tap(all);
      await shot(tester, 'anchors-$name');
      await tester.tap(find.bySemanticsLabel('Edit Lunch break').last);
      await shot(tester, 'anchors-editor-$name');
      await tester.drag(find.byType(SingleChildScrollView).last, const Offset(0, -500));
      await shot(tester, 'anchors-editor-$name-2');
    });

    // ---- the calming steps --------------------------------------------------
    testWidgets('calm-$name', (tester) async {
      await boot(tester, {'np.appearance': ?look}, clock: homeClock);
      await tester.tap(find.byIcon(Icons.menu_rounded));
      await tester.pumpAndSettle();
      await shot(tester, 'drawer-home-$name');
      await tester.tap(find.text('Calming steps'));
      await shot(tester, 'calm-$name');
      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await shot(tester, 'calm-$name-2');
      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await shot(tester, 'calm-$name-3');
    });
  }

  testWidgets('calm-signed-out-signal', (tester) async {
    await boot(tester, {'np.appearance': signal}, client: FakeAccountsServer().client());
    final link = find.text('Need help right now? Calming steps');
    await tester.ensureVisible(link);
    await tester.pumpAndSettle();
    await shot(tester, 'sign-in-calm-link-signal');
    await tester.tap(link);
    await shot(tester, 'calm-signed-out-signal');
  });

  testWidgets('settings-day-sync-signal', (tester) async {
    await boot(tester, {'np.appearance': signal}, clock: homeClock);
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    // Settings builds its sections lazily: scroll until it exists.
    await tester.scrollUntilVisible(
      find.text('Keep my day in sync'),
      250,
      scrollable: find
          .descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable))
          .first,
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, -260));
    await shot(tester, 'settings-day-sync-signal');
  });

  // ---- 200 % text ------------------------------------------------------------
  for (final (name, look) in [('classic', null), ('signal', signal)]) {
    testWidgets('bigtext-home-$name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final services = await boot(
        tester,
        {'np.appearance': ?look},
        online: true,
        clock: homeClock,
      );
      seedDay(services);
      services.day.recordCheckin(NervousState.red, 0.86);
      await shot(tester, 'bigtext-home-$name');
      for (var i = 2; i <= 5; i++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -760));
        await shot(tester, 'bigtext-home-$name-$i');
      }
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('bigtext-anchors-$name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final services = await boot(tester, {'np.appearance': ?look}, clock: homeClock);
      seedDay(services);
      await tester.pumpAndSettle();
      final all = find.textContaining('All anchors');
      await tester.ensureVisible(all);
      await tester.pumpAndSettle();
      await tester.tap(all);
      await shot(tester, 'bigtext-anchors-$name');
      await tester.ensureVisible(find.bySemanticsLabel('Edit Lunch break').last);
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel('Edit Lunch break').last);
      await shot(tester, 'bigtext-anchors-editor-$name');
      await tester.drag(find.byType(SingleChildScrollView).last, const Offset(0, -700));
      await shot(tester, 'bigtext-anchors-editor-$name-2');
    });

    testWidgets('bigtext-calm-$name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await boot(tester, {'np.appearance': ?look}, clock: homeClock);
      await tester.tap(find.byIcon(Icons.menu_rounded));
      await tester.pumpAndSettle();
      await shot(tester, 'bigtext-drawer-$name');
      await tester.tap(find.text('Calming steps'));
      await shot(tester, 'bigtext-calm-$name');
      await tester.drag(find.byType(ListView).first, const Offset(0, -800));
      await shot(tester, 'bigtext-calm-$name-2');
    });
  }


  // ---- Pal, the assistant -------------------------------------------------------
  for (final (name, look) in [('classic', null), ('signal', signal)]) {
    testWidgets('pal-$name', (tester) async {
      final services = await boot(
        tester,
        {'np.appearance': ?look, PalController.chatKey: palChat},
        client: palBackend(),
        clock: homeClock,
      );
      seedDay(services);
      services.pal
        ..addDump('Ask Milena about the SPAD dead time')
        ..addDump('Buy oat milk');
      await tester.pumpAndSettle();
      // Home: the bubble in its corner, the last tile clear of it.
      await tester.drag(find.byType(ListView).first, const Offset(0, -3000));
      await shot(tester, 'pal-home-bottom-$name');

      await tester.tap(find.byType(PalBubble));
      await shot(tester, 'pal-sheet-$name');
      for (final tool in ['What now?', 'Brain dump']) {
        await tester.tap(find.text(tool));
        await shot(tester, 'pal-${tool == 'What now?' ? 'now' : 'dump'}-$name');
        await tester.tap(find.text('All tools'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Break it down'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'write the intro of my thesis');
      await tester.tap(find.widgetWithText(NpButton, 'Break it down'));
      await shot(tester, 'pal-breakdown-$name');
      await tester.enterText(find.byType(TextField).first, 'I want to  end it all');
      await tester.tap(find.widgetWithText(NpButton, 'Break it down'));
      await shot(tester, 'pal-crisis-breakdown-$name');
      await tester.tap(find.text('All tools'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Talk'));
      await shot(tester, 'pal-talk-$name');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('pal-sit-$name', (tester) async {
      // A clock that can move: the halfway question comes by itself.
      var now = homeClock();
      final services = await boot(tester, {'np.appearance': ?look}, clock: () => now);
      seedDay(services);
      services.pal.startSit(minutes: 25, label: 'CPI paper, one section', taskId: 'mvd-1');
      await tester.pumpAndSettle();
      // Home while sitting: the pill and the Focus tile.
      await shot(tester, 'pal-sit-home-$name');
      await tester.tap(find.byType(PalBubble));
      await shot(tester, 'pal-sit-$name');
      now = now.add(const Duration(minutes: 13));
      services.pal.tick();
      expect(services.pal.sit?.checkIn, SitCheck.asked);
      await shot(tester, 'pal-sit-check-$name');
      services.pal.forgetSession();
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('upload-$name', (tester) async {
      final server = FakeUploadServer(routes: {'GET /api/documents': (_) => jsonResponse(uploadLibrary)});
      final picker = FakeDocumentPicker();
      await boot(
        tester,
        {'np.appearance': ?look},
        client: server.client(),
        wrap: (app) => Provider<DocumentPicker>.value(value: picker, child: app),
      );
      await goLibrary(tester);
      await startUploads(tester, server, picker);
      await shot(tester, 'upload-$name');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('settings-pal-$name', (tester) async {
      await boot(tester, {'np.appearance': ?look});
      await tester.tap(find.byIcon(Icons.menu_rounded));
      await tester.pumpAndSettle();
      await shot(tester, 'drawer-pal-$name');
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Show Pal’s bubble'),
        250,
        scrollable: find
            .descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable))
            .first,
      );
      await tester.drag(find.byType(ListView).first, const Offset(0, -200));
      await shot(tester, 'settings-pal-$name');
    });

    // ---- 200 % text ----
    testWidgets('bigtext-pal-$name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final services = await boot(
        tester,
        {'np.appearance': ?look, PalController.chatKey: palChat},
        client: palBackend(),
        clock: homeClock,
      );
      seedDay(services);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView).first, const Offset(0, -6000));
      await shot(tester, 'bigtext-pal-home-bottom-$name');
      await tester.tap(find.byType(PalBubble));
      await shot(tester, 'bigtext-pal-sheet-$name');
      await tester.tap(find.text('What now?'));
      await shot(tester, 'bigtext-pal-now-$name');
      await tester.tap(find.text('All tools'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Talk'));
      await shot(tester, 'bigtext-pal-talk-$name');
      await tester.drag(
        find.descendant(of: find.byType(PalSheet), matching: find.byType(SingleChildScrollView)),
        const Offset(0, 900),
      );
      await shot(tester, 'bigtext-pal-talk-$name-2');
      await tester.tap(find.text('All tools'));
      await tester.pumpAndSettle();
      services.pal.startSit(minutes: 10, label: 'Thesis intro');
      await tester.tap(find.text('Sit with me'));
      await shot(tester, 'bigtext-pal-sit-$name');
      services.pal.forgetSession();
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('bigtext-upload-$name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final server = FakeUploadServer(routes: {'GET /api/documents': (_) => jsonResponse(uploadLibrary)});
      final picker = FakeDocumentPicker();
      await boot(
        tester,
        {'np.appearance': ?look},
        client: server.client(),
        wrap: (app) => Provider<DocumentPicker>.value(value: picker, child: app),
      );
      await goLibrary(tester);
      await startUploads(tester, server, picker);
      await shot(tester, 'bigtext-upload-$name');
      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await shot(tester, 'bigtext-upload-$name-2');
      await tester.pumpWidget(const SizedBox());
    });
  }
}

/// A few saved Talk messages, the last one Pal's careful reply to a
/// message that sounded like a crisis (answered on the phone).
final String palChat = jsonEncode([
  {'id': 'm-1', 'role': 'user', 'text': 'I can’t start the CPI paper.', 'at': '2026-11-19T10:01:00.000Z'},
  {
    'id': 'm-2',
    'role': 'pal',
    'text': 'That’s a big one. Want to break it into three small steps, starting with opening the file?',
    'at': '2026-11-19T10:01:05.000Z',
  },
  {'id': 'm-3', 'role': 'user', 'text': 'honestly I can’t go on like this', 'at': '2026-11-19T10:02:00.000Z'},
  {'id': 'm-4', 'role': 'pal', 'text': kCrisisReply, 'at': '2026-11-19T10:02:00.000Z', 'crisis': true, 'local': true},
]);

/// A server whose AI answers Break it down (Talk's replies are seeded).
http.Client palBackend() => fakeBackend(
  routes: {
    'GET /api/documents': (_) => jsonResponse([]),
    'POST /api/pal/breakdown': (_) => jsonResponse({
      'steps': [
        'Open the thesis document',
        'Write one messy sentence about the method',
        'List three points the intro must make',
        'Write the first point, badly is fine',
        'Take a two-minute break',
      ],
    }),
  },
);

final List<Map<String, Object?>> uploadLibrary = [
  {
    '_id': 'a',
    'title': 'Correlation plenoptic imaging with entangled photons',
    'type': 'pdf',
    'status': 'ready',
    'readingProgress': 0.38,
    'pageCount': 12,
  },
];

/// One file the server can't read (its row says why), then one going up,
/// held at about 40 %.
Future<void> startUploads(WidgetTester tester, FakeUploadServer server, FakeDocumentPicker picker) async {
  picker.next = fakePicked('lab-photo.heic', 2 * 1024 * 1024);
  await tester.tap(find.text('Add a document'));
  await tester.pumpAndSettle();
  picker.next = fakePicked('Quantum optics lecture notes (week 7).pdf', 12 * 1024 * 1024);
  server.pauseAfter = 5 * 1024 * 1024;
  await tester.tap(find.text('Add a document'));
  for (var i = 0; i < 400 && !server.paused.isCompleted; i++) {
    await tester.pump(const Duration(milliseconds: 5));
  }
  await tester.pump();
}
