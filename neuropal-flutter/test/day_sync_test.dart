// Day sync, the client side of docs/DAY-SYNC.md §8, against in-memory
// servers: what is sent, adopting the answer, throwing it away when the day
// changed in flight, gen / erased, 404 and 401 stopping, the retry ladder
// (with fake timers), the debounce, the connection coming back, and whose
// day it is.

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
      if (request.url.path == '/api/auth/config') {
        return jsonResponse({'localMode': true, 'signup': 'closed'});
      }
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

  test('401: the session ended, so it stops (and sign-in shows)', () async {
    final day = FakeDayServer();
    final server = FakeAccountsServer(routes: {'POST ${DaySync.syncPath}': day.handle});
    final token = server.issue('ryx@example.com');
    final phone = await Device.open(
      server.client(),
      sessions: SessionStore.memory({cloudBase: token}),
    );
    await phone.start();
    expect(day.bodies, hasLength(1));

    server.expireAll();
    phone.store.addTask('After the session ended');
    await phone.timers.fire(DaySync.debounce);
    expect(phone.auth.needsSignIn, isTrue);
    expect(phone.sync.phase, DaySyncPhase.signedOut);
    expect(phone.timers.pending, isEmpty, reason: 'no retries');
    expect(day.bodies, hasLength(1));
    expect(phone.store.tasks.last.title, 'After the session ended');
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
      if (request.url.path == '/api/auth/config') {
        return jsonResponse({'localMode': true, 'signup': 'closed'});
      }
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
        startsWith('Not signed in'),
      );
    });
  });
}
