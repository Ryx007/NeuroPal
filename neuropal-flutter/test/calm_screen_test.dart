// The calming steps: they open from Sign-in with no session and no
// network, and from the drawer; one step at a time; "I’m OK for now" goes
// back; the help-line numbers can be copied. Nothing is sent anywhere.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/auth/sign_in_screen.dart';
import 'package:neuropal/calm/calm_screen.dart';
import 'package:neuropal/home/home_screen.dart';
import 'package:neuropal/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

Future<AppServices> boot(WidgetTester tester, {required http.Client client}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: client,
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

/// Scrolls [target] into view and taps it.
Future<void> tapVisible(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the calming steps open from Sign-in: no session, nothing sent', (
    tester,
  ) async {
    final server = FakeAccountsServer();
    await boot(tester, client: server.client());
    expect(find.byType(SignInScreen), findsOneWidget);
    final calmLink = find.text('Need help right now? Calming steps');
    await tester.ensureVisible(calmLink);
    await tester.pumpAndSettle();
    final before = server.requests.length;

    await tester.tap(calmLink);
    await tester.pumpAndSettle();
    expect(find.byType(CalmScreen), findsOneWidget);
    // No drawer without a session (it would lead past sign-in): Back.
    expect(find.byIcon(Icons.menu_rounded), findsNothing);
    expect(find.bySemanticsLabel('Back to sign-in'), findsOneWidget);

    // One step at a time, T-I-P-P.
    expect(find.text('Temperature'), findsOneWidget);
    expect(find.text('STEP 1 OF 4'), findsOneWidget);
    expect(find.textContaining('heart condition'), findsOneWidget);
    // The first step and its Next button fit without scrolling.
    final next = tester.getRect(find.text('Next step'));
    expect(next.bottom, lessThan(915));
    for (final title in ['Intense movement', 'Paced breathing', 'Paired relaxation']) {
      await tapVisible(tester, find.text('Next step'));
      expect(find.text(title), findsOneWidget);
    }
    expect(find.textContaining('heart condition'), findsNothing);
    await tapVisible(tester, find.text('Back'));
    expect(find.text('Paced breathing'), findsOneWidget);

    // The counted breathing guide is there even with motion off.
    expect(find.text('Breathe with me'), findsOneWidget);
    expect(find.text('Start breathing'), findsNothing, reason: 'Still: nothing moves');
    expect(find.textContaining('1 · 2 · 3 · 4 · 5 · 6'), findsOneWidget);

    await tester.ensureVisible(find.text('112'));
    await tester.pumpAndSettle();
    expect(find.text('Emergency, in Italy and across the EU'), findsOneWidget);
    expect(find.text('02 2327 2327'), findsOneWidget);
    expect(server.requests.length, before, reason: 'nothing is sent anywhere');

    await tester.tap(find.bySemanticsLabel('Back to sign-in'));
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);
  });

  testWidgets('from the drawer: copy a help line; I’m OK for now goes back Home', (
    tester,
  ) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await boot(tester, client: offlineBackend());
    expect(find.byType(HomeScreen), findsOneWidget);
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Calming steps'));
    await tester.pumpAndSettle();
    expect(find.byType(CalmScreen), findsOneWidget);
    expect(find.byIcon(Icons.menu_rounded), findsOneWidget, reason: 'signed in: the drawer');

    await tapVisible(tester, find.bySemanticsLabel('Copy the number 02 2327 2327'));
    expect(copied, '+390223272327');
    expect(
      find.text('02 2327 2327 copied. Paste it in your phone app to call.'),
      findsOneWidget,
    );

    await tapVisible(tester, find.text('I’m OK for now'));
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(CalmScreen), findsNothing);
  });
}
