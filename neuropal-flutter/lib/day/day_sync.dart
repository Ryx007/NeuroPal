// Day sync, the client side of docs/DAY-SYNC.md §8: the day follows the
// person across devices. The server is the only merger; this phone sends
// everything it has for the sections it knows (anchors, tasks, check-ins,
// tombstones included) and replaces its copy with the merged answer.
//
// WHEN: only while signed in (or on a server without accounts) and with
// "Keep my day in sync" on — at start, back in the foreground, 2.5 s after
// the last change on this phone, when the connection comes back, and every
// 5 minutes while the app is in front.
//
// FAILURES never interrupt the person: offline or a 5xx retries after 5 s,
// 30 s, then every 5 minutes; 401 (the session ended) stops; 404 (a server
// without day sync) stops until the next start. The only place any of this
// shows is the status line under the Settings switch.
//
// WHOSE DAY IT IS: the day remembers the account it last synced as. A day
// that never synced joins the first account; a day of account A is cleared
// before anything is synced as account B.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/auth_controller.dart';
import '../data/backend.dart';
import 'day_rules.dart';
import 'day_store.dart';

/// Makes the timers sync runs on (tests pass a fake one).
typedef DayTimerFactory =
    Timer Function(Duration delay, void Function() callback);

enum DaySyncPhase {
  /// The Settings switch is off.
  off,

  /// No session (or the server said 401).
  signedOut,

  /// Signed in, nothing synced yet.
  waiting,
  syncing,
  synced,

  /// No answer from the server (offline, timed out).
  offline,

  /// The server answered with an error (5xx, a reply that can't be read).
  failed,

  /// This server has no day sync (404).
  unsupported,
}

/// One account on one server, as an opaque key: the day stores it to know
/// whose it is, without keeping the account's id or email in the clear.
/// (Not cryptographic; it only has to tell accounts apart.)
String accountKey(String server, String who) {
  int fnv(String text, int seed) {
    var h = seed;
    for (final unit in text.codeUnits) {
      h ^= unit;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    return h;
  }

  final text = '$server|$who';
  return '${fnv(text, 0x811C9DC5).toRadixString(36)}-'
      '${fnv(text, 0x2B2D5A7F).toRadixString(36)}';
}

class DaySync extends ChangeNotifier {
  DaySync({
    required this.store,
    required this.backend,
    required this.auth,
    required SharedPreferences prefs,
    DayTimerFactory? timer,
  }) : _prefs = prefs,
       _timer = timer ?? Timer.new {
    _enabled = prefs.getBool(prefKey) ?? true;
  }

  static const prefKey = 'np.day.sync';
  static const syncPath = '/api/me/day/sync';
  static const debounce = Duration(milliseconds: 2500);
  static const every = Duration(minutes: 5);
  static const ladder = [
    Duration(seconds: 5),
    Duration(seconds: 30),
    Duration(minutes: 5),
  ];
  static const requestTimeout = Duration(seconds: 20);

  final DayStore store;
  final Backend backend;
  final AuthController auth;
  final SharedPreferences _prefs;
  final DayTimerFactory _timer;

  late bool _enabled;
  bool _started = false;
  bool _foreground = true;
  bool _disposed = false;

  Future<void>? _inflight;
  bool _again = false;
  int _failures = 0;
  DaySyncPhase? _problem;

  /// Servers that answered 404: no day sync there until the next start.
  final Set<String> _unsupported = {};

  /// A 401 for this account (and auth status): stop until either changes.
  String? _blockedAccount;
  AuthStatus? _blockedStatus;

  Timer? _debounceTimer;
  Timer? _nextTimer;
  int _seenRevision = 0;
  BackendState? _lastSettled;
  String? _lastAccount;

  /// "Keep my day in sync" (on by default).
  bool get enabled => _enabled;
  bool get syncing => _inflight != null;

  /// When the last answer was applied (from any run of the app).
  DateTime? get syncedAt => store.syncedAt;

  /// The account the day would sync as right now, or null (signed out, or
  /// the server hasn't said who this is yet).
  String? get account {
    final server = auth.server;
    if (server == null) return null;
    switch (auth.status) {
      case AuthStatus.open:
        return accountKey(server, 'local');
      case AuthStatus.signedIn:
        final user = auth.user;
        if (user == null) return null;
        final who = user.id.isNotEmpty
            ? user.id
            : (user.email ?? '').trim().toLowerCase();
        return who.isEmpty ? null : accountKey(server, who);
      case AuthStatus.unknown:
      case AuthStatus.signedOut:
        return null;
    }
  }

  DaySyncPhase get phase {
    if (!_enabled) return DaySyncPhase.off;
    if (auth.status == AuthStatus.signedOut || _isBlocked(account)) {
      return DaySyncPhase.signedOut;
    }
    final server = auth.server;
    if (server != null && _unsupported.contains(server)) {
      return DaySyncPhase.unsupported;
    }
    final problem = _problem;
    if (problem != null) return problem;
    if (syncing && syncedAt == null) return DaySyncPhase.syncing;
    if (account == null && backend.state == BackendState.offline) {
      return DaySyncPhase.offline;
    }
    return syncedAt != null ? DaySyncPhase.synced : DaySyncPhase.waiting;
  }

  /// Turns sync on or off. On again counts as a first sync (DAY-SYNC §8):
  /// the stored `gen` is forgotten, so a day erased elsewhere meanwhile is
  /// added back instead of lost.
  void setEnabled(bool on) {
    if (on == _enabled) return;
    _enabled = on;
    unawaited(_prefs.setBool(prefKey, on));
    if (on) {
      store.forgetGen();
      _failures = 0;
      _problem = null;
      _kick();
    } else {
      _cancelTimers();
    }
    _notify();
  }

  // ---- lifecycle -------------------------------------------------------------

  /// Starts listening and syncs once (the app start).
  void start() {
    if (_started || _disposed) return;
    _started = true;
    _seenRevision = store.localRevision;
    final state = backend.state;
    _lastSettled = state == BackendState.checking ? null : state;
    _lastAccount = account;
    store.addListener(_onStore);
    backend.addListener(_onBackend);
    auth.addListener(_onAuth);
    _kick();
  }

  void stop() {
    if (!_started) return;
    _started = false;
    store.removeListener(_onStore);
    backend.removeListener(_onBackend);
    auth.removeListener(_onAuth);
    _cancelTimers();
  }

  /// The app came to the front: sync now, and every 5 minutes from here.
  void onForeground() {
    _foreground = true;
    _kick();
  }

  /// The app went to the back: no more timed syncs until it returns (a
  /// change made just before still goes out after its debounce).
  void onBackground() {
    _foreground = false;
    _nextTimer?.cancel();
    _nextTimer = null;
  }

  /// One sync now, or the one already running (its answer is fresh; a
  /// change made meanwhile sends another by itself). Completes when it is
  /// done; never throws.
  Future<void> syncNow() {
    final running = _inflight;
    if (running != null) return running;
    final done = Completer<void>();
    _inflight = done.future;
    unawaited(_run().whenComplete(done.complete));
    return done.future;
  }

  void _kick() {
    if (_started && _enabled && !_disposed) unawaited(syncNow());
  }

  // ---- one sync ----------------------------------------------------------------

  bool _isBlocked(String? acct) =>
      acct != null && acct == _blockedAccount && auth.status == _blockedStatus;

  /// Still the same situation the request was sent in?
  bool _live(String acct) =>
      !_disposed && _started && _enabled && account == acct;

  Future<void> _run() async {
    try {
      await _attempt();
    } finally {
      _inflight = null;
      _notify();
      if (_again && !_disposed) {
        _again = false;
        _kick();
      }
    }
  }

  Future<void> _attempt() async {
    if (_disposed || !_started || !_enabled) return;
    final acct = account;
    final server = auth.server;
    if (acct == null || server == null) return;
    if (_unsupported.contains(server) || _isBlocked(acct)) return;
    _nextTimer?.cancel();
    _nextTimer = null;
    _notify();

    // Whose day it is: never send one account's day to another.
    final owner = store.owner;
    if (owner == null) {
      store.claim(acct);
    } else if (owner != acct) {
      store.resetFor(acct);
    }

    final revision = store.localRevision;
    try {
      final reply = await backend.postJson(
        syncPath,
        store.syncBody(),
        server: server,
        timeout: requestTimeout,
      );
      if (!_live(acct)) return;
      if (store.localRevision != revision) {
        // Changed on this phone while the request was out: this answer is
        // already old. Throw it away and send again.
        _again = true;
        return;
      }
      if (reply is! Map) throw const FormatException('not an object');
      store.applyServer(reply.cast<String, Object?>());
      _seenRevision = store.localRevision;
      _failures = 0;
      _problem = null;
      _schedule(every);
    } on ApiException catch (e) {
      if (!_live(acct)) return;
      if (e.status == 404) {
        _unsupported.add(server);
        _problem = null;
      } else if (e.status == 401) {
        _blockedAccount = acct;
        _blockedStatus = auth.status;
        _problem = null;
      } else {
        _fail(e.unreachable ? DaySyncPhase.offline : DaySyncPhase.failed);
      }
    } on Object catch (e) {
      // A reply that can't be read. (Only the kind of error is logged:
      // never the day's content.)
      debugPrint('Day sync: unreadable answer (${e.runtimeType})');
      if (_live(acct)) _fail(DaySyncPhase.failed);
    }
  }

  void _fail(DaySyncPhase problem) {
    _failures += 1;
    _problem = problem;
    _schedule(ladder[math.min(_failures, ladder.length) - 1]);
  }

  void _schedule(Duration delay) {
    _nextTimer?.cancel();
    _nextTimer = null;
    if (!_foreground || !_started || !_enabled) return;
    _nextTimer = _timer(delay, () {
      _nextTimer = null;
      _kick();
    });
  }

  void _cancelTimers() {
    _debounceTimer?.cancel();
    _debounceTimer = null;
    _nextTimer?.cancel();
    _nextTimer = null;
  }

  // ---- what we listen to -------------------------------------------------------

  /// Signed in, on a server with day sync, not stopped by a 401.
  bool get _mayTry {
    final acct = account;
    final server = auth.server;
    return acct != null &&
        server != null &&
        !_unsupported.contains(server) &&
        !_isBlocked(acct);
  }

  void _onStore() {
    if (store.localRevision == _seenRevision) return; // a sync answer
    _seenRevision = store.localRevision;
    // Signed out, the change simply waits: signing in sends everything.
    if (!_started || !_enabled || !_mayTry) return;
    _debounceTimer?.cancel();
    _debounceTimer = _timer(debounce, () {
      _debounceTimer = null;
      _kick();
    });
  }

  void _onBackend() {
    final state = backend.state;
    if (state == BackendState.checking) return;
    // Back after being offline (not a routine re-check of a server that
    // was answering all along).
    final back =
        state == BackendState.online && _lastSettled == BackendState.offline;
    _lastSettled = state;
    if (back) {
      _failures = 0;
      _kick();
    }
    _notify();
  }

  void _onAuth() {
    final acct = account;
    if (acct != _lastAccount) {
      _lastAccount = acct;
      _failures = 0;
      _problem = null;
      if (acct == null) {
        _nextTimer?.cancel();
        _nextTimer = null;
      } else {
        _kick();
      }
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    stop();
    _disposed = true;
    super.dispose();
  }
}

/// The one status line under the Settings switch.
String daySyncStatusText(
  DaySyncPhase phase, {
  DateTime? syncedAt,
  required DateTime now,
  required bool signal,
}) {
  switch (phase) {
    case DaySyncPhase.off:
      return 'Off. Your day stays on this phone.';
    case DaySyncPhase.signedOut:
      return 'Not signed in. Your day stays on this phone.';
    case DaySyncPhase.waiting:
      return 'Not synced yet.';
    case DaySyncPhase.syncing:
      return 'Syncing…';
    case DaySyncPhase.offline:
      return 'Can’t reach the server. Your day is saved on this phone and '
          'will sync later.';
    case DaySyncPhase.failed:
      return 'Sync didn’t work this time. Your day is saved on this phone '
          'and will sync later.';
    case DaySyncPhase.unsupported:
      return 'This server doesn’t sync days yet. Your day stays on this '
          'phone.';
    case DaySyncPhase.synced:
      final at = syncedAt?.toLocal();
      if (at == null) return 'Not synced yet.';
      final clock = clockText(at.hour, at.minute, signal: signal);
      return sameDay(at, now.toLocal())
          ? 'Synced at $clock'
          : 'Synced on ${shortDate(at)} at $clock';
  }
}
