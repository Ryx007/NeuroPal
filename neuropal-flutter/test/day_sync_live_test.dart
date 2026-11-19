// A live check of day sync against a real NeuroPal backend: two "phones"
// on one account, through the real POST /api/me/day/sync and DELETE
// /api/me/day. Skipped unless NP_TEST_API names the server, e.g. the dev
// API (public sign-in mode, in-memory database, a fresh day each start):
//
//   node neuropal-platform/scripts/qa/dev-api.cjs 4424 &
//   NP_TEST_API=http://127.0.0.1:4424 flutter test test/day_sync_live_test.dart
//
// Plain test(), not testWidgets: widget tests block real HTTP.

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/auth/auth_controller.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/day/day_store.dart';
import 'package:neuropal/day/day_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

final String? api = Platform.environment['NP_TEST_API'];
const email = 'ryx@example.com';
const password = 'neuropal-dev-1';

class Phone {
  Phone(this.backend, this.auth, this.store, this.sync, this.sessions);

  final Backend backend;
  final AuthController auth;
  final DayStore store;
  final DaySync sync;
  final SessionStore sessions;

  static Future<Phone> signIn({Duration clockAhead = Duration.zero}) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final sessions = SessionStore.memory();
    final backend = Backend(
      prefs: prefs,
      client: http.Client(),
      defaults: [BackendCandidate('Dev', api!)],
      sessions: sessions,
    );
    final auth = AuthController(backend: backend, sessions: sessions);
    await backend.probe();
    await auth.check();
    if (auth.status != AuthStatus.open) {
      final failure = await auth.signIn(email: email, password: password);
      expect(failure?.message, isNull, reason: 'the dev account signs in');
    }
    final store = DayStore(
      prefs: prefs,
      clock: () => DateTime.now().add(clockAhead),
    );
    // Timed syncs are not part of this check: timers that never fire.
    final sync = DaySync(
      store: store,
      backend: backend,
      auth: auth,
      prefs: prefs,
      timer: (delay, callback) => Timer(const Duration(days: 1), () {}),
    );
    return Phone(backend, auth, store, sync, sessions);
  }

  Future<void> syncNow() async {
    sync.start();
    await sync.syncNow();
    expect(
      sync.phase,
      DaySyncPhase.synced,
      reason: 'the server answered the sync (${sync.phase})',
    );
  }

  void close() {
    sync.dispose();
    backend.dispose();
  }
}

void main() {
  test(
    'two phones, one account: the day follows; Undo, tombstones, unknown '
    'fields and erase everywhere',
    () async {
      final a = await Phone.signIn();
      final b = await Phone.signIn();
      addTearDown(a.close);
      addTearDown(b.close);

      // Phone A: a check-in, an anchor, a tick, a deleted starter, and an
      // anchor carrying a field this app doesn't use (an Expo icon).
      a.store.recordCheckin(NervousState.yellow, 0.45);
      final lunch = a.store.addAnchor(
        const AnchorInput(title: 'Lunch', hour: 12, minute: 30, flexMinutes: 15),
      )!;
      a.store.setTaskDone('mvd-1', true);
      a.store.removeTask('mvd-3');
      final now = isoMs(DateTime.now());
      a.store.applyServer({
        'anchors': [
          {
            'id': 'a-expo-1',
            'title': 'Evening meds',
            'subtitle': '',
            'time': {'hour': 20, 'minute': 0},
            'icon': 'medication',
            'createdAt': now,
            'updatedAt': now,
            'deletedAt': null,
            'doneOn': null,
            'tickAt': null,
          },
        ],
      });
      await a.syncNow();
      expect(a.store.gen, isNotNull);

      // Phone B: everything arrives, and its state follows A's check-in.
      await b.syncNow();
      expect(b.store.anchors.map((x) => x.title), ['Lunch', 'Evening meds']);
      expect(b.store.anchors.first.flexMinutes, 15);
      expect(b.store.anchors.last.extra['icon'], 'medication');
      expect(b.store.state, NervousState.yellow);
      expect(b.store.isTaskDone(b.store.tasks.first), isTrue);
      expect(b.store.tasks.map((t) => t.id), ['mvd-1', 'mvd-2']);

      // B edits the Expo anchor (its icon must survive) and deletes Lunch;
      // A gets the edit and the tombstone; then A undoes the deletion.
      b.store.updateAnchor(
        'a-expo-1',
        const AnchorInput(title: 'Meds after dinner', hour: 20, minute: 30),
      );
      final gone = b.store.removeAnchor(lunch)!;
      await b.syncNow();
      await a.syncNow();
      expect(a.store.anchors.map((x) => x.title), ['Meds after dinner']);
      expect(a.store.anchors.single.extra['icon'], 'medication');
      await Future<void>.delayed(const Duration(milliseconds: 5));
      b.store.restoreAnchor(gone);
      await b.syncNow();
      await a.syncNow();
      expect(a.store.anchors.map((x) => x.title), ['Lunch', 'Meds after dinner']);

      // A newer check-in on A: B's state follows it.
      await Future<void>.delayed(const Duration(milliseconds: 5));
      a.store.recordCheckin(NervousState.red, 0.9);
      await a.syncNow();
      await b.syncNow();
      expect(b.store.state, NervousState.red);
      expect(b.store.level, 0.9);

      // Erase everywhere (no button in v1; the protocol is complete): A's
      // older gen gets "erased", and A's day is replaced by the empty one.
      final server = a.auth.server!;
      final res = await http.delete(
        Uri.parse('$server/api/me/day'),
        headers: {
          if (a.sessions.tokenFor(server) case final token?)
            'Authorization': 'Bearer $token',
        },
      );
      expect(res.statusCode, 200, reason: res.body);
      final genBefore = a.store.gen!;
      await a.syncNow();
      expect(a.store.gen, greaterThan(genBefore));
      expect(a.store.anchors, isEmpty);
      expect(a.store.checkins, isEmpty);
    },
    skip: api == null ? 'set NP_TEST_API to run against a live backend' : false,
  );

  test(
    'the brain dump: a line made here is on the server and on the other phone; a deletion goes as a tombstone',
    () async {
      final a = await Phone.signIn();
      final b = await Phone.signIn();
      addTearDown(a.close);
      addTearDown(b.close);
      final text = 'Live dump line ${DateTime.now().microsecondsSinceEpoch}';
      a.store.addDump(text);
      a.store.addDump('deleted before it was ever synced');
      final gone = a.store.removeDump(a.store.dump.first.id)!;
      await a.syncNow();

      final day = (await a.backend.getJson('/api/me/day'))! as Map;
      final dump = (day['dump']! as List).cast<Map<Object?, Object?>>();
      expect(dump.where((d) => d['text'] == text), hasLength(1));
      expect(dump.firstWhere((d) => d['id'] == gone.id), {'id': gone.id, 'deletedAt': isA<String>()});

      await b.syncNow();
      expect(b.store.dump.map((d) => d.text), contains(text));
      expect(b.store.dump.map((d) => d.text), isNot(contains('deleted before it was ever synced')));
    },
    skip: api == null ? 'set NP_TEST_API to run against a live backend' : false,
  );

  test(
    'a phone whose clock is 10 minutes ahead: its check-in is stored once',
    () async {
      final fast = await Phone.signIn(clockAhead: const Duration(minutes: 10));
      addTearDown(fast.close);
      await fast.syncNow(); // whatever the server holds now
      final before = ((await fast.backend.getJson('/api/me/day'))! as Map)['checkins']! as List;

      fast.store.recordCheckin(NervousState.green, 0.2);
      await fast.syncNow();
      // The server set it to its own time; the phone now holds that copy.
      final at = fast.store.checkins.last.atMs;
      expect(at, lessThan(DateTime.now().add(const Duration(minutes: 2)).millisecondsSinceEpoch));

      await fast.syncNow();
      await fast.syncNow();
      final after = ((await fast.backend.getJson('/api/me/day'))! as Map)['checkins']! as List;
      expect(after.length, before.length + 1, reason: 'never added again');
      expect(fast.store.checkins.length, after.length);
    },
    skip: api == null ? 'set NP_TEST_API to run against a live backend' : false,
  );
}
