// Day sync, the client side of docs/DAY-SYNC.md §8: the day follows the
// person across devices. The server is the only merger; this phone sends
// everything it has for the sections it knows (anchors, tasks, the brain
// dump, check-ins, tombstones included) and replaces its copy with the
// merged answer.
//
// WHEN: only while signed in (or on a server without accounts) and with
// "Keep my day in sync" on — at start, back in the foreground, 2.5 s after
// the last change on this phone, when the connection comes back, and every
// 5 minutes while the app is in front.
//
// FAILURES never interrupt the person: offline, a 5xx, 408 or 429 retries
// after 5 s, 30 s, then every 5 minutes. 401 (the session ended) stops
// until there is a new session — only when it answers the session that is
// current when it comes back (a late 401 for an old token stops nothing),
// and without signing anyone out: a sync is a background request, and the
// next ordinary request ends the session (lib/data/backend.dart). 404 (a
// server without day sync) and any other 4xx (the server refused the day;
// sending it again can't help) stop until the next start. The only place
// any of this shows is the status line under the Settings switch.
//
// WHOSE DAY IT IS: the day remembers the account it last synced as — the
// server-issued user id, never the address. A day that never synced joins
// the first account; a day of account A is cleared before anything is
// synced as account B, as soon as B is signed in.

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

  /// No session.
  signedOut,

  /// The server said 401 to the session this phone holds: it ended. Sync
  /// waits for a new one (signing in again).
  ended,

  /// Signed in, nothing synced yet.
  waiting,
  syncing,
  synced,

  /// No answer from the server (offline, timed out).
  offline,

  /// The server answered with an error worth retrying (5xx, 408, 429, a
  /// reply that can't be read).
  failed,

  /// This server has no day sync (404).
  unsupported,

  /// The server refused the day (any other 4xx): stopped until the next
  /// start.
  stopped,
}

/// The session a 401 answered: sync stays stopped while it is the one
/// this phone holds for that server.
class _EndedSession {
  const _EndedSession(this.server, this.token);

  final String server;

  /// Null for a server that took requests without one.
  final String? token;
}

/// One account, as an opaque key: the day stores it to know whose it is,
/// without keeping the account's id in the clear. It is made from the
/// server-issued user id alone, never the address: the app moves between
/// addresses of the same server by itself (the Mac mini over Tailscale or
/// the home Wi-Fi), and a new address must not look like another person.
/// (Not cryptographic; it only has to tell accounts apart.)
String accountKey(String userId) => _opaqueKey(userId);

/// The key the first day-sync builds stored: the address and the account
/// together. Only read, to recognise a day they saved as this account's.
String legacyAccountKey(String server, String who) => _opaqueKey('$server|$who');

String _opaqueKey(String text) {
  int fnv(int seed) {
    var h = seed;
    for (final unit in text.codeUnits) {
      h ^= unit;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    return h;
  }

  return '${fnv(0x811C9DC5).toRadixString(36)}-${fnv(0x2B2D5A7F).toRadixString(36)}';
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

  /// Accounts (account keys) whose day the server refused with another
  /// 4xx: no day sync for them until the next start.
  final Set<String> _stopped = {};

  /// The session a 401 ended, until another one is saved.
  _EndedSession? _ended;

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

  /// The account the day would sync as right now: the server-issued user id
  /// (in LOCAL_MODE the local user's, from /api/auth/me too), as a key. Null
  /// while signed out, or while the server hasn't said who this is yet.
  String? get account {
    switch (auth.status) {
      case AuthStatus.open:
      case AuthStatus.signedIn:
        final id = auth.user?.id ?? '';
        return id.isEmpty ? null : accountKey(id);
      case AuthStatus.unknown:
      case AuthStatus.signedOut:
        return null;
    }
  }

  DaySyncPhase get phase {
    if (!_enabled) return DaySyncPhase.off;
    if (auth.status == AuthStatus.signedOut) return DaySyncPhase.signedOut;
    if (_sessionEnded) return DaySyncPhase.ended;
    final server = auth.server;
    if (server != null && _unsupported.contains(server)) {
      return DaySyncPhase.unsupported;
    }
    final acct = account;
    if (acct != null && _stopped.contains(acct)) return DaySyncPhase.stopped;
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

  /// A 401 answered the session this phone still holds for the server in
  /// use (a new sign-in, or another server, lifts it).
  bool get _sessionEnded {
    final e = _ended;
    return e != null &&
        auth.server == e.server &&
        backend.sessions.tokenFor(e.server) == e.token;
  }

  /// Still the same situation the request was sent in?
  bool _live(String acct) =>
      !_disposed && _started && _enabled && account == acct;

  /// A status that says sending the same day again can't help: any 4xx but
  /// 401 and 404 (handled apart), 408 and 429 (busy: retried like a 5xx).
  static bool _refused(int? status) =>
      status != null &&
      status >= 400 &&
      status < 500 &&
      status != 401 &&
      status != 404 &&
      status != 408 &&
      status != 429;

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
    if (acct == null && auth.userUnknown && !auth.checking) {
      // Signed in, but the server's /me never answered (it was restarting,
      // or the line dropped): ask again. Its answer wakes _onAuth, which
      // syncs as soon as the account is known.
      unawaited(auth.check());
    }
    if (acct == null || server == null) return;
    if (!_mayTry) return;
    _nextTimer?.cancel();
    _nextTimer = null;
    _notify();

    // Whose day it is: never send one account's day to another.
    _ownDay(acct);

    final revision = store.localRevision;
    // The session this request carries (the backend sends this server's
    // own): a 401 says something only about that one.
    final token = backend.sessions.tokenFor(server);
    try {
      final reply = await backend.postJson(
        syncPath,
        store.syncBody(),
        server: server,
        timeout: requestTimeout,
        background: true,
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
      final status = e.status;
      if (status == 404) {
        _unsupported.add(server);
        _problem = null;
      } else if (status == 401) {
        if (backend.sessions.tokenFor(server) != token) {
          // A late 401 for a session that has since been replaced: it says
          // nothing about the new one, which simply sends again.
          _again = true;
        } else {
          // The session ended. Nobody is signed out from here: the next
          // ordinary request does that, and a new sign-in resumes sync.
          _ended = _EndedSession(server, token);
          _problem = null;
        }
      } else if (_refused(status)) {
        _stopped.add(acct);
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

  /// Whose day it is (§8): a day that never synced joins [acct]; a day last
  /// synced as another account is cleared (with its gen) before anything
  /// goes out as [acct].
  void _ownDay(String acct) {
    final owner = store.owner;
    if (owner == acct) return;
    if (owner == null || _isLegacyKeyOf(owner)) {
      store.claim(acct);
    } else {
      store.resetFor(acct);
    }
  }

  /// A day saved by the first day-sync builds is keyed on the address and
  /// the account together: it is this account's when that key matches one
  /// of this server's addresses (never a reason to clear it).
  bool _isLegacyKeyOf(String owner) {
    final user = auth.user;
    if (user == null) return false;
    final email = (user.email ?? '').trim().toLowerCase();
    final who = {
      if (user.id.isNotEmpty) user.id,
      if (email.isNotEmpty) email,
      if (auth.status == AuthStatus.open) 'local',
    };
    final servers = {for (final c in backend.candidates) c.base, ?auth.server};
    for (final server in servers) {
      for (final w in who) {
        if (legacyAccountKey(server, w) == owner) return true;
      }
    }
    return false;
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

  /// Signed in, on a server with day sync, not stopped by a 401 or a
  /// refused day.
  bool get _mayTry {
    final acct = account;
    final server = auth.server;
    return acct != null &&
        server != null &&
        !_unsupported.contains(server) &&
        !_stopped.contains(acct) &&
        !_sessionEnded;
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
    // A new session (signed in again, or a refreshed token) after a 401:
    // sync resumes.
    final resumed = _ended != null && !_sessionEnded;
    if (resumed) _ended = null;
    if (acct != _lastAccount) {
      _lastAccount = acct;
      _failures = 0;
      _problem = null;
      // A request still out belongs to the account before: its answer is
      // dropped (_live), and this account's sync must follow it (the kick
      // below only joins the running one).
      if (_inflight != null) _again = true;
      if (acct == null) {
        _nextTimer?.cancel();
        _nextTimer = null;
      } else {
        // Whose day it is, at once: this account never sees the last one's
        // day, and nothing done from now on is cleared by a later sync.
        if (_enabled) _ownDay(acct);
        _kick();
      }
    } else if (resumed && acct != null) {
      _failures = 0;
      _kick();
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
      return 'Not signed in. Your day stays on this phone and syncs once '
          'you sign in.';
    case DaySyncPhase.ended:
      return 'Your session ended. Sign in again and your day syncs again. '
          'Until then it’s safe on this phone.';
    case DaySyncPhase.stopped:
      return 'Sync stopped: the server refused the day. It tries again the '
          'next time the app starts. Your day is safe on this phone.';
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
