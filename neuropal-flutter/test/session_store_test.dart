// Sign-in sessions on the device: one per server, written through to the
// vault, and never a crash when the vault misbehaves.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/data/session_store.dart';

import 'helpers/fakes.dart';

/// A vault whose every call fails (a broken keystore).
class _BrokenVault implements SessionVault {
  @override
  Future<Map<String, String>> readAll() async => throw StateError('keystore');
  @override
  Future<void> write(String key, String value) async =>
      throw StateError('keystore');
  @override
  Future<void> delete(String key) async => throw StateError('keystore');
}

void main() {
  test('loads only NeuroPal sessions; save and clear write through', () async {
    final vault = MemorySessionVault({
      'np.session.$cloudBase': 'cloud-token',
      'np.session.$tailscaleBase': '', // empty = nothing saved
      'something.else': 'not ours',
    });
    final store = await SessionStore.load(vault);
    expect(store.tokenFor(cloudBase), 'cloud-token');
    expect(store.tokenFor(tailscaleBase), isNull);
    expect(store.servers, [cloudBase]);

    await store.save(tailscaleBase, 'mac-token');
    expect(store.tokenFor(tailscaleBase), 'mac-token');
    expect(vault.values['np.session.$tailscaleBase'], 'mac-token');

    await store.clear(cloudBase);
    expect(store.tokenFor(cloudBase), isNull);
    expect(vault.values.containsKey('np.session.$cloudBase'), isFalse);
    expect(vault.values['something.else'], 'not ours');
  });

  test('a broken vault starts empty and never throws', () async {
    final store = await SessionStore.load(_BrokenVault());
    expect(store.servers, isEmpty);
    // Memory still works for this run; the failures are only logged.
    await store.save(cloudBase, 't');
    expect(store.tokenFor(cloudBase), 't');
    await store.clear(cloudBase);
    expect(store.tokenFor(cloudBase), isNull);
  });

  test('SecureSessionVault round-trips through flutter_secure_storage', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final first = await SessionStore.load(SecureSessionVault());
    expect(first.servers, isEmpty);
    await first.save(cloudBase, 'cloud-token');

    // A fresh start reads it back from secure storage.
    final again = await SessionStore.load(SecureSessionVault());
    expect(again.tokenFor(cloudBase), 'cloud-token');

    await again.clear(cloudBase);
    final cleared = await SessionStore.load(SecureSessionVault());
    expect(cleared.tokenFor(cloudBase), isNull);
  });
}
