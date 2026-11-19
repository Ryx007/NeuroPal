// Day sync, the client side of docs/DAY-SYNC.md §8, against in-memory
// servers: what is sent, adopting the answer, throwing it away when the day
// changed in flight, gen / erased, the brain dump, a starter deleted before
// sync, 404 / 401 / other 4xx stopping (a background 401 never signs out; a
// late one for an old token stops nothing), the retry ladder (with fake
// timers), the debounce, the connection coming back, and whose day it is.

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/auth/auth_controller.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/day/day_store.dart';
import 'package:neuropal/day/day_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

/// Timers the test fires by hand.
class FakeTimers {
  final List<FakeTimer> all = [];

  Timer call(Duration delay, void Function() callback) {
    final t = FakeTimer(delay, callback);
    all.add(t);
    return t;
  }

  List<Duration> get pending => [
    for (final t in all)
      if (t.isActive) t.delay,
  ];

  /// Fires the active timer of [delay] and lets its sync run.
  Future<void> fire(Duration delay) async {
    all.lastWhere((t) => t.isActive && t.delay == delay).fire();
    await settle();
  }
}

class FakeTimer implements Timer {
  FakeTimer(this.delay, this._callback);

  final Duration delay;
  final void Function() _callback;
  bool _active = true;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;

  @override
  void cancel() => _active = false;

  void fire() {
    if (!_active) return;
    _active = false;
    _callback();
  }
}

/// Lets every pending request and answer go through.
Future<void> settle() async {
  for (var i = 0; i < 30; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

/// One phone: its preferences, sign-in, day and sync.
class Device {
  Device._(this.prefs, this.backend, this.auth, this.store, this.sync, this.timers);

  final SharedPreferences prefs;
  final Backend backend;
  final AuthController auth;
  final DayStore store;
  final DaySync sync;
  final FakeTimers timers;

  static DateTime now = DateTime.utc(2026, 11, 19, 10);

  static Future<Device> open(
    http.Client client, {
    SessionStore? sessions,
    Map<String, Object> saved = const {},
    bool fresh = true,
  }) async {
    if (fresh) SharedPreferences.setMockInitialValues(saved);
    final prefs = await SharedPreferences.getInstance();
    final store = sessions ?? SessionStore.memory();
    final backend = Backend(prefs: prefs, client: client, sessions: store);
    final auth = AuthController(backend: backend, sessions: store);
    await backend.probe();
    await auth.check();
    final day = DayStore(prefs: prefs, clock: () => now);
    final timers = FakeTimers();
    final sync = DaySync(
      store: day,
      backend: backend,
      auth: auth,
      prefs: prefs,
      timer: timers.call,
    );
    return Device._(prefs, backend, auth, day, sync, timers);
  }

  Future<void> start() async {
    sync.start();
    await settle();
  }
}

/// A single-user (LOCAL_MODE) server with day sync at [day].
http.Client localServer(FakeDayServer day, {List<http.Request>? requests}) =>
    fakeBackend(routes: {'POST ${DaySync.syncPath}': day.handle}, requests: requests);

int syncRequests(List<http.Request> requests) =>
    requests.where((r) => r.url.path == DaySync.syncPath).length;

void main() {
  setUp(() => Device.now = DateTime.utc(2026, 11, 19, 10));

  test('sends every section with tombstones, adopts the answer, keeps gen', () async {
    final server = FakeDayServer()..gen = 2;
    final requests = <http.Request>[];
    final phone = await Device.open(localServer(server, requests: requests));
    phone.store.recordCheckin(NervousState.yellow, 0.4);
    phone.store.removeTask('mvd-2');
    await phone.start();

    expect(syncRequests(requests), 1);
    final body = server.bodies.single;
    expect(body['v'], 1);
    expect(body.containsKey('gen'), isFalse, reason: 'never synced: no gen');
    expect((body['tasks']! as List).map((t) => (t as Map)['id']), ['mvd-1', 'mvd-2', 'mvd-3']);
    expect(((body['tasks']! as List)[1] as Map)['deletedAt'], isNotNull);
    expect(body['dump'], isEmpty, reason: 'the brain dump is part of the day');
    expect(body.containsKey('todos'), isFalse, reason: 'sections this app knows only');
    expect(server.checkins.single['state'], 'yellow');

    expect(phone.store.gen, 2);
    expect(phone.store.owner, isNotNull);
    expect(phone.sync.phase, DaySyncPhase.synced);
    expect(phone.timers.pending, [DaySync.every], reason: 'every 5 minutes');

    // The next sync sends the stored gen back.
    await phone.timers.fire(DaySync.every);
    expect(server.bodies.last['gen'], 2);
  });

  test('two phones: a check-in on one reaches the other, whose state follows', () async {
    final server = FakeDayServer();
    final a = await Device.open(localServer(server));
    a.store.recordCheckin(NervousState.green, 0.2);
    a.store.addAnchor(const AnchorInput(title: 'Lunch', hour: 12, minute: 30));
    await a.start();

    Device.now = DateTime.utc(2026, 11, 19, 11);
    final b = await Device.open(localServer(server));
    await b.start();
    expect(b.store.anchors.single.title, 'Lunch');
    expect(b.store.state, NervousState.green);

    // A newer check-in on B; A follows at its next sync.
    Device.now = DateTime.utc(2026, 11, 19, 11, 30);
    b.store.recordCheckin(NervousState.red, 0.9);
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.store.state, NervousState.red);
    expect(a.store.level, 0.9);
    expect(a.store.checkins.map((c) => c.state), [NervousState.green, NervousState.red]);
  });

  test('a phone clock ahead: the server’s copy of the check-in is the only one', () async {
    // The server's clock is 10 minutes behind this phone's.
    final server = FakeDayServer(
      clock: () => Device.now.subtract(const Duration(minutes: 10)),
    );
    final phone = await Device.open(localServer(server));
    phone.store.recordCheckin(NervousState.yellow, 0.5);
    await phone.start();
    expect(server.checkins, hasLength(1));
    expect(phone.store.checkins.single.at, '2026-11-19T09:50:00.000Z');

    // Later syncs never add it again under the phone's time.
    await phone.timers.fire(DaySync.every);
    await phone.timers.fire(DaySync.every);
    expect(server.checkins, hasLength(1));
    expect((server.bodies.last['checkins']! as List), hasLength(1));
    expect(phone.store.state, NervousState.yellow);
  });

  test('a change while the request is out: the answer is thrown away, then sent again', () async {
    final server = FakeDayServer();
    final hold = Completer<void>();
    var calls = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/healthz') {
        return http.Response(jsonEncode({'status': 'ok'}), 200);
      }
      final auth = localModeAuth['${request.method} ${request.url.path}'];
      if (auth != null) return auth(request);
      calls += 1;
      if (calls == 1) await hold.future;
      return server.handle(request);
    });
    final phone = await Device.open(client);
    phone.sync.start();
    await settle();
    expect(calls, 1, reason: 'the first request is out');

    phone.store.addTask('Made while it was out');
    hold.complete();
    await settle();

    expect(calls, 2, reason: 'synced again at once');
    expect(
      (server.bodies.last['tasks']! as List).map((t) => (t as Map)['title']),
      contains('Made while it was out'),
    );
    expect(phone.store.tasks.last.title, 'Made while it was out');
    expect(server.tasks.values.map((t) => t['title']), contains('Made while it was out'));
  });

  test('erased elsewhere: the answer replaces the day; on again sends no gen', () async {
    final server = FakeDayServer();
    final phone = await Device.open(localServer(server));
    phone.store.recordCheckin(NervousState.green, 0.1);
    await phone.start();
    expect(phone.store.gen, 1);

    server.erase(); // another device: DELETE /api/me/day
    Device.now = DateTime.utc(2026, 11, 19, 10, 30);
    phone.store.addAnchor(const AnchorInput(title: 'Walk', hour: 15, minute: 0));
    await phone.sync.syncNow();
    expect(server.bodies.last['gen'], 1);
    expect(phone.store.anchors, isEmpty, reason: 'erased everywhere');
    expect(phone.store.checkins, isEmpty);
    expect(phone.store.state, isNull);
    expect(phone.store.gen, 2);

    // Switched off while erased elsewhere, then on: a first sync again,
    // so this phone's day is added back instead of lost.
    phone.sync.setEnabled(false);
    expect(phone.sync.phase, DaySyncPhase.off);
    server.erase();
    phone.store.addAnchor(const AnchorInput(title: 'Stretch', hour: 16, minute: 0));
    phone.sync.setEnabled(true);
    await settle();
    expect(server.bodies.last.containsKey('gen'), isFalse);
    expect(server.anchors.values.map((a) => a['title']), contains('Stretch'));
    expect(phone.store.anchors.single.title, 'Stretch');
  });

  test('404: no day sync on this server, so it stops until the next start', () async {
    final requests = <http.Request>[];
    final client = fakeBackend(requests: requests); // knows no day route
    final phone = await Device.open(client);
    await phone.start();
    expect(syncRequests(requests), 1);
    expect(phone.sync.phase, DaySyncPhase.unsupported);
    expect(phone.timers.pending, isEmpty);

    phone.store.addTask('Still saved here');
    phone.sync.onForeground();
    await settle();
    expect(syncRequests(requests), 1, reason: 'not asked again');
    expect(phone.timers.pending, isEmpty, reason: 'no debounce either');

    // The next app start tries again.
    final again = await Device.open(client, fresh: false);
    await again.start();
    expect(syncRequests(requests), 2);
  });

  test('a background 401 stops sync without signing out; the next ordinary request does', () async {
    final day = FakeDayServer();
    final server = FakeAccountsServer(
      routes: {
        'POST ${DaySync.syncPath}': day.handle,
        'GET /api/documents': (_) => jsonResponse(<Object?>[]),
      },
    );
    final token = server.issue('ryx@example.com');
    final phone = await Device.open(
      server.client(),
      sessions: SessionStore.memory({cloudBase: token}),
    );
    await phone.start();
    expect(day.bodies, hasLength(1));

    server.expireAll(); // the 30 days are up
    phone.store.addTask('After the session ended');
    await phone.timers.fire(DaySync.debounce);
    expect(phone.auth.status, AuthStatus.signedIn, reason: 'a sync never signs anyone out');
    expect(phone.auth.needsSignIn, isFalse);
    expect(phone.sync.phase, DaySyncPhase.ended);
    expect(
      daySyncStatusText(phone.sync.phase, now: Device.now, signal: false),
      'Your session ended. Sign in again and your day syncs again. Until then '
      'it’s safe on this phone.',
    );
    expect(phone.timers.pending, isEmpty, reason: 'no retries');

    // Nothing more goes out for that session, whatever happens here.
    phone.store.addTask('Still saved here');
    phone.sync.onForeground();
    await settle();
    expect(phone.timers.pending, isEmpty, reason: 'no debounce either');
    expect(server.authHeaders(DaySync.syncPath), ['Bearer $token', 'Bearer $token']);

    // The next ordinary request ends the session, as it always did.
    await expectLater(phone.backend.getJson('/api/documents'), throwsA(isA<ApiException>()));
    expect(phone.auth.needsSignIn, isTrue);
    expect(phone.sync.phase, DaySyncPhase.signedOut);

    // Signing in again resumes sync, with everything made meanwhile.
    expect(await phone.auth.signIn(email: 'ryx@example.com', password: 'correct horse'), isNull);
    await settle();
    expect(day.bodies, hasLength(2));
    expect(
      day.tasks.values.map((t) => t['title']),
      containsAll(['After the session ended', 'Still saved here']),
    );
    expect(phone.sync.phase, DaySyncPhase.synced);
  });

  test('a late 401 for an old session doesn’t stop the new one', () async {
    final day = FakeDayServer();
    final server = FakeAccountsServer(routes: {'POST ${DaySync.syncPath}': day.handle});
    final old = server.issue('ryx@example.com');
    final phone = await Device.open(
      server.client(),
      sessions: SessionStore.memory({cloudBase: old}),
    );
    // The first sync goes out with the old session and is held...
    final hold = Completer<void>();
    server.holdData = hold;
    phone.sync.start();
    await settle();
    expect(server.authHeaders(DaySync.syncPath), ['Bearer $old']);

    // ...while the person signs out and in again, and the old session
    // expires. Its answer, a 401, comes back only now.
    await phone.auth.signOut();
    expect(await phone.auth.signIn(email: 'ryx@example.com', password: 'correct horse'), isNull);
    server.sessions.remove(old);
    hold.complete();
    await settle();

    expect(phone.sync.phase, DaySyncPhase.synced, reason: 'the 401 was about the old session');
    expect(phone.auth.needsSignIn, isFalse);
    final sent = server.authHeaders(DaySync.syncPath);
    expect(sent, hasLength(2));
    expect(sent.last, isNot('Bearer $old'));
    expect(day.bodies, hasLength(1), reason: 'sent again with the new session');
  });

  test('another 4xx stops until the next start; 408 and 429 retry like a 5xx', () async {
    final requests = <http.Request>[];
    final server = FakeDayServer()..status = 413; // a day too big for one request
    final client = localServer(server, requests: requests);
    final phone = await Device.open(client);
    await phone.start();
    expect(phone.sync.phase, DaySyncPhase.stopped);
    expect(
      daySyncStatusText(phone.sync.phase, now: Device.now, signal: true),
      'Sync stopped: the server refused the day. It tries again the next time '
      'the app starts. Your day is safe on this phone.',
    );
    expect(phone.timers.pending, isEmpty);

    phone.store.addTask('Still saved here');
    phone.sync.onForeground();
    await settle();
    expect(syncRequests(requests), 1, reason: 'sending the same again can’t help');
    expect(phone.timers.pending, isEmpty);

    // The next start tries again.
    server.status = null;
    final again = await Device.open(client, fresh: false);
    await again.start();
    expect(syncRequests(requests), 2);
    expect(again.sync.phase, DaySyncPhase.synced);

    for (final busy in [408, 429]) {
      server.status = busy;
      final next = await Device.open(client, fresh: false);
      await next.start();
      expect(next.sync.phase, DaySyncPhase.failed, reason: '$busy');
      expect(next.timers.pending, [const Duration(seconds: 5)], reason: '$busy');
    }
  });

  test('the brain dump: tombstones go, another phone adopts it, an unmentioned line stays, erased replaces it', () async {
    final server = FakeDayServer();
    final a = await Device.open(localServer(server));
    a.store.addDump('Ask Milena about the SPAD dead time');
    Device.now = Device.now.add(const Duration(seconds: 1));
    a.store.addDump('deleted before the first sync');
    final deleted = a.store.removeDump(a.store.dump.first.id)!;
    final kept = a.store.dump.single.id;
    await a.start();

    final sent = (server.bodies.single['dump']! as List).cast<Map<String, Object?>>();
    expect(sent.map((d) => d['id']), [kept, deleted.id]);
    expect(server.dump[deleted.id], {'id': deleted.id, 'deletedAt': isA<String>()});
    expect(server.dump[kept]!['text'], 'Ask Milena about the SPAD dead time');

    // Another phone gets the line (and the tombstone, never shown).
    final b = await Device.open(localServer(server));
    await b.start();
    expect(b.store.dump.map((d) => d.text), ['Ask Milena about the SPAD dead time']);

    // A line the server refuses (as over a limit) isn't in its answer: it
    // stays on this phone and goes again next time.
    Device.now = Device.now.add(const Duration(minutes: 1));
    a.store.addDump('refused for now');
    final refused = a.store.dump.first.id;
    server.refused.add(refused);
    await a.sync.syncNow();
    expect(a.store.dump.map((d) => d.text), ['refused for now', 'Ask Milena about the SPAD dead time']);
    expect(server.dump.containsKey(refused), isFalse);
    await a.timers.fire(DaySync.every);
    expect((server.bodies.last['dump']! as List).map((d) => (d as Map)['id']), contains(refused));

    // B deletes the shared line: A gets the tombstone.
    b.store.removeDump(b.store.dump.single.id);
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.store.dump.map((d) => d.text), ['refused for now']);

    // Erased elsewhere: the answer replaces everything, no exception.
    server.erase();
    await a.sync.syncNow();
    expect(a.store.dump, isEmpty);
  });

  test('a starter deleted before sync beats an untouched copy, never a real edit', () async {
    final server = FakeDayServer();
    // Other devices hold mvd-2 untouched (1970) and mvd-3 edited for real.
    for (final t in starterTasks()) {
      server.tasks[t.id] = t.toJson();
    }
    server.tasks['mvd-3'] = {
      ...server.tasks['mvd-3']!,
      'title': 'Walk to the lab',
      'updatedAt': '2026-11-19T09:00:00.000Z',
    };
    // This phone's save from before sync has only mvd-1: 2 and 3 were deleted.
    final phone = await Device.open(
      localServer(server),
      saved: {
        DayStore.storageKey: jsonEncode({
          'v': 1,
          'tasks': [
            {'id': 'mvd-1', 'title': 'Stay hydrated', 'subtitle': '2 glasses left', 'done': false},
          ],
        }),
      },
    );
    await phone.start();
    expect(server.tasks['mvd-2']!['deletedAt'], kStarterGoneIso);
    expect(server.tasks['mvd-3']!['deletedAt'], isNull, reason: 'the edit wins');
    expect(phone.store.tasks.map((t) => t.title), ['Stay hydrated', 'Walk to the lab']);
  });

  test('offline or 5xx: retries after 5 s, 30 s, then every 5 minutes', () async {
    final server = FakeDayServer()..status = 503;
    final phone = await Device.open(localServer(server));
    await phone.start();
    expect(phone.sync.phase, DaySyncPhase.failed);
    expect(phone.timers.pending, [const Duration(seconds: 5)]);
    await phone.timers.fire(const Duration(seconds: 5));
    expect(phone.timers.pending, [const Duration(seconds: 30)]);
    await phone.timers.fire(const Duration(seconds: 30));
    expect(phone.timers.pending, [const Duration(minutes: 5)]);
    await phone.timers.fire(const Duration(minutes: 5));
    expect(phone.timers.pending, [const Duration(minutes: 5)]);
    expect(server.bodies, hasLength(4));

    server.status = null; // the server is back
    await phone.timers.fire(const Duration(minutes: 5));
    expect(phone.sync.phase, DaySyncPhase.synced);
    expect(phone.timers.pending, [DaySync.every]);

    // A failure after a success starts the ladder from the bottom again.
    server.status = 500;
    await phone.timers.fire(DaySync.every);
    expect(phone.timers.pending, [const Duration(seconds: 5)]);
  });

  test('a change on this phone syncs 2.5 s after the last one', () async {
    final server = FakeDayServer();
    final phone = await Device.open(localServer(server));
    await phone.start();
    expect(server.bodies, hasLength(1));

    phone.store.recordCheckin(NervousState.green, 0.2);
    phone.store.toggleTask('mvd-1');
    expect(
      phone.timers.pending.where((d) => d == DaySync.debounce),
      hasLength(1),
      reason: 'one timer, restarted by each change',
    );
    expect(server.bodies, hasLength(1));
    await phone.timers.fire(DaySync.debounce);
    expect(server.bodies, hasLength(2));
    expect(server.tasks['mvd-1']!['doneOn'], stampOf(Device.now));
  });

  test('the connection coming back syncs at once', () async {
    final server = FakeDayServer();
    var online = true;
    final client = MockClient((request) async {
      if (!online) throw http.ClientException('Connection refused', request.url);
      if (request.url.path == '/healthz') {
        return http.Response(jsonEncode({'status': 'ok'}), 200);
      }
      final auth = localModeAuth['${request.method} ${request.url.path}'];
      if (auth != null) return auth(request);
      return server.handle(request);
    });
    final phone = await Device.open(client);
    await phone.start();
    expect(server.bodies, hasLength(1));

    online = false;
    phone.store.recordCheckin(NervousState.yellow, 0.5);
    await phone.timers.fire(DaySync.debounce);
    expect(phone.sync.phase, DaySyncPhase.offline);
    expect(phone.backend.state, BackendState.offline);

    online = true;
    await phone.backend.probe();
    await settle();
    expect(server.bodies, hasLength(2));
    expect(server.checkins.single['state'], 'yellow');
    expect(phone.sync.phase, DaySyncPhase.synced);
  });

  test('whose day: another account’s day is cleared before syncing', () async {
    final day = FakeDayServer();
    final server = FakeAccountsServer(
      accounts: {'a@example.com': 'password-a', 'b@example.com': 'password-b'},
      routes: {'POST ${DaySync.syncPath}': day.handle},
    );
    final phone = await Device.open(server.client());
    await phone.start();
    expect(phone.sync.phase, DaySyncPhase.signedOut);
    expect(day.bodies, isEmpty);

    // Made while signed out: joins the first account.
    phone.store.recordCheckin(NervousState.red, 0.9);
    await phone.auth.signIn(email: 'a@example.com', password: 'password-a');
    await settle();
    expect(day.bodies, hasLength(1));
    expect((day.bodies.last['checkins']! as List), hasLength(1));
    final ownerA = phone.store.owner;

    await phone.auth.signOut();
    await settle();
    await phone.auth.signIn(email: 'b@example.com', password: 'password-b');
    await settle();
    expect(phone.store.owner, isNot(ownerA));
    final sentAsB = day.bodies.last;
    expect(sentAsB['checkins'], isEmpty, reason: 'A’s check-ins never reach B');
    expect(sentAsB.containsKey('gen'), isFalse);
  });

  test('the same server at another address is the same account: nothing is cleared', () async {
    final server = FakeDayServer(clock: () => Device.now);
    final reachable = <String>{tailscaleHost};
    final client = MockClient((request) async {
      if (!reachable.contains(request.url.host)) {
        throw http.ClientException('Connection refused', request.url);
      }
      if (request.url.path == '/healthz') {
        return http.Response(jsonEncode({'status': 'ok'}), 200);
      }
      final key = '${request.method} ${request.url.path}';
      if (key == 'POST ${DaySync.syncPath}') return server.handle(request);
      final handler = localModeAuth[key];
      return handler != null ? handler(request) : jsonResponse({'error': 'not found'}, 404);
    });
    final phone = await Device.open(client);
    phone.store.addAnchor(const AnchorInput(title: 'Meds', hour: 8, minute: 0));
    await phone.start();
    expect(server.anchors.values.single['title'], 'Meds');
    final owner = phone.store.owner;

    // Out of reach (a train, flight mode): a check-in, a deletion and a
    // tick wait on the phone.
    reachable.clear();
    Device.now = Device.now.add(const Duration(minutes: 20));
    phone.store.recordCheckin(NervousState.red, 0.9);
    phone.store.removeAnchor(phone.store.anchors.single.id);
    phone.store.setTaskDone('mvd-1', true);
    await phone.timers.fire(DaySync.debounce);

    // Home Wi-Fi with Tailscale off: the same Mac mini at its LAN address.
    reachable.add('192.168.3.169');
    await phone.backend.probe();
    await settle();
    phone.sync.onForeground();
    await settle();
    expect(phone.backend.active?.base, 'http://192.168.3.169:4000');
    expect(phone.store.owner, owner, reason: 'the same account, not another one');
    expect(server.checkins.single['state'], 'red');
    expect(server.anchors.values.single['deletedAt'], isNotNull);
    expect(server.tasks['mvd-1']!['doneOn'], stampOf(Device.now));
    expect(phone.store.state, NervousState.red);
    expect(phone.sync.phase, DaySyncPhase.synced);
  });

  test('a day saved under the first builds’ key (address and account) stays this account’s', () async {
    final server = FakeDayServer();
    final at = isoMs(Device.now);
    final phone = await Device.open(
      localServer(server),
      saved: {
        DayStore.storageKey: jsonEncode({
          'v': 2,
          'owner': legacyAccountKey(tailscaleBase, 'local'),
          'gen': 1,
          'tasks': [for (final t in starterTasks()) t.toJson()],
          'anchors': [
            {
              'id': 'a-1',
              'title': 'Not synced yet',
              'subtitle': '',
              'time': {'hour': 9, 'minute': 0},
              'createdAt': at,
              'updatedAt': at,
              'deletedAt': null,
              'doneOn': null,
              'tickAt': null,
            },
          ],
        }),
      },
    );
    await phone.start();
    expect(phone.store.owner, accountKey('local'));
    expect(server.anchors.values.single['title'], 'Not synced yet');
    expect(phone.store.anchors.single.title, 'Not synced yet');
  });

  test('signing in as someone else while a sync is out: their day loads, and stays theirs', () async {
    final days = <String, FakeDayServer>{};
    late final FakeAccountsServer server;
    server = FakeAccountsServer(
      accounts: {'a@example.com': 'password-a', 'b@example.com': 'password-b'},
      routes: {
        'POST ${DaySync.syncPath}': (request) {
          final token = (request.headers['Authorization'] ?? '').replaceFirst('Bearer ', '');
          return days
              .putIfAbsent(server.sessions[token]!, () => FakeDayServer(clock: () => Device.now))
              .handle(request);
        },
      },
    );
    // B's own day, already on the server from B's other devices.
    final at = isoMs(Device.now);
    days['b@example.com'] = FakeDayServer(clock: () => Device.now)
      ..anchors['a-b'] = {
        'id': 'a-b',
        'title': 'Swim',
        'subtitle': '',
        'time': {'hour': 18, 'minute': 0},
        'createdAt': at,
        'updatedAt': at,
        'deletedAt': null,
        'doneOn': null,
        'tickAt': null,
      };
    final phone = await Device.open(server.client());
    await phone.start();
    await phone.auth.signIn(email: 'a@example.com', password: 'password-a');
    await settle();
    phone.store.recordCheckin(NervousState.green, 0.2);
    await phone.timers.fire(DaySync.debounce);
    expect(days['a@example.com']!.checkins, hasLength(1));

    // A's 5-minute sync goes out and hangs on a slow line, while A signs
    // out and B signs in on this phone.
    final hold = Completer<void>();
    server.holdData = hold;
    await phone.timers.fire(DaySync.every);
    await phone.auth.signOut();
    await phone.auth.signIn(email: 'b@example.com', password: 'password-b');
    await settle();
    expect(phone.store.checkins, isEmpty, reason: 'B never sees A’s day');
    expect(phone.store.state, isNull);
    expect(phone.sync.phase, isNot(DaySyncPhase.synced), reason: 'not “Synced at…” for B yet');

    // B checks in before A's answer comes back; then it does.
    Device.now = Device.now.add(const Duration(minutes: 2));
    phone.store.recordCheckin(NervousState.red, 0.9);
    hold.complete();
    await settle();
    expect(days['b@example.com']!.checkins.single['state'], 'red', reason: 'B’s check-in reached B’s day');
    expect(days['a@example.com']!.checkins, hasLength(1), reason: 'nothing of B’s in A’s day');
    expect(phone.store.anchors.map((a) => a.title), ['Swim'], reason: 'B’s day loaded');
    expect(phone.store.state, NervousState.red);
    expect(phone.sync.phase, DaySyncPhase.synced);
  });

  test('a clock 45 s ahead elsewhere: a tick and a deletion made here still win', () async {
    final server = FakeDayServer(clock: () => Device.now);
    final laptop = isoMs(Device.now.add(const Duration(seconds: 45)));
    server.anchors['a-lap-1'] = {
      'id': 'a-lap-1',
      'title': 'Lab meeting',
      'subtitle': '',
      'time': {'hour': 14, 'minute': 0},
      'createdAt': laptop,
      'updatedAt': laptop,
      'deletedAt': null,
      'doneOn': null,
      'tickAt': laptop, // the laptop un-ticked it, by its own clock
    };
    final phone = await Device.open(localServer(server));
    await phone.start();
    expect(phone.store.anchors.single.title, 'Lab meeting');

    Device.now = Device.now.add(const Duration(seconds: 10));
    phone.store.setAnchorDone('a-lap-1', true);
    await phone.timers.fire(DaySync.debounce);
    expect(server.anchors['a-lap-1']!['doneOn'], stampOf(Device.now), reason: 'the tick holds');

    phone.store.removeAnchor('a-lap-1');
    await phone.timers.fire(DaySync.debounce);
    expect(server.anchors['a-lap-1']!['deletedAt'], isNotNull, reason: 'the deletion holds');
    expect(phone.store.anchors, isEmpty);
  });

  test('/me fails once at start: day sync starts as soon as it answers', () async {
    final day = FakeDayServer(clock: () => Device.now);
    final server = FakeAccountsServer(routes: {'POST ${DaySync.syncPath}': day.handle});
    final token = server.issue('ryx@example.com');
    server.meStatus = 503; // the server is restarting
    final phone = await Device.open(
      server.client(),
      sessions: SessionStore.memory({cloudBase: token}),
    );
    await phone.start();
    expect(phone.auth.status, AuthStatus.signedIn);
    expect(phone.auth.user, isNull);
    expect(day.bodies, isEmpty);

    server.meStatus = null; // fine again a moment later
    phone.store.recordCheckin(NervousState.yellow, 0.5);
    phone.sync.onForeground(); // back to the front
    await settle();
    expect(phone.auth.user?.email, 'ryx@example.com');
    expect(day.checkins.single['state'], 'yellow');
    expect(phone.sync.phase, DaySyncPhase.synced);
  });

  test('sync off: nothing is sent', () async {
    final requests = <http.Request>[];
    final server = FakeDayServer();
    final phone = await Device.open(
      localServer(server, requests: requests),
      saved: {DaySync.prefKey: false},
    );
    await phone.start();
    phone.store.recordCheckin(NervousState.green, 0.1);
    expect(phone.timers.pending, isEmpty);
    expect(syncRequests(requests), 0);
    expect(phone.sync.phase, DaySyncPhase.off);
  });

  group('the Settings status line', () {
    final now = DateTime(2026, 11, 19, 14, 30);
    test('synced today / another day, in the skin’s clock', () {
      expect(
        daySyncStatusText(
          DaySyncPhase.synced,
          syncedAt: DateTime(2026, 11, 19, 14, 5),
          now: now,
          signal: true,
        ),
        'Synced at 14:05',
      );
      expect(
        daySyncStatusText(
          DaySyncPhase.synced,
          syncedAt: DateTime(2026, 11, 19, 14, 5),
          now: now,
          signal: false,
        ),
        'Synced at 2:05 PM',
      );
      expect(
        daySyncStatusText(
          DaySyncPhase.synced,
          syncedAt: DateTime(2026, 11, 18, 9, 0),
          now: now,
          signal: true,
        ),
        'Synced on 18 Nov at 09:00',
      );
    });

    test('offline and signed out say where the day is', () {
      expect(
        daySyncStatusText(DaySyncPhase.offline, now: now, signal: true),
        'Can’t reach the server. Your day is saved on this phone and will '
        'sync later.',
      );
      expect(
        daySyncStatusText(DaySyncPhase.signedOut, now: now, signal: true),
        'Not signed in. Your day stays on this phone and syncs once you sign in.',
      );
    });
  });

  test('a server without day sync: an account switch keeps the day that exists only on this phone', () async {
    final server = FakeAccountsServer(
      accounts: {'a@example.com': 'password-a', 'b@example.com': 'password-b'},
    ); // no day route: the sync answers 404
    final phone = await Device.open(server.client());
    await phone.start();
    expect(await phone.auth.signIn(email: 'a@example.com', password: 'password-a'), isNull);
    await settle();
    expect(phone.sync.phase, DaySyncPhase.unsupported);
    phone.store.recordCheckin(NervousState.red, 0.9);
    phone.store.addDump('A’s only copy of this thought');

    // Someone else signs in on this phone, then A again. Nothing was ever
    // sent anywhere, so nothing needs clearing; the day stays.
    await phone.auth.signOut();
    await settle();
    expect(await phone.auth.signIn(email: 'b@example.com', password: 'password-b'), isNull);
    await settle();
    await phone.auth.signOut();
    await settle();
    expect(await phone.auth.signIn(email: 'a@example.com', password: 'password-a'), isNull);
    await settle();
    expect(phone.store.checkins, hasLength(1));
    expect(phone.store.dump.map((d) => d.text), ['A’s only copy of this thought']);
  });
}
