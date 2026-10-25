// Who is signed in, on which server — and whether the app needs a sign-in
// before it can open.
//
// THE RULES (server side: neuropal-backend/src/routes/auth.js):
//   * GET /api/auth/config says `localMode: true` → a single-user server
//     (the Mac mini): no sign-in, ever.
//   * Otherwise the server needs a session. None saved → sign-in. One saved
//     → GET /api/auth/me checks it: a refreshed `token` in the answer is
//     saved (sessions slide); 401 → the session is over → sign-in.
//   * Any data request answering 401 ends the session too (Backend reports
//     it through `onUnauthorized`).
//   * NO ANSWER IS NOT A NO: when the server can't be reached, a saved
//     session stays and the app opens offline, as it did before sign-in
//     existed. Only the server itself saying 401 ends a session.
//   * Sessions are per server (SessionStore): changing the address in
//     Settings means that server's own rules and its own session.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/backend.dart';
import '../data/session_store.dart';

enum AuthStatus {
  /// Not known yet for the current server (not checked yet, or out of
  /// reach without a saved session). The app opens normally.
  unknown,

  /// The server needs no sign-in (LOCAL_MODE, or no accounts at all).
  open,

  /// A session is saved for this server — confirmed by /me, or not
  /// checkable right now because the server is out of reach.
  signedIn,

  /// The server needs a sign-in and there is no valid session.
  signedOut,
}

/// What GET /api/auth/config says about a server.
class AuthConfig {
  const AuthConfig({required this.localMode, required this.signup});

  factory AuthConfig.fromJson(Map<String, Object?> json) {
    final signup = json['signup'];
    return AuthConfig(
      localMode: json['localMode'] == true,
      // Anything unexpected is treated like 'invite' (the code field shows).
      signup: signup == 'open' || signup == 'closed'
          ? signup as String
          : 'invite',
    );
  }

  final bool localMode;

  /// 'invite' (registering needs an invite code) | 'open' | 'closed'.
  final String signup;

  bool get canRegister => signup != 'closed';
  bool get needsInvite => signup == 'invite';
}

/// The signed-in account (from /api/auth/me, or the sign-in answer).
class AuthUser {
  const AuthUser({required this.id, this.email, this.name});

  factory AuthUser.fromJson(Map<String, Object?> json) => AuthUser(
    id: _str(json['id']) ?? _str(json['_id']) ?? '',
    email: _str(json['email']),
    name: _str(json['name']),
  );

  final String id;
  final String? email;
  final String? name;
}

/// The form field a failure is about (shown under that field).
enum AuthField { name, email, password, inviteCode }

/// Why signing in or registering didn't work, in words.
class AuthFailure {
  const AuthFailure(this.message, {this.field, this.retryAfter});

  final String message;

  /// The field to show [message] under, or null for the whole form.
  final AuthField? field;

  /// Rate-limited: how long until the server takes another try.
  final Duration? retryAfter;
}

class AuthController extends ChangeNotifier {
  AuthController({required this.backend, required this.sessions}) {
    backend.addListener(_onBackendChanged);
    backend.onUnauthorized = _onUnauthorized;
    _onBackendChanged();
  }

  final Backend backend;
  final SessionStore sessions;

  static const _checkTimeout = Duration(seconds: 15);
  static const _signInTimeout = Duration(seconds: 30);

  AuthStatus _status = AuthStatus.unknown;
  AuthConfig? _config;
  AuthUser? _user;
  String? _server;
  String? _notice;
  String? _lastEmail;
  Future<void>? _checking;
  bool _disposed = false;

  AuthStatus get status => _status;

  /// The current server's sign-up rules (null until it answered).
  AuthConfig? get config => _config;

  /// The signed-in account, when the server has told us (null offline).
  AuthUser? get user => _user;

  /// The base address [status] is about.
  String? get server => _server;

  /// Why the sign-in screen is showing, when there is more to say than
  /// "sign in" (e.g. the session ended).
  String? get notice => _notice;

  /// The email of the last account used here this run (pre-fills the form
  /// after a session ends).
  String? get lastEmail => _lastEmail;

  /// True while the sign-in screen must replace the app.
  bool get needsSignIn => _status == AuthStatus.signedOut;

  /// True when requests are expected to be accepted (signed in, or a
  /// server without accounts).
  bool get hasAccess =>
      _status == AuthStatus.signedIn || _status == AuthStatus.open;

  bool get checking => _checking != null;

  // ---- checking the server -------------------------------------------------

  void _onBackendChanged() {
    if (backend.state != BackendState.online) return;
    final base = backend.active!.base;
    // A new server, or one we couldn't check yet: find out what it needs.
    if (base != _server || _status == AuthStatus.unknown) unawaited(check());
  }

  /// Finds out what the active server needs and whether the saved session
  /// still works. Concurrent calls share one check; if the active server
  /// changed meanwhile, the new one is checked right after.
  Future<void> check() {
    return _checking ??= _check().whenComplete(() {
      _checking = null;
      _notify();
      final now = backend.isOnline ? backend.active?.base : null;
      if (now != null && now != _server) unawaited(check());
    });
  }

  Future<void> _check() async {
    final base = backend.active?.base;
    if (base == null) return; // nothing answers: keep what we know
    if (base != _server) {
      // Another server: its own rules, its own session.
      _server = base;
      _config = null;
      _user = null;
      _notice = null;
      _status = sessions.tokenFor(base) != null
          ? AuthStatus.signedIn
          : AuthStatus.unknown;
      _notify();
    }

    // 1. What does this server expect?
    AuthConfig? config;
    try {
      config = AuthConfig.fromJson(
        _map(
          await backend.getJson(
            '/api/auth/config',
            server: base,
            timeout: _checkTimeout,
          ),
        ),
      );
    } on ApiException catch (e) {
      // 404 = a server from before /config existed: /me below tells. No
      // answer or server trouble: keep what we know, try again later.
      if (e.status != 404) return;
    }
    if (base != _server) return;
    _config = config;
    if (config != null && config.localMode) {
      _user = null;
      _setStatus(AuthStatus.open);
      return;
    }

    // 2. Does the saved session still work?
    final token = sessions.tokenFor(base);
    if (token == null && config != null) {
      _setStatus(AuthStatus.signedOut);
      return;
    }
    try {
      final me = _map(
        await backend.getJson(
          '/api/auth/me',
          server: base,
          timeout: _checkTimeout,
        ),
      );
      if (base != _server) return;
      // Signed out (or in again) while asking: this answer is stale.
      if (sessions.tokenFor(base) != token) return;
      // Sliding sessions: a day-old token comes back refreshed. Keep it.
      final fresh = me['token'];
      if (fresh is String && fresh.isNotEmpty) {
        await sessions.save(base, fresh);
      }
      _user = AuthUser.fromJson(me);
      _lastEmail = _user!.email ?? _lastEmail;
      // Answered without any token = an older single-user server.
      _setStatus(
        sessions.tokenFor(base) != null
            ? AuthStatus.signedIn
            : AuthStatus.open,
      );
    } on ApiException catch (e) {
      if (base != _server) return;
      if (e.status == 401) {
        _endSession(base, token);
      } else if (e.status == 404 && token == null) {
        _setStatus(AuthStatus.open); // a server without accounts at all
      }
      // Anything else (no answer, 5xx): keep the session, check later.
    }
  }

  /// A data request was refused with 401.
  void _onUnauthorized(String server, String? token) {
    if (_server != null && server != _server) return; // a server we left
    if (_status == AuthStatus.signedOut) return; // already asking
    if (_status == AuthStatus.open) {
      // A server that didn't need accounts now does: ask it again.
      unawaited(check());
      return;
    }
    _server ??= server;
    _endSession(server, token);
  }

  /// The server said no: forget the session — unless a newer one was saved
  /// meanwhile (an old request coming back late with the old token).
  void _endSession(String server, String? token) {
    if (sessions.tokenFor(server) != token) return;
    if (token != null) unawaited(sessions.clear(server));
    _lastEmail = _user?.email ?? _lastEmail;
    _user = null;
    _notice = token != null
        ? 'Your session ended. Sign in again to carry on.'
        : null;
    _status = AuthStatus.signedOut;
    _notify();
  }

  void _setStatus(AuthStatus status) {
    _status = status;
    if (status != AuthStatus.signedOut) _notice = null;
    _notify();
  }

  // ---- signing in, up and out ------------------------------------------

  /// Signs in to the active server. Null = done; otherwise why not.
  Future<AuthFailure?> signIn({
    required String email,
    required String password,
  }) => _authenticate('/api/auth/login', {
    'email': email.trim(),
    'password': password,
  });

  /// Creates an account on the active server and signs in to it.
  Future<AuthFailure?> register({
    required String email,
    required String password,
    String? name,
    String? inviteCode,
  }) => _authenticate('/api/auth/register', {
    'email': email.trim(),
    'password': password,
    if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
    if (inviteCode != null && inviteCode.trim().isNotEmpty)
      'inviteCode': inviteCode.trim(),
  });

  Future<AuthFailure?> _authenticate(
    String path,
    Map<String, Object?> body,
  ) async {
    if (backend.active == null) await backend.probe();
    final base = backend.active?.base;
    if (base == null) return AuthFailure(backend.offlineMessage());

    final Map<String, Object?> reply;
    try {
      reply = _map(
        await backend.postJson(
          path,
          body,
          server: base,
          timeout: _signInTimeout,
        ),
      );
    } on ApiException catch (e) {
      return describeFailure(e);
    }
    final token = reply['token'];
    if (token is! String || token.isEmpty) {
      return const AuthFailure(
        'The server answered, but without a sign-in token.',
      );
    }
    await sessions.save(base, token);
    _lastEmail = body['email'] as String?;
    if (backend.active?.base == base) {
      final user = reply['user'];
      _server = base;
      _user = user is Map ? AuthUser.fromJson(user.cast()) : null;
      _setStatus(AuthStatus.signedIn);
    }
    return null;
  }

  /// Signs out of the current server: its session is forgotten on this
  /// phone. (The server can't revoke tokens; this one is simply gone.)
  Future<void> signOut() async {
    if (_status == AuthStatus.open) return; // nothing to sign out of
    final server = _server ?? backend.active?.base;
    if (server == null) return;
    final forgetting = sessions.clear(server);
    _server = server;
    _lastEmail = _user?.email ?? _lastEmail;
    _user = null;
    _notice = null;
    _status = AuthStatus.signedOut;
    _notify();
    await forgetting;
  }

  /// The server's refusal, worded for the sign-in form.
  @visibleForTesting
  static AuthFailure describeFailure(ApiException e) {
    if (e.unreachable) return AuthFailure(e.message);
    final text = _sentence(e.message);
    final lower = text.toLowerCase();
    switch (e.status) {
      case 401:
        // Never says which of the two was wrong (neither does the server).
        return const AuthFailure(
          'That email and password don’t match an account on this server.',
        );
      case 409:
        return const AuthFailure(
          'That email already has an account on this server. Sign in instead.',
          field: AuthField.email,
        );
      case 403:
        return AuthFailure(
          text,
          field: lower.contains('invite') ? AuthField.inviteCode : null,
        );
      case 429:
        final wait = e.retryAfterSec;
        return AuthFailure(
          text,
          retryAfter: wait == null ? null : Duration(seconds: wait),
        );
      case 400:
        return AuthFailure(
          text,
          field: lower.contains('email')
              ? AuthField.email
              : lower.contains('password')
              ? AuthField.password
              : null,
        );
      default:
        return AuthFailure(text);
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    backend.removeListener(_onBackendChanged);
    if (backend.onUnauthorized == _onUnauthorized) backend.onUnauthorized = null;
    super.dispose();
  }
}

Map<String, Object?> _map(Object? json) {
  if (json is Map) return json.cast<String, Object?>();
  throw const ApiException('The server sent an unexpected reply.');
}

String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;

/// "that invite code is not right" → "That invite code is not right."
String _sentence(String text) {
  final t = text.trim();
  if (t.isEmpty) return 'Something went wrong on the server.';
  final first = t[0].toUpperCase() + t.substring(1);
  return RegExp(r'[.!?]$').hasMatch(first) ? first : '$first.';
}
