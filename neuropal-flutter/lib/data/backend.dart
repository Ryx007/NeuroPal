// The connection to the NeuroPal backend (Node/Express).
//
// HOW THE ADDRESS IS CHOSEN (same rules as the Expo app, BRAIN §5):
//   1. the user's override from Settings (if any),
//   2. the cloud server (https://api.ryx007.work) — anywhere with internet,
//      sign-in required,
//   3. Tailscale MagicDNS — the Mac mini, at home AND away,
//   4. the Mac mini's LAN IP — home Wi-Fi with Tailscale off.
// We probe GET /healthz on all of them and use the FIRST REACHABLE one in
// that order — never the fastest, or the phone would pin itself to an
// address that dies as soon as it leaves home.
//
// SIGN-IN: every request carries `Authorization: Bearer <token>` with the
// session saved for THAT server (session_store.dart) — a token never goes
// to another address. A 401 from a data route is reported through
// [Backend.onUnauthorized] (lib/auth/auth_controller.dart listens). A
// single-user LOCAL_MODE server (the Mac mini) simply needs no token.
//
// FAILURES ARE VISIBLE: when nothing answers, `state` becomes offline and
// the screens show a banner with Retry. Nothing is ever faked here; demo
// data only exists behind the explicit Settings switch.

import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException, TlsException;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'session_store.dart';

class BackendCandidate {
  const BackendCandidate(this.label, this.base);

  /// Human label for Settings and the offline banner.
  final String label;

  /// e.g. `http://192.168.3.169:4000` (no trailing slash).
  final String base;
}

const List<BackendCandidate> kDefaultBackends = [
  BackendCandidate('Cloud', 'https://api.ryx007.work'),
  BackendCandidate('Tailscale', 'http://ryx-mac-mini.tail73ed8.ts.net:4000'),
  BackendCandidate('Home Wi-Fi', 'http://192.168.3.169:4000'),
];

/// Result of probing one candidate.
class CandidateResult {
  const CandidateResult({
    required this.candidate,
    required this.reachable,
    this.latencyMs,
    this.error,
  });

  final BackendCandidate candidate;
  final bool reachable;
  final int? latencyMs;

  /// Why it failed, in words ("timed out after 4 s", "connection refused").
  final String? error;
}

enum BackendState { checking, online, offline }

/// Any failed backend call. [unreachable] = no response at all (network),
/// as opposed to the backend answering with an error.
class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.status,
    this.unreachable = false,
    this.retryAfterSec,
  });

  final String message;
  final int? status;
  final bool unreachable;

  /// From a 429 answer: seconds until the server takes another try.
  final int? retryAfterSec;

  @override
  String toString() => message;
}

class Backend extends ChangeNotifier {
  Backend({
    required this.prefs,
    http.Client? client,
    this.defaults = kDefaultBackends,
    this.probeTimeout = const Duration(seconds: 4),
    SessionStore? sessions,
  }) : _client = client ?? http.Client(),
       sessions = sessions ?? SessionStore.memory() {
    _custom = prefs.getString(_kCustom);
  }

  static const _kCustom = 'np.backend.override';

  final SharedPreferences prefs;
  final http.Client _client;
  final List<BackendCandidate> defaults;
  final Duration probeTimeout;

  /// The sign-in token saved per server (sent with every request to it).
  final SessionStore sessions;

  /// Called when a server answers 401 to a data request: the session is
  /// over, or there never was one. [token] is the one the request carried
  /// (null = none). The sign-in calls under /api/auth/ report their own
  /// 401s ("wrong password") to their caller and never come here.
  void Function(String server, String? token)? onUnauthorized;

  String? _custom;
  BackendState _state = BackendState.checking;
  BackendCandidate? _active;
  List<CandidateResult> _results = const [];
  DateTime? _checkedAt;
  Future<void>? _probing;
  bool _disposed = false;

  BackendState get state => _state;
  bool get isOnline => _state == BackendState.online;

  /// The address requests go to, or null while offline/checking.
  BackendCandidate? get active => _active;

  /// The latest probe result per candidate, in preference order.
  List<CandidateResult> get results => _results;
  DateTime? get checkedAt => _checkedAt;
  /// The address typed in Settings (tried first), or null.
  String? get customAddress => _custom;

  /// Every address we try, in preference order.
  List<BackendCandidate> get candidates {
    final list = <BackendCandidate>[
      if (_custom != null) BackendCandidate('Custom', _custom!),
    ];
    for (final c in defaults) {
      if (!list.any((x) => x.base == c.base)) list.add(c);
    }
    return list;
  }

  /// Saves (or clears, with null/empty) the custom address from Settings
  /// and re-probes. Returns an error message when it can't be used.
  Future<String?> setCustomAddress(String? raw) async {
    final value = normalizeBaseUrl(raw);
    if (raw != null && raw.trim().isNotEmpty && value == null) {
      return 'That doesn’t look like an address. Try http://192.168.1.20:4000';
    }
    _custom = value;
    if (value == null) {
      await prefs.remove(_kCustom);
    } else {
      await prefs.setString(_kCustom, value);
    }
    _active = null;
    await probe();
    return null;
  }

  /// "192.168.1.20:4000/" → "http://192.168.1.20:4000". Null if unusable.
  static String? normalizeBaseUrl(String? raw) {
    var s = (raw ?? '').trim();
    if (s.isEmpty) return null;
    if (!s.contains('://')) s = 'http://$s';
    s = s.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(s);
    if (uri == null || uri.host.isEmpty) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;
    return s;
  }

  /// Probes every candidate (in parallel) and switches to the first
  /// reachable one in preference order. Concurrent calls share one probe.
  Future<void> probe() {
    return _probing ??= _probe().whenComplete(() => _probing = null);
  }

  Future<void> _probe() async {
    _state = BackendState.checking;
    _notify();
    final list = candidates;
    final results = await Future.wait(list.map(_check));
    _results = results;
    _checkedAt = DateTime.now();
    final hit = results.where((r) => r.reachable).firstOrNull;
    _active = hit?.candidate;
    _state = hit == null ? BackendState.offline : BackendState.online;
    _notify();
  }

  Future<CandidateResult> _check(BackendCandidate c) async {
    final watch = Stopwatch()..start();
    try {
      final res = await _client
          .get(Uri.parse('${c.base}/healthz'))
          .timeout(probeTimeout);
      if (res.statusCode != 200) {
        return CandidateResult(
          candidate: c,
          reachable: false,
          error: 'answered HTTP ${res.statusCode}',
        );
      }
      final body = jsonDecode(res.body);
      final ok = body is Map && body['status'] == 'ok';
      return CandidateResult(
        candidate: c,
        reachable: ok,
        latencyMs: watch.elapsedMilliseconds,
        error: ok ? null : 'not a NeuroPal backend',
      );
    } on TimeoutException {
      return CandidateResult(
        candidate: c,
        reachable: false,
        error: 'timed out after ${probeTimeout.inSeconds} s',
      );
    } on Object catch (e) {
      return CandidateResult(
        candidate: c,
        reachable: false,
        error: describeNetworkError(e, host: Uri.tryParse(c.base)?.host),
      );
    }
  }

  /// A short human description of a low-level network error. [host] (the
  /// address tried) picks the hint for a name that can't be found.
  static String describeNetworkError(Object e, {String? host}) {
    if (e is TlsException) return 'secure connection failed';
    final text = switch (e) {
      SocketException(:final osError, :final message) =>
        osError?.message ?? message,
      http.ClientException(:final message) => message,
      FormatException() => 'unexpected response',
      _ => e.toString(),
    };
    final lower = text.toLowerCase();
    if (lower.contains('refused')) return 'connection refused';
    if (lower.contains('failed host lookup') ||
        lower.contains('no address associated')) {
      // Only a Tailscale name needs Tailscale; any other name needs internet.
      return host == null || host.endsWith('.ts.net')
          ? 'name not found (is Tailscale on?)'
          : 'name not found (is the phone online?)';
    }
    if (lower.contains('unreachable')) return 'network unreachable';
    if (lower.contains('timed out')) return 'timed out';
    return text.isEmpty ? 'no response' : text;
  }

  // ---- requests ---------------------------------------------------------
  //
  // [server] pins a request to that base address (the sign-in calls must
  // reach the server whose session they are about); without it the
  // active address is used.

  Future<Object?> getJson(String path, {Duration? timeout, String? server}) =>
      _send('GET', path, timeout: timeout, server: server);

  Future<Object?> postJson(
    String path,
    Object? body, {
    Duration? timeout,
    String? server,
  }) => _send('POST', path, body: body, timeout: timeout, server: server);

  Future<Object?> patchJson(String path, Object? body, {Duration? timeout}) =>
      _send('PATCH', path, body: body, timeout: timeout);

  Future<Object?> putJson(String path, Object? body, {Duration? timeout}) =>
      _send('PUT', path, body: body, timeout: timeout);

  Future<Object?> _send(
    String method,
    String path, {
    Object? body,
    Duration? timeout,
    String? server,
  }) async {
    final BackendCandidate? base;
    if (server != null) {
      base =
          candidates.where((c) => c.base == server).firstOrNull ??
          BackendCandidate(server, server);
    } else {
      if (_active == null) await probe();
      base = _active;
    }
    if (base == null) {
      throw ApiException(offlineMessage(), unreachable: true);
    }
    final limit = timeout ?? const Duration(seconds: 20);
    final request = http.Request(method, Uri.parse('${base.base}$path'))
      ..headers['Accept'] = 'application/json';
    // This server's own session, never another server's.
    final token = sessions.tokenFor(base.base);
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response res;
    try {
      final streamed = await _client.send(request).timeout(limit);
      res = await http.Response.fromStream(streamed).timeout(limit);
    } on Object catch (e) {
      // No answer at all: re-check which address works (in the background)
      // and tell the caller in words.
      unawaited(probe());
      final why = e is TimeoutException
          ? 'timed out after ${limit.inSeconds} s'
          : describeNetworkError(e, host: request.url.host);
      throw ApiException(
        'Couldn’t reach the backend at ${base.label} ($why).',
        unreachable: true,
      );
    }

    // Decode the bytes as UTF-8 ourselves (big documents, non-Latin text).
    final hasBody = res.bodyBytes.isNotEmpty;
    Object? decoded;
    if (hasBody) {
      try {
        decoded = jsonDecode(utf8.decode(res.bodyBytes));
      } on FormatException {
        decoded = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (hasBody && decoded == null) {
        throw ApiException(
          'The backend sent an unreadable reply.',
          status: res.statusCode,
        );
      }
      return decoded;
    }
    if (res.statusCode == 401 && !path.startsWith('/api/auth/')) {
      onUnauthorized?.call(base.base, token);
    }
    final error = decoded is Map ? decoded : const {};
    final message = error['error'] is String
        ? error['error'] as String
        : 'The backend answered HTTP ${res.statusCode}.';
    final retry = error['retryAfterSec'];
    throw ApiException(
      message,
      status: res.statusCode,
      retryAfterSec: retry is num
          ? retry.ceil()
          : int.tryParse(res.headers['retry-after'] ?? ''),
    );
  }

  /// One sentence for banners: which addresses were tried and why they
  /// failed.
  String offlineMessage() {
    if (_results.isEmpty) return 'Can’t reach the NeuroPal backend.';
    final parts = _results
        .where((r) => !r.reachable)
        .map((r) => '${r.candidate.label}: ${r.error ?? 'no response'}');
    return 'Can’t reach the NeuroPal backend (${parts.join('; ')}).';
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _client.close();
    super.dispose();
  }
}
