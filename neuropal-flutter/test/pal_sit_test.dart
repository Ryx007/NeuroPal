// Sit with me on a fake clock: start, the halfway question (only with more
// than a minute left), the end on time, "I'm done", the note, forgetting an
// unanswered end, and a restart in the middle (the session carries on where
// it was, quietly catching up), plus what signing out ends.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/day/day_store.dart';
import 'package:neuropal/pal/pal_api.dart';
import 'package:neuropal/pal/pal_controller.dart';
import 'package:neuropal/pal/pal_models.dart';
import 'package:neuropal/theme/pal.dart';
import 'package:neuropal/theme/tokens.g.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

/// The watcher's timer, stopped: the test calls tick() itself.
class _NoTimer implements Timer {
  @override
  void cancel() {}
  @override
  bool get isActive => false;
  @override
  int get tick => 0;
}

late DateTime now;
late SharedPreferences prefs;

/// A fresh controller on the same saved data: an app restart.
PalController boot() {
  final day = DayStore(prefs: prefs, clock: () => now);
  final pal = PalController(
    prefs: prefs,
    day: day,
    api: PalApi(Backend(prefs: prefs, client: offlineBackend())),
    look: () => normalizePal(null),
    timer: (_, _) => _NoTimer(),
  );
  addTearDown(pal.dispose);
  return pal;
}

final gentle = kPalLines['Gentle']!;

void main() {
  setUp(() async {
    now = DateTime(2026, 11, 19, 10, 0);
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  test('start → the halfway question → the end on time → a note', () {
    final pal = boot();
    pal.startSit(minutes: 10, label: ' CPI   notes ', taskId: 'mvd-1');
    final sit = pal.sit!;
    expect((sit.minutes, sit.label, sit.taskId), (10, 'CPI notes', 'mvd-1'));
    expect(sit.endsAt - sit.startedAt, 10 * 60000);
    expect(sit.ended, isFalse);

    now = now.add(const Duration(minutes: 4, seconds: 59));
    expect(pal.tick(), isNull, reason: 'not halfway yet');
    now = now.add(const Duration(seconds: 1));
    expect(pal.tick(), SitTick.asked);
    expect(pal.sit!.checkIn, SitCheck.asked);
    expect(pal.news!.text, 'Pal: ${gentle['sitCheck']}');
    expect(pal.tick(), isNull, reason: 'asked once');
    pal.answerSitCheck(SitCheck.yes);
    expect(pal.sit!.checkIn, SitCheck.yes);

    now = now.add(const Duration(minutes: 5));
    expect(pal.tick(), SitTick.ended);
    expect(pal.sit!.endReason, SitEnd.time);
    expect(pal.sit!.endedAt, pal.sit!.endsAt);
    expect(pal.news!.text, 'Pal: ${gentle['sitEnd']}');

    // A restart now: the ended session is still there, waiting for its note.
    final again = boot();
    expect(again.sit!.ended, isTrue);
    again.saveSitNote('  Read two pages ');
    expect(again.sit, isNull);
    final note = again.sitNotes.single;
    expect((note.minutes, note.label, note.note), (10, 'CPI notes', 'Read two pages'));
    expect(boot().sitNotes.single.note, 'Read two pages', reason: 'notes are saved');
  });

  test('a restart in the middle: the clock carries on, catching up quietly', () {
    boot().startSit(minutes: 25, label: 'Thesis intro');
    now = now.add(const Duration(minutes: 20)); // the app was closed meanwhile
    final mid = boot();
    expect(mid.sit!.label, 'Thesis intro');
    expect(mid.sit!.ended, isFalse);
    expect(mid.sit!.checkIn, SitCheck.asked, reason: 'past halfway, more than a minute left');
    expect(mid.news, isNull, reason: 'nothing is read out at start-up');
    expect(mid.tick(), isNull);

    now = now.add(const Duration(minutes: 10));
    final after = boot();
    expect(after.sit!.ended, isTrue);
    expect(after.sit!.endReason, SitEnd.time);
    expect(after.news, isNull);
  });

  test('no halfway question with under a minute left', () {
    final pal = boot();
    pal.startSit(minutes: 1);
    now = now.add(const Duration(seconds: 30));
    expect(pal.tick(), isNull);
    expect(pal.sit!.checkIn, isNull);
    now = now.add(const Duration(seconds: 30));
    expect(pal.tick(), SitTick.ended);
  });

  test('“I’m done”, then an unanswered end prompt goes away after 30 minutes', () {
    final pal = boot();
    pal.startSit(minutes: 45);
    now = now.add(const Duration(minutes: 3));
    pal.endSit();
    expect(pal.sit!.endReason, SitEnd.done);
    expect(pal.sit!.endedAt, now.millisecondsSinceEpoch);
    now = now.add(const Duration(minutes: 30));
    expect(pal.tick(), isNull);
    now = now.add(const Duration(minutes: 1));
    expect(pal.tick(), SitTick.forgotten);
    expect(pal.sit, isNull);
    expect(boot().sit, isNull);
  });

  test('“Not now” closes it without a note; a new sit replaces nothing else', () {
    final pal = boot();
    pal.startSit(minutes: 10);
    pal.endSit();
    pal.clearSit();
    expect(pal.sit, isNull);
    expect(pal.sitNotes, isEmpty);
  });

  test('signing out ends the sit and its notes; a new session alone keeps them', () {
    final pal = boot();
    pal.startSit(minutes: 10);
    pal.forgetSession(endSit: false);
    expect(pal.sit, isNotNull);
    pal.endSit();
    pal.saveSitNote('done');
    pal.startSit(minutes: 25);
    pal.forgetSession();
    expect(pal.sit, isNull);
    expect(pal.sitNotes, isEmpty);
    expect(boot().sit, isNull);
  });

  test('a broken save starts empty instead of crashing', () async {
    SharedPreferences.setMockInitialValues({
      PalController.sitKey: '{not json',
      PalController.chatKey: '[{"role":"robot","text":"x"},{"role":"pal","text":"  hi  "}]',
      PalController.dumpKey: '{"v":1,"items":[{"id":"bad id!","text":"x","at":"2026-11-19T10:00:00.000Z"},'
          '{"id":"d-1","text":" keep  me ","at":"2026-11-19T10:00:00.000Z"}]}',
    });
    prefs = await SharedPreferences.getInstance();
    final pal = boot();
    expect(pal.sit, isNull);
    expect(pal.chat.single.text, 'hi');
    expect(pal.dump.single.text, 'keep me');
  });
}
