// The drawer reaches every entry, "Calming steps" above all, however the
// phone is held and however large the text. Six entries, the header and the
// connection line don't fit a phone held sideways, so the drawer scrolls;
// when everything fits, the connection line still sits at the bottom.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/app.dart';
import 'package:neuropal/calm/calm_screen.dart';
import 'package:neuropal/calm/help_lines.dart';
import 'package:neuropal/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const signalLook =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';

Future<void> openDrawer(
  WidgetTester tester, {
  required Size size,
  required double textScale,
  String? look,
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({'np.appearance': ?look});
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: fakeBackend(
      routes: {'GET /api/documents': (_) => jsonResponse([])},
    ),
    clock: () => DateTime(2026, 11, 19, 10, 0),
  );
  await tester.pumpWidget(
    Provider<PhoneDialer>.value(
      value: FakePhoneDialer(),
      child: NeuroPalApp(services: services),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.bySemanticsLabel('Open navigation').first);
  await tester.pumpAndSettle();
}

Finder inDrawer(Finder f) =>
    find.descendant(of: find.byType(Drawer), matching: f);

void main() {
  for (final (skin, look) in [('Classic', null), ('Signal', signalLook)]) {
    for (final (label, size, scale) in [
      ('a phone held sideways, 200 % text', const Size(891, 412), 2.0),
      ('a phone held sideways, 100 % text', const Size(891, 412), 1.0),
      ('a small phone, 200 % text', const Size(360, 640), 2.0),
    ]) {
      testWidgets('$skin drawer, $label: "Calming steps" opens', (
        tester,
      ) async {
        await openDrawer(tester, size: size, textScale: scale, look: look);
        expect(tester.takeException(), isNull, reason: 'no overflow');
        final calm = inDrawer(find.text('Calming steps'));
        await tester.scrollUntilVisible(
          calm,
          80,
          scrollable: inDrawer(find.byType(Scrollable)).first,
        );
        await tester.pumpAndSettle();
        final rect = tester.getRect(calm);
        expect(rect.bottom, lessThanOrEqualTo(size.height));
        await tester.tapAt(rect.center);
        await tester.pumpAndSettle();
        expect(find.byType(CalmScreen), findsOneWidget);
      });
    }

    testWidgets('$skin drawer, upright at 100 %: nothing scrolls and the '
        'connection line sits at the bottom', (tester) async {
      const size = Size(412, 891);
      await openDrawer(tester, size: size, textScale: 1.0, look: look);
      final scrollable = tester.state<ScrollableState>(
        inDrawer(find.byType(Scrollable)).first,
      );
      expect(scrollable.position.maxScrollExtent, 0);
      final line = inDrawer(
        find.textContaining(
          RegExp(r'Backend offline|Connected|Checking|Demo library'),
        ),
      );
      expect(line, findsOneWidget);
      expect(tester.getRect(line).bottom, greaterThan(size.height - 80));
      expect(inDrawer(find.text('Settings')), findsOneWidget);
    });
  }
}
