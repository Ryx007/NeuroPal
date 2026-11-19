// The day store's rules (docs/DAY-SYNC.md §8 and the web app's day.ts):
// check-ins (refine within a minute, older ones, the cap), "done" derived
// from doneOn across midnight, tombstones and Undo, old saves, unknown
// fields kept, sync answers, and whose day it is.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/day/day_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A store on fresh (or given) saved preferences, with a clock the test
/// moves by hand.
class Day {
  Day._(this.prefs, this.store, this._now);

  final SharedPreferences prefs;
  final DayStore store;
  final List<DateTime> _now;

  DateTime get now => _now.first;
  set now(DateTime t) => _now[0] = t;
  void advance(Duration d) => _now[0] = _now[0].add(d);

  static Future<Day> open({DateTime? at, Map<String, Object> saved = const {}}) async {
    SharedPreferences.setMockInitialValues(saved);
    final prefs = await SharedPreferences.getInstance();
    final now = [at ?? DateTime(2026, 11, 19, 10, 0)];
    return Day._(prefs, DayStore(prefs: prefs, clock: () => now.first), now);
  }

  /// The same saved preferences, read by a new store (an app restart).
  DayStore reopen() => DayStore(prefs: prefs, clock: () => _now.first);

  Map<String, Object?> get saved =>
      (jsonDecode(prefs.getString(DayStore.storageKey)!) as Map).cast<String, Object?>();
}

const anchorInput = AnchorInput(
  title: 'Morning meds',
  subtitle: 'Blue, with water',
  hour: 8,
  minute: 15,
  flexMinutes: 30,
  category: AnchorCategory.medication,
);

void main() {
  group('check-ins', () {
    test('a check-in sets the state; another within a minute refines it', () async {
      final d = await Day.open();
      d.store.recordCheckin(NervousState.green, 0.2);
      expect(d.store.state, NervousState.green);
      expect(d.store.level, 0.2);
      d.advance(const Duration(seconds: 40));
      d.store.recordCheckin(NervousState.yellow, 0.5);
      expect(d.store.checkins, hasLength(1), reason: 'refined, not added');
      expect(d.store.checkins.single.state, NervousState.yellow);
      expect(d.store.state, NervousState.yellow);
      d.advance(const Duration(seconds: 61));
      d.store.recordCheckin(NervousState.red, 0.9);
      expect(d.store.checkins.map((c) => c.state), [NervousState.yellow, NervousState.red]);
    });

    test('an older check-in joins the history in order and leaves the state', () async {
      final d = await Day.open();
      d.store.recordCheckin(NervousState.green, 0.1);
      d.advance(const Duration(minutes: 10));
      d.store.recordCheckin(NervousState.yellow, 0.5);
      d.store.recordCheckin(
        NervousState.red,
        null,
        at: d.now.subtract(const Duration(minutes: 5)),
      );
      expect(d.store.checkins.map((c) => c.state), [
        NervousState.green,
        NervousState.red,
        NervousState.yellow,
      ]);
      expect(d.store.state, NervousState.yellow);
      expect(d.store.checkins[1].level, isNull);
    });

    test('a check-in “from the future” is made now; times are ISO with ms', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 17, 20));
      d.store.recordCheckin(
        NervousState.green,
        1.4,
        at: d.now.add(const Duration(hours: 1)),
      );
      expect(d.store.checkins.single.at, '2026-11-19T17:20:00.000Z');
      expect(d.store.level, 1.0, reason: 'levels are 0–1');
    });

    test('the newest 200 are kept', () async {
      final d = await Day.open();
      for (var i = 0; i < 230; i++) {
        d.advance(const Duration(minutes: 2));
        d.store.recordCheckin(NervousState.values[i % 3], null);
      }
      expect(d.store.checkins, hasLength(kCheckinCap));
      expect(d.store.checkins.last.atMs, d.now.millisecondsSinceEpoch);
    });
  });

  group('the minimum viable day', () {
    test('starts with the three starters, stamped 1970', () async {
      final d = await Day.open();
      expect(d.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-2', 'mvd-3']);
      expect(d.store.tasks.map((t) => t.title), ['Stay hydrated', 'Take meds', 'Walk']);
      expect(d.store.tasks.first.subtitle, '2 glasses left');
      expect(d.store.tasks.every((t) => t.createdAt == kEpochIso), isTrue);
      expect(d.store.remainingTasks, 3);
    });

    test('done is doneOn == today: a tick stops counting after midnight', () async {
      final d = await Day.open(at: DateTime(2026, 11, 19, 23, 58));
      d.store.toggleTask('mvd-2');
      final t = d.store.tasks[1];
      expect(t.doneOn, '2026-11-19');
      expect(t.tickAt, isNotNull);
      expect(d.store.isTaskDone(t), isTrue);
      expect(d.store.remainingTasks, 2);
      d.now = DateTime(2026, 11, 20, 0, 1);
      expect(d.store.isTaskDone(d.store.tasks[1]), isFalse, reason: 'no rollover job');
      expect(d.store.remainingTasks, 3);
    });

    test('un-ticking is a tick with doneOn null and a new tickAt', () async {
      final d = await Day.open();
      d.store.setTaskDone('mvd-1', true);
      final first = d.store.tasks.first.tickAt;
      d.advance(const Duration(minutes: 1));
      d.store.setTaskDone('mvd-1', false);
      expect(d.store.tasks.first.doneOn, isNull);
      expect(d.store.tasks.first.tickAt, isNot(first));
      // A tick never touches the definition.
      expect(d.store.tasks.first.updatedAt, kEpochIso);
    });

    test('a new task goes last, even when this clock is behind', () async {
      final d = await Day.open(at: DateTime.utc(1960));
      expect(d.store.addTask('   Email   the lab  '), isTrue);
      expect(d.store.addTask('  '), isFalse);
      expect(d.store.tasks.last.title, 'Email the lab');
      expect(d.store.tasks.last.createdAt, '1970-01-01T00:00:00.001Z');
    });

    test('remove leaves a tombstone without content; Undo is an edit', () async {
      final d = await Day.open();
      d.store.setTaskDone('mvd-3', true);
      d.advance(const Duration(minutes: 1));
      final gone = d.store.removeTask('mvd-3')!;
      expect(gone.title, 'Walk');
      expect(d.store.tasks.map((t) => t.id), isNot(contains('mvd-3')));
      final tombstone = (d.store.syncBody()['tasks']! as List).last as Map;
      expect(tombstone, {
        'id': 'mvd-3',
        'createdAt': kEpochIso,
        'updatedAt': kEpochIso,
        'deletedAt': isoMs(d.now),
      });
      expect(d.prefs.getString(DayStore.storageKey), isNot(contains('Walk')));

      d.advance(const Duration(seconds: 5));
      d.store.restoreTask(gone);
      final back = d.store.tasks.last;
      expect(back.id, 'mvd-3');
      expect(back.title, 'Walk');
      expect(back.deletedAt, isNull);
      expect(back.updatedAt, isoMs(d.now), reason: 'later than the deletion');
      expect(back.createdAt, kEpochIso, reason: 'back in its place');
      expect(d.store.isTaskDone(back), isTrue, reason: 'its tick came back too');
    });
  });

  group('anchors', () {
    test('add, edit (unknown fields kept), done today, delete and Undo', () async {
      final d = await Day.open();
      final id = d.store.addAnchor(anchorInput)!;
      var a = d.store.anchors.single;
      expect(a.title, 'Morning meds');
      expect(a.flexMinutes, 30);
      expect(a.category, AnchorCategory.medication);
      expect(a.createdAt, a.updatedAt);

      d.advance(const Duration(minutes: 3));
      d.store.setAnchorDone(id, true);
      expect(d.store.isAnchorDone(d.store.anchors.single), isTrue);
      expect(d.store.anchors.single.updatedAt, a.updatedAt, reason: 'a tick is not an edit');

      d.advance(const Duration(minutes: 3));
      d.store.updateAnchor(
        id,
        const AnchorInput(title: 'Meds', hour: 9, minute: 0, flexMinutes: 15),
      );
      a = d.store.anchors.single;
      expect(a.title, 'Meds');
      expect(a.hour, 9);
      expect(a.updatedAt, isoMs(d.now));
      expect(d.store.isAnchorDone(a), isTrue, reason: 'the tick stays');

      final gone = d.store.removeAnchor(id)!;
      expect(d.store.anchors, isEmpty);
      final tomb = (d.store.syncBody()['anchors']! as List).single as Map;
      expect(tomb.keys, unorderedEquals(['id', 'createdAt', 'updatedAt', 'deletedAt']));
      d.advance(const Duration(seconds: 1));
      d.store.restoreAnchor(gone);
      expect(d.store.anchors.single.title, 'Meds');
      expect(d.store.anchors.single.deletedAt, isNull);
    });

    test('the next anchor: the first not done that is ahead, else the last', () async {
      final d = await Day.open(at: DateTime(2026, 11, 19, 12, 0));
      final early = d.store.addAnchor(
        const AnchorInput(title: 'Early', hour: 8, minute: 0),
      )!;
      d.store.addAnchor(const AnchorInput(title: 'Late', hour: 18, minute: 0));
      d.store.addAnchor(const AnchorInput(title: 'Noonish', hour: 12, minute: 30));
      expect(d.store.anchors.map((a) => a.title), ['Early', 'Noonish', 'Late']);
      expect(d.store.nextAnchor!.title, 'Noonish');
      d.now = DateTime(2026, 11, 19, 20, 0);
      expect(d.store.nextAnchor!.title, 'Late', reason: 'overdue, still pending');
      d.store.setAnchorDone(d.store.nextAnchor!.id, true);
      expect(d.store.nextAnchor!.title, 'Noonish');
      d.store.setAnchorDone(d.store.nextAnchor!.id, true);
      d.store.setAnchorDone(early, true);
      expect(d.store.nextAnchor, isNull);
    });
  });

  group('saves', () {
    test('everything survives a restart', () async {
      final d = await Day.open();
      d.store.recordCheckin(NervousState.yellow, 0.45);
      d.store.addAnchor(anchorInput);
      d.store.setTaskDone('mvd-1', true);
      final again = d.reopen();
      expect(again.state, NervousState.yellow);
      expect(again.level, 0.45);
      expect(again.checkins, d.store.checkins);
      expect(again.anchors.single.title, 'Morning meds');
      expect(again.isTaskDone(again.tasks.first), isTrue);
    });

    test('an old save (before sync) gets stamps, keeping order and ticks', () async {
      final d = await Day.open(
        at: DateTime(2026, 11, 19, 9, 30),
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 1,
            'dayStamp': '2026-11-19',
            'state': 'green',
            'level': 0.2,
            'checkins': [
              {'state': 'green', 'level': 0.2, 'at': '2026-11-19T08:00:00.000Z'},
            ],
            'tasks': [
              {'id': 'mvd-1', 'title': 'Stay hydrated', 'subtitle': '2 glasses left', 'done': true},
              {'id': 'mvd-2', 'title': 'Take my meds', 'subtitle': 'Morning dosage', 'done': false},
              {'id': 't-x', 'title': 'Email the lab', 'subtitle': '', 'done': false},
            ],
            'anchors': [
              {
                'id': 'a-1',
                'title': 'Lunch',
                'subtitle': '',
                'time': {'hour': 12, 'minute': 30},
                'status': 'done',
                'icon': 'free-breakfast',
              },
            ],
          }),
        },
      );
      final now = isoMs(d.now);
      final tasks = d.store.tasks;
      expect(tasks.map((t) => t.id), ['mvd-1', 'mvd-2', 't-x']);
      // A starter never edited: the 1970 stamps every client uses.
      expect(tasks[0].createdAt, kEpochIso);
      expect(d.store.isTaskDone(tasks[0]), isTrue);
      expect(tasks[0].tickAt, now);
      // Edited starter and own tasks: now, then one millisecond apart.
      expect(tasks[1].createdAt, now);
      expect(tasks[2].createdAt, isoMs(d.now.add(const Duration(milliseconds: 1))));
      expect(tasks[2].extra, isEmpty, reason: '"done" is not carried along');
      final lunch = d.store.anchors.single;
      expect(d.store.isAnchorDone(lunch), isTrue);
      expect(lunch.kind, AnchorCategory.rest, reason: 'from the Expo icon');
      expect(lunch.extra, {'icon': 'free-breakfast'});
      expect(d.store.state, NervousState.green);
      // Written back in the new shape at once.
      expect(d.saved['v'], 2);
    });

    test('an old save from yesterday keeps no ticks', () async {
      final d = await Day.open(
        at: DateTime(2026, 11, 20, 9, 30),
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 1,
            'dayStamp': '2026-11-19',
            'tasks': [
              {'id': 'mvd-1', 'title': 'Stay hydrated', 'done': true},
            ],
          }),
        },
      );
      expect(d.store.tasks.single.doneOn, isNull);
    });

    test('a broken save starts a fresh day', () async {
      final d = await Day.open(saved: {DayStore.storageKey: '{not json'});
      expect(d.store.tasks, hasLength(3));
      expect(d.store.state, isNull);
    });
  });

  group('sync answers', () {
    Map<String, Object?> anchorJson(
      String id, {
      String title = 'Walk',
      String updatedAt = '2026-11-19T09:00:00.000Z',
      Map<String, Object?> extra = const {},
    }) => {
      'id': id,
      'title': title,
      'subtitle': '',
      'time': {'hour': 15, 'minute': 0},
      ...extra,
      'createdAt': '2026-11-19T09:00:00.000Z',
      'updatedAt': updatedAt,
      'deletedAt': null,
      'doneOn': null,
      'tickAt': null,
    };

    test('unknown fields come back unchanged when the item is edited', () async {
      final d = await Day.open();
      d.store.applyServer({
        'gen': 1,
        'anchors': [
          anchorJson(
            'a-expo',
            extra: {
              'icon': 'medication',
              'location': {'lat': 41.1, 'lng': 16.9, 'radius': 150},
              'nextYear': [1, 2],
            },
          ),
        ],
      });
      final a = d.store.anchors.single;
      expect(a.kind, AnchorCategory.medication);
      expect(a.flexMinutes, isNull, reason: 'left out, not invented');
      d.advance(const Duration(minutes: 1));
      d.store.updateAnchor(
        'a-expo',
        AnchorInput(title: 'Meds at noon', hour: 12, minute: 0, category: a.kind),
      );
      final sent = (d.store.syncBody()['anchors']! as List).single as Map;
      expect(sent['title'], 'Meds at noon');
      expect(sent['icon'], 'medication');
      expect(sent['location'], {'lat': 41.1, 'lng': 16.9, 'radius': 150});
      expect(sent['nextYear'], [1, 2]);
      // ...and after a restart too.
      final again = (d.reopen().syncBody()['anchors']! as List).single as Map;
      expect(again['location'], sent['location']);
    });

    test('the answer replaces the sections; items it never mentions stay', () async {
      final d = await Day.open();
      d.store.addTask('Mine, refused by the server');
      final mine = d.store.tasks.last.id;
      d.store.applyServer({
        'gen': 3,
        'tasks': [
          {
            'id': 'mvd-1',
            'title': 'Stay hydrated',
            'subtitle': 'Edited elsewhere',
            'createdAt': kEpochIso,
            'updatedAt': '2026-11-19T09:00:00.000Z',
            'deletedAt': null,
            'doneOn': null,
            'tickAt': null,
          },
          {
            'id': 'mvd-2',
            'createdAt': kEpochIso,
            'updatedAt': kEpochIso,
            'deletedAt': '2026-11-19T09:00:00.000Z',
          },
          // mvd-3 isn't mentioned: it stays, and is sent again next time.
        ],
        'anchors': [anchorJson('a-web')],
        'checkins': <Object?>[],
      });
      expect(d.store.gen, 3);
      expect(d.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-3', mine]);
      expect(d.store.tasks.first.subtitle, 'Edited elsewhere');
      expect(d.store.anchors.single.id, 'a-web');
      expect(d.store.syncedAt, isNotNull);
      // A sync answer is not a change made on this phone.
      expect(d.store.localRevision, 1);
    });

    test('erased: the answer replaces everything, current state too', () async {
      final d = await Day.open();
      d.store.recordCheckin(NervousState.red, 0.9);
      d.store.addAnchor(anchorInput);
      d.store.applyServer({
        'gen': 4,
        'erased': true,
        'anchors': <Object?>[],
        'tasks': <Object?>[],
        'checkins': <Object?>[],
      });
      expect(d.store.anchors, isEmpty);
      expect(d.store.tasks, isEmpty);
      expect(d.store.checkins, isEmpty);
      expect(d.store.state, isNull);
      expect(d.store.gen, 4);
    });

    test('a newer check-in from another device moves the state; an older one doesn’t', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 10));
      d.store.recordCheckin(NervousState.green, 0.1);
      final followed = d.store.applyServer({
        'checkins': [
          {'at': '2026-11-19T09:00:00.000Z', 'state': 'red', 'level': 0.9},
          {'at': '2026-11-19T10:00:00.000Z', 'state': 'green', 'level': 0.1},
        ],
      });
      expect(followed, isFalse);
      expect(d.store.state, NervousState.green);
      expect(d.store.checkins, hasLength(2));

      final moved = d.store.applyServer({
        'checkins': [
          {'at': '2026-11-19T10:00:00.000Z', 'state': 'green', 'level': 0.1},
          {'at': '2026-11-19T10:30:00.000Z', 'state': 'yellow', 'level': 0.5},
        ],
      });
      expect(moved, isTrue);
      expect(d.store.state, NervousState.yellow);
      expect(d.store.level, 0.5);
      // The answer's check-ins replace the local list (DAY-SYNC §8).
      expect(d.store.checkins.map((c) => c.at), [
        '2026-11-19T10:00:00.000Z',
        '2026-11-19T10:30:00.000Z',
      ]);
    });

    test('a check-in the server moved (a phone clock ahead) is not kept twice', () async {
      // This phone's clock is 10 minutes fast; the server stored the
      // check-in at its own time, which is all the answer mentions.
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 12, 10));
      d.store.recordCheckin(NervousState.green, 0.1);
      d.store.applyServer({
        'checkins': [
          {'at': '2026-11-19T12:00:00.000Z', 'state': 'green', 'level': 0.1},
        ],
      });
      expect(d.store.checkins.single.at, '2026-11-19T12:00:00.000Z');
      expect(d.store.state, NervousState.green);
      final sent = d.store.syncBody()['checkins']! as List;
      expect(sent, hasLength(1), reason: 'not sent again under the phone’s time');
    });

    test('the answer’s check-ins replace the local list; the newest 200 stay', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 12));
      d.store.recordCheckin(NervousState.green, 0.1);
      d.store.applyServer({
        'checkins': [
          // 30 s after the local one: the server's 60-second rule kept this
          // one only.
          {'at': '2026-11-19T12:00:30.000Z', 'state': 'yellow', 'level': 0.5},
          for (var i = 0; i < 250; i++)
            {
              'at': isoMs(DateTime.utc(2026, 11, 18).add(Duration(minutes: 2 * i))),
              'state': 'green',
              'level': null,
            },
        ],
      });
      expect(d.store.checkins, hasLength(kCheckinCap));
      expect(d.store.checkins.last.at, '2026-11-19T12:00:30.000Z');
      expect(d.store.state, NervousState.yellow);
    });
  });

  group('whose day it is', () {
    test('a day that never synced joins the first account', () async {
      final d = await Day.open();
      expect(d.store.owner, isNull);
      d.store.claim('acct-a');
      expect(d.store.owner, 'acct-a');
      expect(d.reopen().owner, 'acct-a');
    });

    test('another account clears the day and its gen first', () async {
      final d = await Day.open();
      d.store.claim('acct-a');
      d.store.recordCheckin(NervousState.red, 0.9);
      d.store.addAnchor(anchorInput);
      d.store.applyServer({'gen': 7});
      d.store.resetFor('acct-b');
      expect(d.store.owner, 'acct-b');
      expect(d.store.gen, isNull);
      expect(d.store.checkins, isEmpty);
      expect(d.store.state, isNull);
      expect(d.store.anchors, isEmpty);
      expect(d.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-2', 'mvd-3']);
      expect(d.store.syncBody().containsKey('gen'), isFalse);
      expect(d.prefs.getString(DayStore.storageKey), isNot(contains('Morning meds')));
    });
  });
}
