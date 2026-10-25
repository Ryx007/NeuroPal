// Sign-in sessions: one token per server, kept in the platform's secure
// storage (Android: Keystore-backed encryption; iOS: the Keychain, this
// device only — never restored onto another phone).
//
// WHY ONE PER SERVER: the app can talk to several addresses (the cloud
// server, the Mac mini over Tailscale or the LAN, a custom one). A token is
// only ever sent to the server that issued it, so the cloud session never
// travels over plain HTTP to another machine, and switching addresses in
// Settings switches sessions.
//
// The tokens are read once at start-up (lib/main.dart) and then served from
// memory, so every request can attach one without waiting on the keystore.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The storage underneath a [SessionStore]: secure storage in the app,
/// memory in tests.
abstract interface class SessionVault {
  Future<Map<String, String>> readAll();
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// The app's vault: flutter_secure_storage.
class SecureSessionVault implements SessionVault {
  SecureSessionVault([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            // Readable while the phone is locked (listening goes on with
            // the screen off and saves progress), and never migrated to
            // another device through a backup.
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  final FlutterSecureStorage _storage;

  @override
  Future<Map<String, String>> readAll() => _storage.readAll();

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// A vault that only lives in memory (tests, screenshots).
class MemorySessionVault implements SessionVault {
  MemorySessionVault([Map<String, String>? values]) : values = values ?? {};

  /// What has been "persisted", by vault key.
  final Map<String, String> values;

  @override
  Future<Map<String, String>> readAll() async => Map.of(values);

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

class SessionStore {
  SessionStore._(this._vault, this._tokens);

  /// Reads the saved sessions (once, at start-up). Never throws: storage
  /// that can't be read — a broken keystore, a backup restored from another
  /// phone — starts empty, which only means signing in again.
  static Future<SessionStore> load(
    SessionVault vault, {
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final tokens = <String, String>{};
    try {
      final saved = await vault.readAll().timeout(timeout);
      for (final MapEntry(:key, :value) in saved.entries) {
        if (key.startsWith(_prefix) && value.isNotEmpty) {
          tokens[key.substring(_prefix.length)] = value;
        }
      }
    } on Object catch (e) {
      debugPrint('Saved sign-in sessions could not be read: $e');
    }
    return SessionStore._(vault, tokens);
  }

  /// A store in memory only, optionally pre-filled (server → token).
  factory SessionStore.memory([Map<String, String> tokens = const {}]) =>
      SessionStore._(
        MemorySessionVault({
          for (final MapEntry(:key, :value) in tokens.entries)
            '$_prefix$key': value,
        }),
        Map.of(tokens),
      );

  /// Vault key = prefix + the server's base address.
  static const _prefix = 'np.session.';

  final SessionVault _vault;
  final Map<String, String> _tokens;

  /// The token saved for [server] (a base address such as
  /// `https://api.ryx007.work`), or null.
  String? tokenFor(String server) => _tokens[server];

  /// Servers with a saved session.
  Iterable<String> get servers => _tokens.keys;

  /// Saves [token] for [server]: in memory at once (the next request
  /// carries it), then in the vault. A vault failure is logged, not thrown.
  Future<void> save(String server, String token) async {
    _tokens[server] = token;
    try {
      await _vault.write('$_prefix$server', token);
    } on Object catch (e) {
      debugPrint('Sign-in session could not be saved: $e');
    }
  }

  /// Forgets the session for [server] (memory at once, then the vault).
  Future<void> clear(String server) async {
    _tokens.remove(server);
    try {
      await _vault.delete('$_prefix$server');
    } on Object catch (e) {
      debugPrint('Sign-in session could not be deleted: $e');
    }
  }
}
