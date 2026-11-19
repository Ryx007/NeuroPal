// The day store's rules (docs/DAY-SYNC.md §8 and the web app's day.ts):
// check-ins (refine within a minute, older ones, the cap), "done" derived
// from doneOn across midnight, tombstones (and their cap) and Undo, the
// brain dump (and its move from Pal's old key), old saves (and the
// starters deleted before sync), unknown fields kept, sync answers, and
// whose day it is.

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

  group('the brain dump', () {
    test('add, newest first; delete leaves {id, deletedAt}; Undo is a new line', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 10));
      expect(d.store.addDump('   '), isFalse);
      expect(d.store.addDump('  buy   more coffee '), isTrue);
      d.advance(const Duration(minutes: 1));
      expect(d.store.addDump('email the lab'), isTrue);
      expect(d.store.dump.map((x) => x.text), ['email the lab', 'buy more coffee']);
      expect(d.store.localRevision, 2, reason: 'a change made here: day sync sends it');

      d.advance(const Duration(minutes: 1));
      final gone = d.store.removeDump(d.store.dump.last.id)!;
      expect(gone.text, 'buy more coffee');
      expect(d.store.dump.map((x) => x.text), ['email the lab']);
      final sent = (d.store.syncBody()['dump']! as List).cast<Map<String, Object?>>();
      expect(sent.last, {'id': gone.id, 'deletedAt': isoMs(d.now)}, reason: 'no text in a tombstone');
      expect(d.prefs.getString(DayStore.storageKey), isNot(contains('buy more coffee')));

      d.advance(const Duration(seconds: 5));
      expect(d.store.addDump(gone.text), isTrue); // Undo
      expect(d.store.dump.first.text, 'buy more coffee');
      expect(d.store.dump.first.id, isNot(gone.id), reason: 'a deletion is final (§5)');

      final again = d.reopen();
      expect(again.dump.map((x) => x.text), ['buy more coffee', 'email the lab']);
      expect(
        (again.syncBody()['dump']! as List).where((j) => (j as Map)['deletedAt'] != null),
        hasLength(1),
      );
    });

    test('a line over 2000 is cut on entry, never inside an emoji', () async {
      final d = await Day.open();
      d.store.addDump('${'a' * 1999}😀 and more');
      expect(d.store.dump.single.text, 'a' * 1999);
    });

    test('a line too long for a task title gives a copy cut at a word, with “…”', () {
      expect(shortTitle('  Buy   oat milk ', kTitleMax), 'Buy oat milk', reason: 'fits: whole');
      final words = List.filled(30, 'word').join(' '); // 149 characters
      final cut = shortTitle(words, kTitleMax);
      expect(cut.length, lessThanOrEqualTo(kTitleMax));
      expect(cut, endsWith('word…'), reason: 'never half a word');
      expect(shortTitle('${'a' * 150} b', kTitleMax), '${'a' * 119}…', reason: 'one long word: cut');
      expect(
        shortTitle('${'x' * 100}, and then some more words to go past the end', kTitleMax),
        '${'x' * 100}, and then some…',
      );
      expect(shortTitle('${'y' * 117}, tail', kTitleMax), '${'y' * 117}…', reason: 'no comma before “…”');
    });

    test('another account’s day starts without this dump', () async {
      final d = await Day.open();
      d.store.claim('acct-a');
      d.store.addDump('a private thought');
      d.store.resetFor('acct-b');
      expect(d.store.dump, isEmpty);
      expect(d.store.syncBody()['dump'], isEmpty);
      expect(d.prefs.getString(DayStore.storageKey), isNot(contains('private thought')));
    });
  });

  group('Pal’s old brain dump (np.pal.dump) joins the day once', () {
    String legacy(List<Map<String, Object?>> items, {String? owner}) =>
        jsonEncode({'v': 1, 'owner': owner, 'items': items});

    final syncedDay = jsonEncode({
      'v': 2,
      'owner': 'acct-a',
      'gen': 3,
      'tasks': [
        for (final t in starterTasks()) t.toJson(),
      ],
      'anchors': <Object?>[],
    });

    test('ids and times kept (a bad id gets a new one); the old key goes after the save', () async {
      SharedPreferences.setMockInitialValues({
        DayStore.storageKey: syncedDay,
        DayStore.legacyDumpKey: legacy(owner: 'acct-a', [
          {'id': 'd-new', 'text': 'newest line', 'at': '2026-11-19T11:00:00.000Z', 'deletedAt': null},
          {'id': 'bad id!', 'text': ' bad   id ', 'at': '2026-11-19T10:00:00.000Z', 'deletedAt': null},
          {'id': 'd-gone', 'deletedAt': '2026-11-19T09:30:00.000Z'},
          {'id': 'd-old', 'text': 'oldest line', 'at': '2026-11-19T09:00:00.000Z', 'deletedAt': null},
        ]),
      });
      final prefs = await SharedPreferences.getInstance();
      final store = DayStore(prefs: prefs, clock: () => DateTime.utc(2026, 11, 19, 12));
      Map<String, Object?> day() =>
          (jsonDecode(prefs.getString(DayStore.storageKey)!) as Map).cast<String, Object?>();

      // At once: the day holding the lines is written, the old copy not
      // touched yet — it goes only once that save is done.
      expect(day()['v'], 3);
      expect(day()['dump'], hasLength(3));
      expect(prefs.getString(DayStore.legacyDumpKey), isNotNull);
      await pumpEventQueue();
      expect(prefs.getString(DayStore.legacyDumpKey), isNull);

      final dump = store.dump;
      expect(dump.map((x) => x.text), ['newest line', 'bad id', 'oldest line']);
      expect([dump[0].id, dump[2].id], ['d-new', 'd-old']);
      expect(isValidId(dump[1].id) && dump[1].id != 'bad id!', isTrue);
      expect(dump.map((x) => x.at), [
        '2026-11-19T11:00:00.000Z',
        '2026-11-19T10:00:00.000Z',
        '2026-11-19T09:00:00.000Z',
      ]);
      expect(
        store.syncBody()['dump'],
        hasLength(3),
        reason: 'a line deleted before it ever left the phone has nothing to stop',
      );
      expect(store.gen, 3, reason: 'the rest of the day is untouched');
      // Once: a restart finds them in the day, not twice.
      final again = DayStore(prefs: prefs, clock: () => DateTime.utc(2026, 11, 19, 12));
      expect(again.dump.map((x) => x.id), dump.map((x) => x.id));
    });

    test('a new install (no day saved yet) takes the lines as well', () async {
      final d = await Day.open(
        saved: {
          DayStore.legacyDumpKey: legacy([
            {'id': 'd-1', 'text': 'keep me', 'at': '2026-11-19T09:00:00.000Z', 'deletedAt': null},
          ]),
        },
      );
      expect(d.store.dump.single.text, 'keep me');
      expect(d.store.tasks, hasLength(3));
      await pumpEventQueue();
      expect(d.prefs.getString(DayStore.legacyDumpKey), isNull);
      expect(d.reopen().dump.single.id, 'd-1');
    });

    test('lines without a saved time get now, each next one a millisecond earlier', () async {
      final d = await Day.open(
        at: DateTime.utc(2026, 11, 19, 12),
        saved: {
          DayStore.storageKey: syncedDay,
          DayStore.legacyDumpKey: legacy([
            {'id': 'd-a', 'text': 'first in the list'},
            {'id': 'd-b', 'text': 'second in the list', 'at': 'yesterday-ish'},
          ]),
        },
      );
      expect(d.store.dump.map((x) => (x.id, x.at)), [
        ('d-a', '2026-11-19T12:00:00.000Z'),
        ('d-b', '2026-11-19T11:59:59.999Z'),
      ]);
    });

    test('lines of another account’s day stay out; the old key still goes', () async {
      final d = await Day.open(
        saved: {
          DayStore.storageKey: syncedDay,
          DayStore.legacyDumpKey: legacy(owner: 'acct-b', [
            {'id': 'd-1', 'text': 'someone else’s', 'at': '2026-11-19T09:00:00.000Z', 'deletedAt': null},
          ]),
        },
      );
      expect(d.store.dump, isEmpty);
      await pumpEventQueue();
      expect(d.prefs.getString(DayStore.legacyDumpKey), isNull);
    });

    test('a day that already holds the dump only drops the old copy', () async {
      final d = await Day.open(
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 3,
            'dump': [
              {'id': 'd-day', 'text': 'in the day', 'at': '2026-11-19T09:00:00.000Z', 'deletedAt': null},
            ],
          }),
          DayStore.legacyDumpKey: legacy([
            {'id': 'd-old', 'text': 'moved already', 'at': '2026-11-19T08:00:00.000Z', 'deletedAt': null},
          ]),
        },
      );
      expect(d.store.dump.map((x) => x.id), ['d-day']);
      await pumpEventQueue();
      expect(d.prefs.getString(DayStore.legacyDumpKey), isNull);
    });
  });

  group('stamps', () {
    test('every stamp made here is later than the one it replaces (a clock ahead elsewhere)', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 10));
      final ahead = isoMs(d.now.add(const Duration(seconds: 45)));
      int ms(String? iso) => parseIsoMs(iso)!;
      d.store.applyServer({
        'anchors': [
          {
            'id': 'a-1',
            'title': 'Lab meeting',
            'subtitle': '',
            'time': {'hour': 14, 'minute': 0},
            'createdAt': ahead,
            'updatedAt': ahead,
            'deletedAt': null,
            'doneOn': null,
            'tickAt': ahead,
          },
        ],
        'tasks': [
          {
            'id': 'mvd-1',
            'title': 'Stay hydrated',
            'subtitle': '',
            'createdAt': kEpochIso,
            'updatedAt': ahead,
            'deletedAt': null,
            'doneOn': null,
            'tickAt': ahead,
          },
        ],
      });
      d.store.setAnchorDone('a-1', true);
      expect(ms(d.store.anchors.single.tickAt), ms(ahead) + 1);
      d.store.setTaskDone('mvd-1', true);
      expect(ms(d.store.tasks.first.tickAt), ms(ahead) + 1);
      d.store.updateAnchor('a-1', const AnchorInput(title: 'Lab meeting, room 2', hour: 14, minute: 0));
      final edited = d.store.anchors.single.updatedAt;
      expect(ms(edited), ms(ahead) + 1);

      final gone = d.store.removeAnchor('a-1')!;
      final tomb = (d.store.syncBody()['anchors']! as List).single as Map;
      expect(ms(tomb['deletedAt'] as String), ms(edited) + 1, reason: 'deletedAt ≥ updatedAt: it holds');
      d.store.restoreAnchor(gone);
      expect(ms(d.store.anchors.single.updatedAt), ms(tomb['deletedAt'] as String) + 1, reason: 'Undo wins');

      final task = d.store.removeTask('mvd-1')!;
      final taskTomb = (d.store.syncBody()['tasks']! as List).first as Map;
      expect(ms(taskTomb['deletedAt'] as String), ms(ahead) + 1);
      d.store.restoreTask(task);
      expect(ms(d.store.tasks.first.updatedAt), ms(taskTomb['deletedAt'] as String) + 1);
    });

    test('a content-free tombstone older than its updatedAt still loads as a deletion that holds', () async {
      // Saved by a build that stamped deletions with a bare "now" under an
      // edit from a clock that ran ahead.
      const updated = '2026-11-19T10:00:45.000Z';
      final d = await Day.open(
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 2,
            'tasks': <Object?>[],
            'anchors': [
              {'id': 'a-gone', 'createdAt': updated, 'updatedAt': updated, 'deletedAt': '2026-11-19T10:00:10.000Z'},
              {
                'id': 'a-back',
                'title': 'Undo won',
                'subtitle': '',
                'time': {'hour': 9, 'minute': 0},
                'createdAt': updated,
                'updatedAt': updated,
                'deletedAt': '2026-11-19T10:00:10.000Z',
              },
            ],
          }),
        },
      );
      expect(d.store.anchors.map((a) => a.title), ['Undo won'], reason: 'with content: an Undo won (§5)');
      final sent = (d.store.syncBody()['anchors']! as List).cast<Map<String, Object?>>();
      expect(sent.last, {
        'id': 'a-gone',
        'createdAt': updated,
        'updatedAt': updated,
        'deletedAt': '2026-11-19T10:00:45.001Z',
      });
    });
  });

  group('tombstones', () {
    String at(int i) => isoMs(DateTime.utc(2026, 11, 1).add(Duration(seconds: i)));
    Set<Object?> gone(DayStore store, String section) => {
      for (final j in store.syncBody()[section]! as List)
        if ((j as Map)['deletedAt'] != null) j['id'],
    };

    test('the newest 3000 per section stay; the oldest deletedAt go first', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19));
      d.store.applyServer({
        'tasks': [
          for (var i = 0; i < 3005; i++)
            {'id': 't-$i', 'createdAt': kEpochIso, 'updatedAt': kEpochIso, 'deletedAt': at(i)},
        ],
        'anchors': [
          for (var i = 0; i < 3002; i++)
            {'id': 'a-$i', 'createdAt': kEpochIso, 'updatedAt': kEpochIso, 'deletedAt': at(i)},
        ],
        'dump': [
          for (var i = 0; i < 3003; i++) {'id': 'd-$i', 'deletedAt': at(i)},
        ],
      });
      for (final (section, prefix, n) in [('tasks', 't', 3005), ('anchors', 'a', 3002), ('dump', 'd', 3003)]) {
        final ids = gone(d.store, section);
        expect(ids, hasLength(kTombstoneCap), reason: section);
        expect(ids, isNot(contains('$prefix-${n - kTombstoneCap - 1}')), reason: section);
        expect(ids, containsAll(['$prefix-${n - kTombstoneCap}', '$prefix-${n - 1}']), reason: section);
      }
      expect(d.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-2', 'mvd-3'], reason: 'live items all stay');

      // A deletion made here is the newest: it stays, the oldest goes.
      d.store.removeTask('mvd-1');
      final tasks = gone(d.store, 'tasks');
      expect(tasks, hasLength(kTombstoneCap));
      expect(tasks, contains('mvd-1'));
      expect(tasks, isNot(contains('t-5')));
      // ...and after a restart.
      expect(gone(d.reopen(), 'tasks'), tasks);
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
      expect(d.saved['v'], 3);
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

    List<Map<String, Object?>> tombstones(DayStore store) => [
      for (final j in store.syncBody()['tasks']! as List)
        if ((j as Map)['deletedAt'] != null) j.cast<String, Object?>(),
    ];

    test('a starter missing from a save made before sync is sent as a deletion, 1970 + 1 ms', () async {
      final d = await Day.open(
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 1,
            'dayStamp': '2026-11-19',
            'tasks': [
              {'id': 'mvd-1', 'title': 'Stay hydrated', 'subtitle': '2 glasses left', 'done': false},
              {'id': 'mvd-3', 'title': 'Walk, 20 minutes', 'subtitle': '', 'done': false},
              {'id': 't-x', 'title': 'Email the lab', 'subtitle': '', 'done': false},
            ],
          }),
        },
      );
      expect(d.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-3', 't-x']);
      expect(tombstones(d.store), [
        {
          'id': 'mvd-2',
          'createdAt': '1970-01-01T00:00:00.000Z',
          'updatedAt': '1970-01-01T00:00:00.000Z',
          'deletedAt': '1970-01-01T00:00:00.001Z',
        },
      ]);
      // Written in the new shape at once: a restart doesn't add it again.
      expect(d.saved['v'], 3);
      expect(tombstones(d.reopen()), hasLength(1));
    });

    test('no starter deletions for a new install, a save made with sync, or an old save without the list', () async {
      final fresh = await Day.open();
      expect(tombstones(fresh.store), isEmpty);

      final synced = await Day.open(
        saved: {
          DayStore.storageKey: jsonEncode({
            'v': 2,
            'tasks': [starterTasks().first.toJson()],
          }),
        },
      );
      expect(synced.store.tasks.map((t) => t.id), ['mvd-1']);
      expect(tombstones(synced.store), isEmpty, reason: 'its deletions carry their own tombstones');

      final noList = await Day.open(
        saved: {
          DayStore.storageKey: jsonEncode({'v': 1, 'state': 'green', 'level': 0.2}),
        },
      );
      expect(noList.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-2', 'mvd-3']);
      expect(tombstones(noList.store), isEmpty);
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

    test('erased: Home’s state and level are cleared, unless a newer check-in came with it', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 10));
      d.store.recordCheckin(NervousState.red, 0.9);
      // The erased day still holds an older check-in (made elsewhere after
      // the erase): it is the history now, but it isn't Home's state.
      final followed = d.store.applyServer({
        'gen': 5,
        'erased': true,
        'checkins': [
          {'at': '2026-11-19T09:00:00.000Z', 'state': 'green', 'level': 0.1},
        ],
      });
      expect(followed, isFalse);
      expect(d.store.state, isNull);
      expect(d.store.level, isNull);
      expect(d.store.checkins.single.state, NervousState.green);
      expect(d.reopen().state, isNull, reason: 'saved that way');

      // A check-in newer than any here: Home follows it, erased or not.
      d.store.recordCheckin(NervousState.red, 0.9);
      d.store.applyServer({
        'gen': 6,
        'erased': true,
        'checkins': [
          {'at': '2026-11-19T10:30:00.000Z', 'state': 'yellow', 'level': 0.5},
        ],
      });
      expect(d.store.state, NervousState.yellow);
      expect(d.store.level, 0.5);

      // An erased answer without a history of its own: none here either.
      d.store.applyServer({'gen': 7, 'erased': true});
      expect(d.store.checkins, isEmpty);
      expect(d.store.state, isNull);
    });

    test('the dump: the answer replaces it; a line it never mentions stays; erased replaces all', () async {
      final d = await Day.open(at: DateTime.utc(2026, 11, 19, 10));
      d.store.addDump('mine, refused by the server');
      final mine = d.store.dump.single.id;
      d.store.applyServer({
        'dump': [
          {'id': 'd-web', 'text': 'from the web', 'at': '2026-11-19T09:30:00.000Z', 'deletedAt': null},
          {'id': 'd-gone', 'deletedAt': '2026-11-19T09:00:00.000Z'},
          {'id': 'bad id!', 'text': 'dropped', 'at': '2026-11-19T09:00:00.000Z', 'deletedAt': null},
        ],
      });
      expect(d.store.dump.map((x) => x.id), [mine, 'd-web']);
      expect(
        (d.store.syncBody()['dump']! as List).map((j) => (j as Map)['id']),
        [mine, 'd-web', 'd-gone'],
        reason: 'sent again next time, with the tombstone',
      );
      expect(d.store.localRevision, 1, reason: 'an answer is not a change made here');

      d.store.applyServer({'gen': 9, 'erased': true, 'dump': <Object?>[]});
      expect(d.store.dump, isEmpty);
      expect(d.store.syncBody()['dump'], isEmpty);
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
