// Test doubles: a scriptable speech engine, in-memory backends (a
// single-user LOCAL_MODE one, and one with accounts), the day-sync server,
// an upload server that reads the body as it streams, and a file picker
// and a phone dialer the test drives.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/calm/help_lines.dart';
import 'package:neuropal/data/settings_controller.dart';
import 'package:neuropal/library/document_picker.dart';
import 'package:neuropal/reader/speech_engine.dart';

/// The default backend addresses, as hosts and base URLs.
const cloudHost = 'api.ryx007.work';
const cloudBase = 'https://api.ryx007.work';
const tailscaleHost = 'ryx-mac-mini.tail73ed8.ts.net';
const tailscaleBase = 'http://ryx-mac-mini.tail73ed8.ts.net:4000';

/// A speech engine the test drives by hand: it records what it was asked
/// to say, and the test fires the engine's events (start, ranges, done).
class FakeSpeechEngine extends SpeechEngine {
  final List<String> spoken = [];
  int stops = 0;
  double? rate;
  double? pitch;
  VoiceChoice? voice;
  List<TtsVoice> voiceList = const [
    TtsVoice(name: 'en-us-x-iol-local', locale: 'en-US', quality: 'very high'),
    TtsVoice(name: 'it-it-x-kda-local', locale: 'it-IT', quality: 'high'),
  ];

  String get last => spoken.last;

  @override
  Future<void> init() async {}

  @override
  Future<void> setRate(double rate) async => this.rate = rate;

  @override
  Future<void> setPitch(double pitch) async => this.pitch = pitch;

  @override
  Future<void> setVoice(VoiceChoice? voice) async => this.voice = voice;

  @override
  Future<void> speak(String text) async => spoken.add(text);

  @override
  Future<void> stop() async => stops++;

  @override
  Future<List<TtsVoice>> voices() async => voiceList;

  // ---- events, fired by the test ----
  void fireStart() => onStart?.call();
  void fireComplete() => onComplete?.call();
  void fireRange(int start, int end, {String? text}) =>
      onProgress?.call(text ?? last, start, end);
  void fireError(String message) => onError?.call(message);
}

/// The JSON answer the backend's /healthz gives.
final _healthy = jsonEncode({'status': 'ok', 'uptime': 12.5});

/// Answers one request (a route of a fake server).
typedef Handler = http.Response Function(http.Request);

/// What a single-user LOCAL_MODE server (the Mac mini) answers on the
/// sign-in routes. Unless a test routes /api/auth/* itself, [fakeBackend]
/// is such a server, so no sign-in is ever needed.
final Map<String, Handler> localModeAuth = {
  'GET /api/auth/config': (_) =>
      jsonResponse({'localMode': true, 'signup': 'closed'}),
  'GET /api/auth/me': (_) =>
      jsonResponse({'id': 'local', 'email': 'local@neuropal.app', 'name': 'Ryx'}),
};

/// A MockClient that serves [routes] (path → handler) on [reachableHosts]
/// and refuses connections to every other host. [requests] (if given)
/// records every request that reached a host.
http.Client fakeBackend({
  Set<String> reachableHosts = const {tailscaleHost},
  Map<String, Handler> routes = const {},
  Duration delay = Duration.zero,
  List<http.Request>? requests,
}) {
  return MockClient((request) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    if (!reachableHosts.contains(request.url.host)) {
      throw http.ClientException('Connection refused', request.url);
    }
    requests?.add(request);
    if (request.url.path == '/healthz') return http.Response(_healthy, 200);
    final key = '${request.method} ${request.url.path}';
    final handler = routes[key] ?? localModeAuth[key];
    if (handler != null) return handler(request);
    return http.Response(jsonEncode({'error': 'not found: $key'}), 404);
  });
}

/// An in-memory NeuroPal server WITH accounts (LOCAL_MODE off), like the
/// cloud server: every /api route except config/login/register needs a
/// valid `Authorization: Bearer` token (401 otherwise), as in
/// neuropal-backend/src/middleware/auth.js.
class FakeAccountsServer {
  FakeAccountsServer({
    this.signup = 'invite',
    this.inviteCode = 'open-sesame',
    Map<String, String>? accounts,
    this.routes = const {},
  }) : accounts = accounts ?? {'ryx@example.com': 'correct horse'};

  /// 'invite' | 'open' | 'closed' (GET /api/auth/config).
  final String signup;
  final String inviteCode;

  /// email → password.
  final Map<String, String> accounts;

  /// The data routes, served only with a valid session.
  final Map<String, Handler> routes;

  /// Valid session tokens → email.
  final Map<String, String> sessions = {};

  /// Every request that reached the server.
  final List<http.Request> requests = [];

  /// When set, /api/auth/me hands back this new token (a sliding session).
  String? refreshTo;

  /// When set, logins answer 429 with this many seconds to wait.
  int? lockedForSec;

  /// When set, /api/auth/me answers with this status (server trouble).
  int? meStatus;

  /// When set, /api/auth/me waits for it before answering (a slow server).
  Completer<void>? holdMe;

  int _issued = 0;

  /// A valid session for [email], as the server would sign it.
  String issue(String email) {
    final token = 'tok-${++_issued}';
    sessions[token] = email;
    return token;
  }

  /// Every session expires at once (e.g. the 30 days are up).
  void expireAll() => sessions.clear();

  /// The Authorization header of every request to [path].
  List<String?> authHeaders(String path) => [
    for (final r in requests)
      if (r.url.path == path) r.headers['Authorization'],
  ];

  http.Client client({Set<String> reachableHosts = const {cloudHost}}) {
    return MockClient((request) async {
      if (!reachableHosts.contains(request.url.host)) {
        throw http.ClientException('Connection refused', request.url);
      }
      requests.add(request);
      if (request.url.path == '/healthz') return http.Response(_healthy, 200);
      final key = '${request.method} ${request.url.path}';
      switch (key) {
        case 'GET /api/auth/config':
          return jsonResponse({'localMode': false, 'signup': signup});
        case 'POST /api/auth/login':
          return _login(request);
        case 'POST /api/auth/register':
          return _register(request);
      }
      final header = request.headers['Authorization'] ?? '';
      final email = sessions[header.replaceFirst('Bearer ', '')];
      if (!header.startsWith('Bearer ') || email == null) {
        return jsonResponse({'error': 'Invalid or expired token'}, 401);
      }
      if (key == 'GET /api/auth/me') {
        if (holdMe != null) await holdMe!.future;
        if (meStatus != null) {
          return jsonResponse({'error': 'server trouble'}, meStatus!);
        }
        final fresh = refreshTo;
        if (fresh != null) sessions[fresh] = email;
        return jsonResponse({..._user(email), 'token': ?fresh});
      }
      final handler = routes[key];
      if (handler != null) return handler(request);
      return jsonResponse({'error': 'not found: $key'}, 404);
    });
  }

  Map<String, Object?> _user(String email) => {
    'id': 'u-$email',
    'email': email,
    'name': 'Ryx',
  };

  Map<String, Object?> _body(http.Request request) =>
      (jsonDecode(request.body) as Map).cast<String, Object?>();

  http.Response _login(http.Request request) {
    if (lockedForSec != null) {
      return jsonResponse({
        'error':
            'Too many wrong passwords for this account — try again in 15 minutes',
        'retryAfterSec': lockedForSec,
      }, 429);
    }
    final body = _body(request);
    final email = (body['email'] as String? ?? '').toLowerCase().trim();
    if (accounts[email] == null || accounts[email] != body['password']) {
      return jsonResponse({'error': 'invalid email or password'}, 401);
    }
    return jsonResponse({'token': issue(email), 'user': _user(email)});
  }

  http.Response _register(http.Request request) {
    final body = _body(request);
    if (signup == 'closed') {
      return jsonResponse({'error': 'Sign-up is closed on this server'}, 403);
    }
    if (signup == 'invite' && body['inviteCode'] != inviteCode) {
      return jsonResponse({'error': 'That invite code is not right'}, 403);
    }
    final email = (body['email'] as String? ?? '').toLowerCase().trim();
    final password = body['password'] as String? ?? '';
    if (password.length < 8) {
      return jsonResponse({
        'error': 'password must be at least 8 characters',
      }, 400);
    }
    if (accounts.containsKey(email)) {
      return jsonResponse({'error': 'email already registered'}, 409);
    }
    accounts[email] = password;
    return jsonResponse({'token': issue(email), 'user': _user(email)}, 201);
  }
}

/// A client for which every host is unreachable.
http.Client offlineBackend() => MockClient(
  (request) async => throw http.ClientException('Connection refused', request.url),
);

http.Response jsonResponse(Object? body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

// ---- day sync -----------------------------------------------------------------

/// An in-memory `POST /api/me/day/sync` (docs/DAY-SYNC.md §5–§7), merging
/// the way the server does: per item, the definition with the later
/// `updatedAt` wins whole, the later tick wins, the later `deletedAt` wins
/// and a deleted item is a tombstone without content; check-ins are the
/// union by `at` with the 60-second rule, and one stamped later than the
/// server's clock + 60 s is stored at the server's clock (a phone whose
/// clock is ahead); a lower `gen` means "erased elsewhere": nothing is
/// merged and the answer says `erased: true`. Fields the server doesn't
/// know are dropped, as the real one does.
class FakeDayServer {
  FakeDayServer({DateTime Function()? clock}) : clock = clock ?? DateTime.now;

  /// The server's own clock.
  final DateTime Function() clock;
  int gen = 1;
  int rev = 0;
  final Map<String, Map<String, Object?>> anchors = {};
  final Map<String, Map<String, Object?>> tasks = {};
  List<Map<String, Object?>> checkins = [];

  /// Every body received.
  final List<Map<String, Object?>> bodies = [];

  /// When set, every request is answered with this status instead.
  int? status;

  static const _anchorFields = {
    'title', 'subtitle', 'time', 'flexMinutes', 'category', 'icon', 'location', //
  };
  static const _taskFields = {'title', 'subtitle'};

  http.Response handle(http.Request request) {
    final body = (jsonDecode(request.body) as Map).cast<String, Object?>();
    bodies.add(body);
    final scripted = status;
    if (scripted != null) return jsonResponse({'error': 'scripted'}, scripted);
    final sentGen = body['gen'];
    final erased = sentGen is num && sentGen < gen;
    if (!erased) {
      _mergeAll(anchors, body['anchors'], _anchorFields);
      _mergeAll(tasks, body['tasks'], _taskFields);
      _mergeCheckins(body['checkins']);
      rev += 1;
    }
    return jsonResponse(answer(erased: erased));
  }

  /// DELETE /api/me/day: empties the day and adds 1 to `gen`.
  void erase() {
    anchors.clear();
    tasks.clear();
    checkins = [];
    gen += 1;
  }

  Map<String, Object?> answer({bool erased = false}) {
    int ms(Object? iso) => DateTime.parse(iso! as String).millisecondsSinceEpoch;
    int minutes(Map<String, Object?> a) {
      final t = a['time'];
      return t is Map ? (t['hour'] as int) * 60 + (t['minute'] as int) : -1;
    }

    final anchorList = anchors.values.toList()
      ..sort((a, b) {
        final byTime = minutes(a) - minutes(b);
        return byTime != 0 ? byTime : (a['id'] as String).compareTo(b['id'] as String);
      });
    final taskList = tasks.values.toList()
      ..sort((a, b) {
        final byTime = ms(a['createdAt']) - ms(b['createdAt']);
        return byTime != 0 ? byTime : (a['id'] as String).compareTo(b['id'] as String);
      });
    return {
      'v': 1,
      'gen': gen,
      'rev': rev,
      'serverTime': DateTime.now().toUtc().toIso8601String(),
      'erased': erased,
      'anchors': anchorList,
      'tasks': taskList,
      'todos': const [],
      'dump': const [],
      'checkins': checkins.length > 200
          ? checkins.sublist(checkins.length - 200)
          : checkins,
    };
  }

  static int? _ms(Object? iso) =>
      iso is String ? DateTime.tryParse(iso)?.millisecondsSinceEpoch : null;

  void _mergeAll(
    Map<String, Map<String, Object?>> into,
    Object? list,
    Set<String> fields,
  ) {
    if (list is! List) return;
    for (final raw in list) {
      if (raw is! Map || raw['id'] is! String) continue;
      final item = raw.cast<String, Object?>();
      final old = into[item['id']];
      into[item['id'] as String] = _settle(
        old == null ? item : _merge(old, item, fields),
        fields,
      );
    }
  }

  Map<String, Object?> _merge(
    Map<String, Object?> a,
    Map<String, Object?> b,
    Set<String> fields,
  ) {
    final au = _ms(a['updatedAt']) ?? 0;
    final bu = _ms(b['updatedAt']) ?? 0;
    final defWinner = bu > au || (bu == au && jsonEncode(b).compareTo(jsonEncode(a)) > 0) ? b : a;
    final at = _ms(a['tickAt']);
    final bt = _ms(b['tickAt']);
    final tickWinner = bt != null && (at == null || bt > at) ? b : a;
    final ad = _ms(a['deletedAt']);
    final bd = _ms(b['deletedAt']);
    final created = (_ms(a['createdAt']) ?? 0) <= (_ms(b['createdAt']) ?? 0)
        ? a['createdAt']
        : b['createdAt'];
    return {
      'id': a['id'],
      for (final f in fields)
        if (defWinner.containsKey(f)) f: defWinner[f],
      'createdAt': created,
      'updatedAt': defWinner['updatedAt'],
      'deletedAt': bd != null && (ad == null || bd > ad) ? b['deletedAt'] : a['deletedAt'],
      'doneOn': tickWinner['doneOn'],
      'tickAt': tickWinner['tickAt'],
    };
  }

  /// A deleted item keeps no content; an undone deletion is no deletion.
  Map<String, Object?> _settle(Map<String, Object?> item, Set<String> fields) {
    final deleted = _ms(item['deletedAt']);
    final updated = _ms(item['updatedAt']) ?? 0;
    if (deleted != null && deleted >= updated) {
      return {
        'id': item['id'],
        'createdAt': item['createdAt'],
        'updatedAt': item['updatedAt'],
        'deletedAt': item['deletedAt'],
      };
    }
    return {
      'id': item['id'],
      for (final f in fields)
        if (item[f] != null) f: item[f],
      'subtitle': item['subtitle'] ?? '',
      'createdAt': item['createdAt'],
      'updatedAt': item['updatedAt'],
      'deletedAt': null,
      'doneOn': item['doneOn'],
      'tickAt': item['tickAt'],
    };
  }

  void _mergeCheckins(Object? list) {
    final byAt = <int, Map<String, Object?>>{
      for (final c in checkins) _ms(c['at'])!: c,
    };
    final serverMs = clock().millisecondsSinceEpoch;
    if (list is List) {
      for (final raw in list) {
        if (raw is! Map) continue;
        var at = _ms(raw['at']);
        if (at == null) continue;
        if (at > serverMs + 60000) at = serverMs; // a phone clock ahead
        final iso = DateTime.fromMillisecondsSinceEpoch(at, isUtc: true).toIso8601String();
        final c = {'at': iso, 'state': raw['state'], 'level': raw['level']};
        final old = byAt[at];
        if (old == null || jsonEncode(c).compareTo(jsonEncode(old)) > 0) byAt[at] = c;
      }
    }
    final sorted = byAt.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    checkins = [
      for (var i = 0; i < sorted.length; i++)
        if (i == sorted.length - 1 || sorted[i + 1].key - sorted[i].key >= 60000)
          sorted[i].value,
    ];
  }
}

// ---- upload ---------------------------------------------------------------------

/// [length] bytes of a pretend file, in chunks of [chunk].
Stream<List<int>> fakeFileBytes(int length, {int chunk = 64 * 1024}) async* {
  var left = length;
  while (left > 0) {
    final n = left < chunk ? left : chunk;
    left -= n;
    yield Uint8List(n);
  }
}

/// A picked file of [size] bytes (null = the phone couldn't tell).
PickedDocument fakePicked(String name, int? size, {Stream<List<int>> Function()? open}) =>
    PickedDocument(
      name: name,
      size: size,
      open: open ?? () => fakeFileBytes(size ?? 0),
    );

/// A file picker the test scripts: [next] is what the next pick returns
/// (null = the person closed the picker); [error] makes it throw.
class FakeDocumentPicker extends DocumentPicker {
  FakeDocumentPicker({this.next, this.error, this.preparing = false});

  PickedDocument? next;
  Object? error;

  /// Calls onPreparing first (a big file copied in from a cloud drive).
  bool preparing;

  /// Completes the pick only when the test says so (to see "preparing").
  Completer<void>? hold;
  int picks = 0;

  @override
  Future<PickedDocument?> pick({VoidCallback? onPreparing}) async {
    picks += 1;
    if (preparing) onPreparing?.call();
    if (hold != null) await hold!.future;
    final e = error;
    if (e != null) throw e;
    return next;
  }
}

/// A phone dialer that records the numbers and answers [canCall].
class FakePhoneDialer extends PhoneDialer {
  FakePhoneDialer({this.canCall = true});

  bool canCall;
  final List<String> dialled = [];

  @override
  Future<bool> dial(String number) async {
    dialled.add(number);
    return canCall;
  }
}

/// `POST /api/documents/upload`, reading the multipart body as it streams
/// (so progress is real), honouring the request's abort trigger the way
/// the app's IOClient does, and answering [status] with [answer]. Other
/// routes are served from [routes] (LOCAL_MODE auth by default).
class FakeUploadServer {
  FakeUploadServer({this.routes = const {}});

  final Map<String, Handler> routes;

  /// The answer to the next upload (default: a new pending document).
  int status = 201;
  Object? answer;

  /// When set, the upload stops reading after this many bytes until
  /// [release] completes (or forever, for a stall).
  int? pauseAfter;
  Completer<void> release = Completer<void>();

  /// When set, the upload route fails at the network level after reading
  /// this many bytes (a dropped connection).
  int? dropAfter;

  /// Bytes of upload body read so far, every upload request, and how many
  /// were aborted by their trigger (Cancel, sign-out, a stall).
  int received = 0;
  int aborts = 0;
  final List<http.BaseRequest> uploads = [];
  final List<http.BaseRequest> requests = [];

  /// Completes when the server has paused (pauseAfter reached).
  Completer<void> paused = Completer<void>();

  http.Client client({Set<String> reachableHosts = const {tailscaleHost}}) {
    return MockClient.streaming((request, body) async {
      if (!reachableHosts.contains(request.url.host)) {
        throw http.ClientException('Connection refused', request.url);
      }
      requests.add(request);
      if (request.url.path == '/healthz') {
        await body.drain<void>();
        return _streamed(_healthy, 200);
      }
      final key = '${request.method} ${request.url.path}';
      if (key == 'POST /api/documents/upload') return _upload(request, body);
      final bytes = await body.toBytes();
      final handler = routes[key] ?? localModeAuth[key];
      if (handler == null) return _streamed(jsonEncode({'error': 'not found: $key'}), 404);
      final plain = http.Request(request.method, request.url)
        ..headers.addAll(request.headers)
        ..bodyBytes = bytes;
      final r = handler(plain);
      return _streamed(r.body, r.statusCode, headers: r.headers);
    });
  }

  Future<http.StreamedResponse> _upload(http.BaseRequest request, http.ByteStream body) async {
    uploads.add(request);
    final done = Completer<void>();
    late final StreamSubscription<List<int>> sub;
    if (request case http.Abortable(:final abortTrigger?)) {
      unawaited(
        abortTrigger.whenComplete(() {
          if (done.isCompleted) return;
          aborts += 1;
          done.completeError(http.RequestAbortedException(request.url));
        }),
      );
    }
    sub = body.listen(
      (chunk) {
        received += chunk.length;
        final drop = dropAfter;
        if (drop != null && received >= drop && !done.isCompleted) {
          done.completeError(http.ClientException('Connection reset by peer', request.url));
          return;
        }
        final pause = pauseAfter;
        if (pause != null && received >= pause && !paused.isCompleted) {
          sub.pause();
          paused.complete();
          unawaited(release.future.then((_) => sub.resume()));
        }
      },
      onDone: () {
        if (!done.isCompleted) done.complete();
      },
      onError: (Object e) {
        if (!done.isCompleted) done.completeError(e);
      },
    );
    try {
      await done.future;
    } finally {
      // Not awaited: a finished subscription's cancel() hands back a future
      // of the root zone, which a widget test's fake clock never runs.
      unawaited(sub.cancel());
    }
    final reply =
        answer ??
        {
          '_id': 'up1',
          'title': 'New paper',
          'type': 'pdf',
          'status': 'pending',
          'progress': 0,
        };
    return _streamed(jsonEncode(reply), status, headers: const {'content-type': 'application/json; charset=utf-8'});
  }

  static http.StreamedResponse _streamed(String body, int status, {Map<String, String> headers = const {}}) =>
      http.StreamedResponse(
        http.ByteStream.fromBytes(utf8.encode(body)),
        status,
        headers: headers,
      );
}
