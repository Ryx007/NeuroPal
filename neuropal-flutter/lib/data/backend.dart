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
// [Backend.onUnauthorized] (lib/auth/auth_controller.dart listens), except
// for a background request (day sync): that 401 goes to its caller only,
// and the next ordinary request ends the session (DAY-SYNC §8). A
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
    this.timedOut = false,
  });

  final String message;
  final int? status;
  final bool unreachable;

  /// From a 429 answer: seconds until the server takes another try.
  final int? retryAfterSec;

  /// No answer in time (always [unreachable] too): the server may be there
  /// but slow, which Pal words differently from "offline".
  final bool timedOut;

  @override
  String toString() => message;
}

/// An upload stopped by its own cancel trigger (the person tapped Cancel,
/// or the session ended): not a failure to report.
class UploadCancelled implements Exception {
  const UploadCancelled();

  @override
  String toString() => 'The upload was cancelled.';
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

  /// [background]: a request the person didn't make (day sync). Its 401 is
  /// only thrown to the caller, never reported to [onUnauthorized]: a
  /// background request never signs anyone out by itself.
  Future<Object?> postJson(
    String path,
    Object? body, {
    Duration? timeout,
    String? server,
    bool background = false,
  }) => _send(
    'POST',
    path,
    body: body,
    timeout: timeout,
    server: server,
    background: background,
  );

  Future<Object?> patchJson(String path, Object? body, {Duration? timeout}) =>
      _send('PATCH', path, body: body, timeout: timeout);

  Future<Object?> putJson(String path, Object? body, {Duration? timeout}) =>
      _send('PUT', path, body: body, timeout: timeout);

  Future<Object?> deleteJson(String path, {Duration? timeout}) =>
      _send('DELETE', path, timeout: timeout);

  /// The address a request goes to: [server] when given, else the active
  /// one (probing first when none is known yet).
  Future<BackendCandidate> _baseFor(String? server) async {
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
    return base;
  }

  Future<Object?> _send(
    String method,
    String path, {
    Object? body,
    Duration? timeout,
    String? server,
    bool background = false,
  }) async {
    final base = await _baseFor(server);
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
        timedOut: e is TimeoutException,
      );
    }
    return _answer(res, base, token, path, background: background);
  }

  /// Sends one file as multipart/form-data (field [field], plus [fields])
  /// to POST [path] and returns the decoded answer, like [postJson]: the
  /// same session header and the same 401 rule.
  ///
  /// [onProgress] hears the bytes handed to the connection so far. The
  /// request is aborted when [cancel] completes ([UploadCancelled]), and
  /// when nothing moves for [stall] (a timed-out [ApiException]): a big
  /// book over a slow line can take many minutes, so there is no overall
  /// limit, only one on silence. [server] pins it to that address and its
  /// session (the account that started it).
  Future<Object?> uploadFile(
    String path, {
    required String field,
    required String filename,
    required int length,
    required Stream<List<int>> bytes,
    Map<String, String> fields = const {},
    void Function(int sent, int total)? onProgress,
    Future<void>? cancel,
    String? server,
    Duration stall = const Duration(seconds: 60),
  }) async {
    final base = await _baseFor(server);
    final abort = Completer<void>();
    var cancelled = false;
    var stalled = false;
    Timer? stallTimer;
    void stop() {
      if (!abort.isCompleted) abort.complete();
    }

    unawaited(
      cancel?.then((_) {
        cancelled = true;
        stop();
      }),
    );
    void armStall() {
      stallTimer?.cancel();
      stallTimer = Timer(stall, () {
        stalled = true;
        stop();
      });
    }

    var sent = 0;
    // Reading the file itself can fail too (it moved, or the app it came
    // from took it back): that is the caller's error, not the network's.
    Object? readError;
    final counted = bytes.transform(
      StreamTransformer<List<int>, List<int>>.fromHandlers(
        handleData: (chunk, sink) {
          sent += chunk.length;
          armStall();
          onProgress?.call(sent, length);
          sink.add(chunk);
        },
        handleError: (error, stackTrace, sink) {
          readError ??= error;
          sink.addError(error, stackTrace);
        },
      ),
    );
    final request =
        http.AbortableMultipartRequest(
            'POST',
            Uri.parse('${base.base}$path'),
            abortTrigger: abort.future,
          )
          ..headers['Accept'] = 'application/json'
          ..fields.addAll(fields)
          ..files.add(
            http.MultipartFile(field, counted, length, filename: filename),
          );
    final token = sessions.tokenFor(base.base);
    if (token != null) request.headers['Authorization'] = 'Bearer $token';

    final http.Response res;
    try {
      if (cancelled) throw const UploadCancelled();
      armStall();
      final streamed = await _client.send(request);
      // The whole file is out; the server answers once it has stored it.
      armStall();
      res = await http.Response.fromStream(streamed);
    } on Object catch (e) {
      if (cancelled) throw const UploadCancelled();
      final failedRead = readError;
      if (failedRead != null) throw failedRead;
      if (stalled) {
        throw ApiException(
          'Couldn’t reach the backend at ${base.label} (nothing got through '
          'for ${stall.inSeconds} s).',
          unreachable: true,
          timedOut: true,
        );
      }
      unawaited(probe());
      throw ApiException(
        'Couldn’t reach the backend at ${base.label} '
        '(${describeNetworkError(e, host: request.url.host)}).',
        unreachable: true,
      );
    } finally {
      stallTimer?.cancel();
    }
    return _answer(res, base, token, path);
  }

  /// A response → its decoded JSON, or an [ApiException] in words (and the
  /// 401 rule: a refused data request ends the session, unless it was a
  /// [background] one).
  Object? _answer(
    http.Response res,
    BackendCandidate base,
    String? token,
    String path, {
    bool background = false,
  }) {
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
    if (res.statusCode == 401 && !background && !path.startsWith('/api/auth/')) {
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
