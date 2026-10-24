// Test doubles: a scriptable speech engine and in-memory backends (a
// single-user LOCAL_MODE one, and one with accounts).

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/data/settings_controller.dart';
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
