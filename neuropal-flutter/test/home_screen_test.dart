// Home end to end: the real app with an in-memory backend and a fixed
// clock (Thursday 19 November, 10:00). Reduce-motion is on. The check-in
// slider must work for a screen reader (its steps commit a check-in), by
// tap, and with the state buttons; the minimum day ticks and removes with
// Undo; anchors are added, edited, deleted and brought back.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/calm/calm_screen.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/home/anchors_sheet.dart';
import 'package:neuropal/home/check_in_slider.dart';
import 'package:neuropal/home/home_screen.dart';
import 'package:neuropal/home/pal_tile.dart';
import 'package:neuropal/library/library_screen.dart';
import 'package:neuropal/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const signalLook =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';

DateTime clock = DateTime(2026, 11, 19, 10, 0);

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
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: client ?? offlineBackend(),
    clock: () => clock,
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

/// Scrolls [target] into view (Home's tiles are all built at once, so
/// scrollUntilVisible would not move).
Future<void> scrollTo(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
}

/// [f] inside the anchors sheet (Home stays on screen under it).
Finder inSheet(Finder f) => find.descendant(of: find.byType(AnchorsSheet), matching: f);

/// Taps the editor's Save (the sheet scrolls).
Future<void> save(WidgetTester tester) async {
  await scrollTo(tester, find.text('Save'));
  await tester.tap(find.text('Save'));
  await tester.pumpAndSettle();
}

double topOf(WidgetTester tester, String text) => tester.getTopLeft(find.text(text)).dy;

const sliderLabel = 'How are you feeling, 0 to 100';

void main() {
  setUp(() => clock = DateTime(2026, 11, 19, 10, 0));

  testWidgets('Home is the first screen; Back from the Library leads Home', (
    tester,
  ) async {
    await boot(tester);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Hello'), findsOneWidget);
    expect(find.text('One step at a time today.'), findsOneWidget);
    // Classic keeps its original Home: check-in, minimum day, anchor, reading.
    expect(
      topOf(tester, 'HOW ARE YOU FEELING RIGHT NOW?'),
      lessThan(topOf(tester, 'MINIMUM VIABLE DAY')),
    );
    await scrollTo(tester, find.text('RESUME READING'));
    expect(topOf(tester, 'NEXT ANCHOR'), lessThan(topOf(tester, 'RESUME READING')));
    expect(find.textContaining('Pal: '), findsNothing, reason: 'hidden in Classic');

    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Library'));
    await tester.pumpAndSettle();
    expect(find.byType(LibraryScreen), findsOneWidget);
    await tester.binding.handlePopRoute(); // Android's Back
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(LibraryScreen), findsNothing);
  });

  testWidgets('Signal: the date, a full stop, its own layout and Pal’s note', (
    tester,
  ) async {
    await boot(tester, prefs: {'np.appearance': signalLook});
    expect(find.text('THU · 19 NOV'), findsOneWidget);
    expect(find.text('Hello.'), findsOneWidget);
    expect(
      topOf(tester, 'HOW ARE YOU FEELING RIGHT NOW?'),
      lessThan(topOf(tester, 'NEXT ANCHOR')),
    );
    await scrollTo(tester, find.byType(PalTile));
    // Nothing checked in, a task open: two minutes on it, in Pal's style.
    expect(
      find.text('Pal: No rush. Want to try two minutes on “Stay hydrated”?'),
      findsOneWidget,
    );
    expect(find.text('FOCUS'), findsOneWidget, reason: 'the Focus tile opens Pal’s Sit with me');
    expect(tester.takeException(), isNull);
  });

  testWidgets('the slider: screen-reader steps commit a check-in a second later', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final services = await boot(tester);
    final slider = find.semantics.byLabel(sliderLabel);
    expect(
      tester.getSemantics(find.bySemanticsLabel(sliderLabel)),
      isSemantics(
        isSlider: true,
        value: 'Not checked in yet',
        hasIncreaseAction: true,
        hasDecreaseAction: true,
      ),
    );

    tester.semantics.increase(slider);
    await tester.pump();
    tester.semantics.increase(slider);
    await tester.pump();
    expect(tester.getSemantics(find.bySemanticsLabel(sliderLabel)).value, 'Bit off, 60');
    expect(services.day.state, isNull, reason: 'saves a second after the last step');

    await tester.pump(kStepSave);
    expect(services.day.state, NervousState.yellow);
    expect(services.day.level, 0.6);
    expect(services.day.checkins, hasLength(1));
    expect(find.text('A gentler day. Two minutes on something counts.'), findsOneWidget);

    // Steps past the edge into Overwhelmed (no page opens by itself).
    for (var i = 0; i < 2; i++) {
      tester.semantics.increase(slider);
      await tester.pump();
    }
    await tester.pump(kStepSave);
    expect(services.day.state, NervousState.red);
    expect(find.byType(CalmScreen), findsNothing);
    expect(find.text('Open the calming steps'), findsOneWidget);

    // A screen reader's double tap says where it is; it saves nothing.
    tester.semantics.tap(slider);
    await tester.pump();
    expect(services.day.checkins, hasLength(1));
    semantics.dispose();
  });

  testWidgets('the slider by tap, the state buttons, and the way to the calming steps', (
    tester,
  ) async {
    final services = await boot(tester);
    final track = find.byType(CheckInSlider);
    final box = tester.getRect(track);
    // Tap near the right end of the track: Overwhelmed.
    await tester.tapAt(Offset(box.right - 20, box.top + box.height * 0.7));
    await tester.pump();
    expect(services.day.state, NervousState.red);
    expect(services.day.level, greaterThan(0.9));
    expect(
      find.text('Everything else can wait. The calming steps are one tap away.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Open the calming steps'));
    await tester.pumpAndSettle();
    expect(find.byType(CalmScreen), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    // A button: one tap, the knob goes to that region's middle.
    clock = clock.add(const Duration(minutes: 5));
    await tester.tap(find.text('I feel okay'));
    await tester.pump();
    expect(services.day.state, NervousState.green);
    expect(services.day.level, NervousState.green.middle);
    expect(services.day.checkins, hasLength(2));
    expect(find.text('Open the calming steps'), findsNothing);
    expect(find.text('Last check-in: Okay at 10:05 AM'), findsOneWidget);
  });

  testWidgets('the minimum day: tick a task; remove one and Undo', (tester) async {
    final semantics = tester.ensureSemantics();
    final services = await boot(tester);
    await scrollTo(tester, find.text('Stay hydrated'));
    expect(find.text('3 LEFT'), findsOneWidget);

    await tester.tap(find.text('Stay hydrated'));
    await tester.pump();
    expect(services.day.isTaskDone(services.day.tasks.first), isTrue);
    expect(find.text('2 LEFT'), findsOneWidget);
    expect(
      tester.getSemantics(find.text('Stay hydrated')),
      isSemantics(hasCheckedState: true, isChecked: true, label: 'Stay hydrated, 2 glasses left'),
    );

    await tester.tap(find.bySemanticsLabel('Edit tasks'));
    await tester.pump();
    await tester.tap(find.bySemanticsLabel('Remove Walk'));
    await tester.pump();
    expect(services.day.tasks.map((t) => t.title), isNot(contains('Walk')));
    expect(find.text('Removed “Walk”.'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pump();
    expect(services.day.tasks.map((t) => t.title), contains('Walk'));
    expect(find.text('“Walk” is back.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'New task for today'), 'Email the lab');
    await tester.pump();
    await tester.tap(find.bySemanticsLabel('Add task'));
    await tester.pump();
    expect(services.day.tasks.last.title, 'Email the lab');
    semantics.dispose();
  });

  testWidgets('anchors: add, edit (time by screen reader), delete and Undo', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final services = await boot(tester);
    await scrollTo(tester, find.text('Add anchor'));
    expect(find.text('Nothing set yet'), findsOneWidget);
    await tester.tap(find.text('Add anchor'));
    await tester.pumpAndSettle();

    // The editor opens straight away, at the next full hour.
    expect(find.text('NEW ANCHOR'), findsOneWidget);
    expect(find.text('At 11:00 AM'), findsOneWidget);
    await save(tester);
    expect(find.text('Give the anchor a name.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Morning meds');
    await scrollTo(tester, find.bySemanticsLabel('Kind: Meds'));
    await tester.tap(find.bySemanticsLabel('Kind: Meds'));
    await tester.tap(find.bySemanticsLabel('Window: Plus or minus 15 minutes'));
    await save(tester);
    expect(find.text('Saved “Morning meds” at 11:00 AM.'), findsOneWidget);
    var a = services.day.anchors.single;
    expect(a.flexMinutes, 15);
    expect(a.category, AnchorCategory.medication);

    // Edit: the hour by a screen reader's swipe, the minute with + .
    await tester.tap(inSheet(find.bySemanticsLabel('Edit Morning meds')));
    await tester.pumpAndSettle();
    tester.semantics.increase(find.semantics.byLabel('Hour'));
    await tester.pump();
    await scrollTo(tester, find.bySemanticsLabel('5 minutes later'));
    await tester.tap(find.bySemanticsLabel('5 minutes later'));
    await tester.pump();
    expect(find.text('At 12:05 PM'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Lunch meds');
    await save(tester);
    a = services.day.anchors.single;
    expect((a.title, a.hour, a.minute), ('Lunch meds', 12, 5));

    await tester.tap(inSheet(find.bySemanticsLabel('Delete Lunch meds')));
    await tester.pump();
    expect(services.day.anchors, isEmpty);
    expect(find.text('Deleted “Lunch meds”.'), findsOneWidget);
    await tester.tap(inSheet(find.text('Undo')));
    await tester.pump();
    expect(services.day.anchors.single.title, 'Lunch meds');
    expect(find.text('“Lunch meds” is back.'), findsOneWidget);

    // Closed: the tile counts down to it, with its window.
    await tester.tap(find.bySemanticsLabel('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Lunch meds at 12:05 PM'), findsOneWidget);
    expect(find.text('In about 2 hours · window ± 15 min'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Done with Lunch meds'));
    await tester.pump();
    expect(find.text('Nothing else today'), findsOneWidget);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
