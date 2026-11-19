// Pal end to end, the way a screen-reader user works it: every step here is
// a semantics action (tap, set text) on the real app with an in-memory
// backend and a fixed clock — no pointer taps. The bubble opens the sheet;
// each of the five tools works; a crisis message in Talk and in Break it
// down sends NO request (checked on the fake client) and shows the careful
// reply, the help lines and the way to the calming steps; Sit with me keeps
// going when the sheet closes (the bubble's pill and Home's Focus tile show
// it); the bubble hides from the sheet and comes back from Settings.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/calm/calm_screen.dart';
import 'package:neuropal/calm/help_lines.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/pal/crisis.dart';
import 'package:neuropal/pal/pal_avatar.dart';
import 'package:neuropal/pal/pal_bits.dart';
import 'package:neuropal/pal/pal_bubble.dart';
import 'package:neuropal/pal/pal_controller.dart';
import 'package:neuropal/pal/pal_models.dart';
import 'package:neuropal/pal/pal_sheet.dart';
import 'package:neuropal/services.dart';
import 'package:neuropal/theme/tokens.g.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const signalLook =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';

DateTime clock = DateTime(2026, 11, 19, 10, 0);
final gentle = kPalLines['Gentle']!;

class Rig {
  Rig(this.services, this.requests, this.dialer);

  final AppServices services;
  final List<http.Request> requests;
  final FakePhoneDialer dialer;

  List<http.Request> get pal => [
    for (final r in requests)
      if (r.url.path.startsWith('/api/pal/')) r,
  ];
}

Future<Rig> boot(
  WidgetTester tester, {
  Map<String, Object> prefs = const {},
  Map<String, Handler> routes = const {},
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(prefs);
  final requests = <http.Request>[];
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: fakeBackend(
      routes: {'GET /api/documents': (_) => jsonResponse([]), ...routes},
      requests: requests,
    ),
    clock: () => clock,
  );
  final dialer = FakePhoneDialer();
  await tester.pumpWidget(
    Provider<PhoneDialer>.value(value: dialer, child: NeuroPalApp(services: services)),
  );
  await tester.pumpAndSettle();
  return Rig(services, requests, dialer);
}

/// A semantics node by its whole label, or by a pattern.
SemanticsFinder node(Pattern label) => find.semantics.byLabel(label);

/// The one node with this label that can be tapped (a heading and a
/// button may share their words).
SemanticsFinder tappable(Pattern label) => find.semantics.byPredicate(
  (n) =>
      n.getSemanticsData().hasAction(SemanticsAction.tap) &&
      (label is String ? n.label == label : (label as RegExp).hasMatch(n.label)),
  describeMatch: (_) => 'tappable "$label"',
);

/// Taps a node the way TalkBack's double tap does.
Future<void> press(WidgetTester tester, Pattern label) async {
  tester.semantics.tap(tappable(label));
  await tester.pumpAndSettle();
}

/// Types into a text field the way a screen reader does: focus, then set.
Future<void> type(WidgetTester tester, Pattern field, String text) async {
  tester.semantics.tap(tappable(field));
  await tester.pumpAndSettle();
  tester.semantics.setText(node(field), text);
  await tester.pumpAndSettle();
}

Future<void> openPal(WidgetTester tester) => press(tester, 'Open Pal, your assistant');

Future<void> openTool(WidgetTester tester, String title) => press(tester, RegExp('^${RegExp.escape(title)}, '));

bool exists(Pattern label) => find.semantics.byLabel(label).evaluate().isNotEmpty;

void main() {
  setUp(() => clock = DateTime(2026, 11, 19, 10, 0));

  testWidgets('the bubble on Home opens Pal: a greeting and the five tools', (tester) async {
    final semantics = tester.ensureSemantics();
    await boot(tester);
    expect(find.byType(PalBubble), findsOneWidget);
    await openPal(tester);
    expect(find.byType(PalSheet), findsOneWidget);
    expect(find.text(gentle['helloUnset']!), findsOneWidget);
    for (final title in ['What now?', 'Break it down', 'Brain dump', 'Sit with me', 'Talk']) {
      expect(exists(RegExp('^${RegExp.escape(title)}, ')), isTrue, reason: title);
    }
    expect(exists('Talk, A short chat with Pal'), isTrue);
    await press(tester, 'Close');
    expect(find.byType(PalSheet), findsNothing);
    semantics.dispose();
  });

  testWidgets('What now?: check in from the sheet, then Do it starts a sit', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    await openPal(tester);
    await openTool(tester, 'What now?');
    expect(find.text('You haven’t checked in. How are you right now?'), findsOneWidget);
    await press(tester, 'Feeling a bit off');
    expect(rig.services.day.state, NervousState.yellow);
    final line = kPalTalk['Gentle']!.replaceFirst('{task}', '“Stay hydrated”');
    expect(find.text(line), findsOneWidget);
    expect(find.text('You haven’t checked in. How are you right now?'), findsNothing);

    await press(tester, 'Something else');
    expect(find.text(kPalTalk['Gentle']!.replaceFirst('{task}', '“Take meds”')), findsOneWidget);

    await press(tester, 'Do it: start 10 minutes with Pal');
    final sit = rig.services.pal.sit!;
    expect((sit.minutes, sit.label, sit.taskId), (10, 'Take meds', 'mvd-2'));
    expect(exists('Pal is sitting with you. 10 min left.'), isTrue, reason: 'the sit tool is open');
    // "All tools" leads back to the list.
    await press(tester, 'Back to all of Pal’s tools');
    expect(exists(RegExp('^Sit with me, Sitting with you · 10 min left')), isTrue);
    await openTool(tester, 'Sit with me');
    // Close closes the sheet from a tool too; it opens again on the sit.
    await press(tester, 'Close');
    expect(find.byType(PalSheet), findsNothing);
    await openPalFromPill(tester);
    expect(exists('Pal is sitting with you. 10 min left.'), isTrue, reason: 'opens on the sit');
    // So does Android's Back.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(PalSheet), findsNothing);
    endSit(rig);
    semantics.dispose();
  });

  testWidgets('Break it down: the server’s steps, one onto the minimum day, step 1 with Pal', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(
      tester,
      routes: {
        'POST /api/pal/breakdown': (_) => jsonResponse({
          'steps': ['Open the file', 'Write one line', 'Save it'],
        }),
      },
    );
    await openPal(tester);
    await openTool(tester, 'Break it down');
    await press(tester, 'Break it down');
    expect(find.text('Type the task first. Anything goes, big or small.'), findsOneWidget);
    expect(rig.pal, isEmpty);

    await type(tester, RegExp('^The task'), 'write the intro of my thesis');
    await press(tester, 'Break it down');
    expect(jsonDecode(rig.pal.single.body), {'task': 'write the intro of my thesis'});
    expect(find.text('3 small steps'), findsOneWidget);
    expect(find.text('0 of 3 done'), findsOneWidget);

    await press(tester, 'Step 1: Open the file');
    expect(find.text('1 of 3 done'), findsOneWidget);
    expect(
      tester.getSemantics(find.text('Open the file')),
      isSemantics(label: 'Step 1: Open the file', hasCheckedState: true, isChecked: true),
    );

    await press(tester, 'Add “Write one line” to your minimum day');
    expect(rig.services.day.tasks.last.title, 'Write one line');
    expect(exists('“Write one line” is on your minimum day'), isTrue);

    await press(tester, 'Do step 1 with me: Open the file, for 10 minutes');
    expect(rig.services.pal.sit!.label, 'Open the file');
    expect(exists('Pal is sitting with you. 10 min left.'), isTrue);
    endSit(rig);
    semantics.dispose();
  });

  testWidgets('Break it down: a crisis-sounding task sends nothing; the careful reply and the calming steps', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(
      tester,
      routes: {'POST /api/pal/breakdown': (_) => jsonResponse({'steps': ['a', 'b', 'c']})},
    );
    await openPal(tester);
    await openTool(tester, 'Break it down');
    await type(tester, RegExp('^The task'), 'I want to  end\tmy life');
    expect(tester.testTextInput.isVisible, isTrue);
    await press(tester, 'Break it down');
    expect(rig.pal, isEmpty, reason: 'NO request reached the server');
    expect(tester.testTextInput.isVisible, isFalse, reason: 'the keyboard goes down for the reply');
    expect(find.text(kCrisisReply), findsOneWidget);
    expect(find.textContaining('small steps'), findsNothing, reason: 'never a to-do list');
    expect(exists('Call 112, Emergency, in Italy and across the EU'), isTrue);

    await press(tester, 'Open the calming steps');
    expect(find.byType(CalmScreen), findsOneWidget);
    expect(find.byType(PalSheet), findsNothing);
    expect(rig.pal, isEmpty);
    semantics.dispose();
  });

  testWidgets('Talk: a reply from the server; a crisis message sends nothing and can call for help', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(
      tester,
      routes: {'POST /api/pal/chat': (_) => jsonResponse({'reply': 'Two minutes on it, then a break.', 'crisis': false})},
    );
    await openPal(tester);
    await openTool(tester, 'Talk');
    expect(find.text('No messages yet.'), findsOneWidget);
    await type(tester, RegExp('^Message to Pal'), 'I can’t start my thesis');
    await press(tester, 'Send');
    expect(rig.pal, hasLength(1));
    final body = jsonDecode(rig.pal.single.body) as Map;
    expect(body['message'], 'I can’t start my thesis');
    expect((body['context'] as Map)['palName'], 'Pal');
    expect(exists('You: I can’t start my thesis'), isTrue);
    expect(exists('Pal: Two minutes on it, then a break.'), isTrue);

    await type(tester, RegExp('^Message to Pal'), 'kill\tmyself');
    await press(tester, 'Send');
    expect(rig.pal, hasLength(1), reason: 'the crisis message sent NO request');
    expect(exists('Pal: $kCrisisReply'), isTrue);
    expect(exists('Open the calming steps'), isTrue);

    await press(tester, 'Call 112, Emergency, in Italy and across the EU');
    expect(rig.dialer.dialled, ['112']);
    rig.dialer.canCall = false;
    await press(tester, 'Call 02 2327 2327, Telefono Amico Italia, someone to talk to');
    expect(rig.dialer.dialled, ['112', '+390223272327']);
    expect(
      find.text('This device can’t start a call. Dial 02 2327 2327 on a phone, or copy the number.'),
      findsOneWidget,
    );

    await press(tester, 'Open the calming steps');
    expect(find.byType(CalmScreen), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('Talk on a short phone, 200% text, keyboard up, overwhelmed: the field stays on screen', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    tester.view.physicalSize = const Size(412 * 3, 640 * 3);
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    rig.services.day.recordCheckin(NervousState.red, 0.9);
    await tester.pumpAndSettle();
    await openPal(tester);
    await openTool(tester, 'Talk');
    final face = find.descendant(of: find.byType(PalSheet), matching: find.byType(PalAvatar));
    expect(face, findsOneWidget);

    // The keyboard takes 300 of the 640 points.
    tester.view.viewInsets = const FakeViewPadding(bottom: 300 * 3);
    await type(tester, RegExp('^Message to Pal'), 'I want to  end\tmy life');
    final field = tester.getRect(find.descendant(of: find.byType(PalSheet), matching: find.byType(TextField)));
    expect(field.top, greaterThanOrEqualTo(0));
    expect(field.bottom, lessThanOrEqualTo(340), reason: 'the field is above the keyboard');
    expect(face, findsNothing, reason: 'Pal’s face gives way to the field');
    expect(exists('Open the calming steps'), isTrue, reason: 'the calming line is still there');

    await press(tester, 'Send');
    expect(rig.pal, isEmpty, reason: 'the crisis message sent NO request');
    expect(tester.testTextInput.isVisible, isFalse, reason: 'the keyboard goes down for the reply');
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    // The careful reply's help (the calming steps, then people to call)
    // starts at the top of the chat: big text never leaves only the chat's
    // last lines in view.
    final list = tester.getRect(
      find.descendant(of: find.byType(PalSheet), matching: find.byType(SingleChildScrollView)),
    );
    final help = tester.getRect(find.byType(PalCrisisReply));
    expect(help.top, moreOrLessEquals(list.top, epsilon: 1));
    expect(exists('Open the calming steps'), isTrue);
    expect(find.text('112'), findsOneWidget);
    expect(face, findsOneWidget, reason: 'with the keyboard down there is room again');
    semantics.dispose();
  });

  testWidgets('Talk shows the last 10 of the 30 kept; Clear chat deletes the server’s copy too', (tester) async {
    final semantics = tester.ensureSemantics();
    final saved = [
      for (var i = 1; i <= 30; i++)
        {'id': 'm-$i', 'role': i.isOdd ? 'user' : 'pal', 'text': 'Message $i', 'at': '2026-11-19T09:00:00.000Z'},
    ];
    final rig = await boot(
      tester,
      prefs: {PalController.chatKey: jsonEncode(saved)},
      routes: {'DELETE /api/pal/chat': (_) => jsonResponse({'deleted': 30})},
    );
    expect(rig.services.pal.chat, hasLength(30));
    await openPal(tester);
    await openTool(tester, 'Talk');
    final shown = find.semantics.byLabel(RegExp(r'^(You|Pal): Message \d+$')).evaluate().length;
    expect(shown, 10);
    expect(exists('Pal: Message 30'), isTrue);
    expect(exists('You: Message 21'), isTrue);
    expect(exists('Pal: Message 20'), isFalse);

    await press(tester, 'Clear your chat with Pal');
    expect(find.text('Clear the whole chat?'), findsOneWidget);
    await press(tester, 'Yes, clear it');
    expect(rig.pal.single.method, 'DELETE');
    expect(find.text('Cleared here and on your server.'), findsOneWidget);
    expect(rig.services.pal.chat, isEmpty);
    semantics.dispose();
  });

  testWidgets('Brain dump: save, delete and Undo, move a line to the minimum day', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    await openPal(tester);
    await openTool(tester, 'Brain dump');
    expect(find.text(gentle['dumpEmpty']!), findsOneWidget);
    await type(tester, RegExp('^A thought, a worry, a to-do'), 'buy more coffee');
    await press(tester, 'Save to the brain dump');
    expect(find.text('Saved.'), findsOneWidget);
    expect(find.text('buy more coffee'), findsOneWidget);

    await press(tester, 'Delete “buy more coffee”');
    expect(find.text('Deleted.'), findsOneWidget);
    expect(rig.services.pal.dump, isEmpty);
    await press(tester, 'Undo');
    expect(find.text('Back in the dump.'), findsOneWidget);
    expect(rig.services.pal.dump.single.text, 'buy more coffee');

    await press(tester, 'Minimum day: add “buy more coffee”');
    expect(rig.services.day.tasks.last.title, 'buy more coffee');
    expect(rig.services.pal.dump, isEmpty);
    expect(find.text('Added “buy more coffee” to your minimum day.'), findsOneWidget);
    expect(rig.requests.where((r) => r.url.path.contains('dump')), isEmpty);
    semantics.dispose();
  });

  testWidgets('Brain dump: a line too long for a task stays in the dump; the day gets the cut, once', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    // 154 characters: more than a task title’s 120.
    const long =
        'Ask Milena whether the TDC coincidence window needs recalibrating before Friday’s CPI run, '
        'and send her the SPAD dead-time plots from the last acquisition';
    expect(long.length, greaterThan(kTitleMax));
    rig.services.pal.addDump(long);
    final cut = cleanText(long, kTitleMax);
    await openPal(tester);
    await openTool(tester, 'Brain dump');

    await press(tester, RegExp('^Minimum day: add “Ask Milena'));
    final added = rig.services.day.tasks.where((t) => t.title == cut).toList();
    expect(added, hasLength(1), reason: 'the day got the cut title at once');
    expect(added.single.title.length, lessThanOrEqualTo(kTitleMax));
    expect(rig.services.pal.dump.single.text, long, reason: 'nothing is lost: the full note stays');
    expect(find.text(long), findsOneWidget);
    expect(find.textContaining('to your minimum day. The full note stays in your brain dump.'), findsOneWidget);

    // Again: no second copy on the day; the note still stays.
    await press(tester, RegExp('^Minimum day: add “Ask Milena'));
    expect(rig.services.day.tasks.where((t) => t.title == cut), hasLength(1));
    expect(rig.services.pal.dump.single.text, long);
    expect(find.text('Already on your minimum day. The full note stays in your brain dump.'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('Sit with me keeps going with the sheet closed: the pill, Focus, the question, the end', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester, prefs: {'np.appearance': signalLook});
    await openPal(tester);
    await openTool(tester, 'Sit with me');
    await type(tester, RegExp(r'^What are you working on\?'), 'CPI notes');
    await press(tester, 'Sit with Pal for 10 minutes');
    expect(exists('Pal is sitting with you. 10 min left.'), isTrue);
    await press(tester, 'Close');
    expect(rig.services.pal.sit, isNotNull, reason: 'closing the sheet doesn’t stop it');

    // The bubble became a pill; Home's Focus tile shows the block.
    expect(exists('10 min left, sitting with you. Open Pal, your assistant.'), isTrue);
    expect(find.text('10 MIN'), findsOneWidget);
    expect(exists(RegExp(r'^Focus: Sitting with you, 10 min left · CPI notes')), isTrue);

    clock = clock.add(const Duration(minutes: 5));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(rig.services.pal.sit!.checkIn, SitCheck.asked);
    expect(exists('Still with it? Either answer is fine. Open Pal, your assistant.'), isTrue);

    // Pal opens on the running sit; the question waits there.
    await openPalFromPill(tester);
    expect(find.text(gentle['sitCheck']!), findsOneWidget);
    await press(tester, 'Still going');
    expect(rig.services.pal.sit!.checkIn, SitCheck.yes);
    await press(tester, 'Close');

    clock = clock.add(const Duration(minutes: 5));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(rig.services.pal.sit!.endReason, SitEnd.time);
    expect(exists('Nice. Note it? Your session is done. Open Pal, your assistant.'), isTrue);
    expect(exists(RegExp(r'^Focus: Done, Want to note what you did\?')), isTrue);

    await openPalFromPill(tester);
    expect(find.text(gentle['sitEnd']!), findsWidgets);
    expect(find.text('That was 10 minutes on CPI notes.'), findsOneWidget);
    await type(tester, RegExp(r'^What did you do\?'), 'Read two pages');
    await press(tester, 'Save note');
    expect(rig.services.pal.sit, isNull);
    expect(rig.services.pal.sitNotes.single.note, 'Read two pages');
    expect(find.text('Last time: 10 min · Read two pages'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('hide the bubble from the sheet; Settings shows it again; the menu always has Pal', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    await openPal(tester);
    await press(tester, 'Hide Pal’s floating bubble');
    expect(rig.services.pal.bubbleHidden, isTrue);
    await press(tester, 'Close');
    expect(find.byType(PalBubble), findsNothing);

    // The menu: Pal is there, and opens the sheet over the current screen.
    await press(tester, 'Open navigation');
    await press(tester, RegExp(r'^Pal\nYour assistant'));
    expect(find.byType(PalSheet), findsOneWidget);
    await press(tester, 'Close');

    await press(tester, 'Open navigation');
    await press(tester, 'Settings');
    await tester.scrollUntilVisible(
      find.text('Show Pal’s bubble'),
      300,
      scrollable: find.descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable)).first,
    );
    await tester.pumpAndSettle();
    await press(tester, RegExp('^Show Pal’s bubble'));
    expect(rig.services.pal.bubbleHidden, isFalse);
    expect(find.byType(PalBubble), findsOneWidget, reason: 'on Settings too');
    semantics.dispose();
  });

  testWidgets('the bubble follows the check-in, and stays off the calming steps', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    PalMood mood() => tester
        .widget<PalAvatar>(find.descendant(of: find.byType(PalBubble), matching: find.byType(PalAvatar)))
        .mood;
    expect(mood(), PalMood.okay);
    rig.services.day.recordCheckin(NervousState.red, 0.9);
    await tester.pumpAndSettle();
    expect(mood(), PalMood.over);

    await press(tester, 'Open navigation');
    await press(tester, 'Calming steps');
    expect(find.byType(CalmScreen), findsOneWidget);
    expect(find.byType(PalBubble), findsNothing);
    semantics.dispose();
  });
}

/// Ends a running sit, so its once-a-second watcher stops with the test.
void endSit(Rig rig) => rig.services.pal.forgetSession();

/// The pill's label starts with the sit's words; it still opens Pal.
Future<void> openPalFromPill(WidgetTester tester) async {
  tester.semantics.tap(find.semantics.byLabel(RegExp(r'Open Pal, your assistant\.$')));
  await tester.pumpAndSettle();
}
