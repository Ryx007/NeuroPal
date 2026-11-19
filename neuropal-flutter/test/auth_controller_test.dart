// Sign-in rules: what each kind of server needs, refreshed sessions, 401s,
// and why "no answer" never signs anyone out.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/auth/auth_controller.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

/// A backend + sign-in controller, after the first probe and check.
Future<(Backend, AuthController)> setUpAuth(
  http.Client client, {
  SessionStore? sessions,
}) async {
  SharedPreferences.setMockInitialValues({});
  final store = sessions ?? SessionStore.memory();
  final backend = Backend(
    prefs: await SharedPreferences.getInstance(),
    client: client,
    sessions: store,
  );
  final auth = AuthController(backend: backend, sessions: store);
  await backend.probe();
  await auth.check(); // joins the check the probe started
  return (backend, auth);
}

void main() {
  group('checking the server', () {
    test('LOCAL_MODE: no sign-in, ever — even without a token; /me names the local user', () async {
      final requests = <http.Request>[];
      final (_, auth) = await setUpAuth(fakeBackend(requests: requests));
      expect(auth.status, AuthStatus.open);
      expect(auth.needsSignIn, isFalse);
      expect(auth.hasAccess, isTrue);
      // Who the local user is (day sync keys the day on its id), asked
      // without any token.
      expect(auth.user!.id, 'local');
      final me = requests.where((r) => r.url.path == '/api/auth/me');
      expect(me.single.headers['Authorization'], isNull);
    });

    test('LOCAL_MODE with /me not answering: still no sign-in; asked again when the server is back', () async {
      var restarting = true;
      final reachable = {tailscaleHost};
      final (backend, auth) = await setUpAuth(
        fakeBackend(
          reachableHosts: reachable,
          routes: {
            'GET /api/auth/me': (_) => restarting
                ? jsonResponse({'error': 'restarting'}, 503)
                : jsonResponse({'id': 'local', 'name': 'Ryx'}),
          },
        ),
      );
      expect(auth.status, AuthStatus.open);
      expect(auth.user, isNull);
      expect(auth.userUnknown, isTrue);

      restarting = false;
      reachable.clear();
      await backend.probe(); // gone for a moment...
      reachable.add(tailscaleHost);
      await backend.probe(); // ...and back
      await pumpEventQueue();
      expect(auth.user!.id, 'local');
      expect(auth.userUnknown, isFalse);
    });

    test('accounts and no saved session → sign-in', () async {
      final (_, auth) = await setUpAuth(FakeAccountsServer().client());
      expect(auth.status, AuthStatus.signedOut);
      expect(auth.needsSignIn, isTrue);
      expect(auth.config!.needsInvite, isTrue);
      expect(auth.notice, isNull);
    });

    test('a saved session is checked with /me; a refreshed token is saved', () async {
      final server = FakeAccountsServer(
        routes: {'GET /api/documents': (_) => jsonResponse([])},
      );
      final token = server.issue('ryx@example.com');
      server.refreshTo = 'tok-fresh';
      final vault = MemorySessionVault({'np.session.$cloudBase': token});
      final sessions = await SessionStore.load(vault);

      final (backend, auth) = await setUpAuth(
        server.client(),
        sessions: sessions,
      );
      expect(server.authHeaders('/api/auth/me'), ['Bearer $token']);
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.user!.email, 'ryx@example.com');
      expect(sessions.tokenFor(cloudBase), 'tok-fresh');
      expect(vault.values['np.session.$cloudBase'], 'tok-fresh');

      // From now on, requests carry the fresh token.
      await backend.getJson('/api/documents');
      expect(server.authHeaders('/api/documents'), ['Bearer tok-fresh']);
    });

    test('an expired session → sign-in, with a note; the token is gone', () async {
      final vault = MemorySessionVault({'np.session.$cloudBase': 'stale'});
      final sessions = await SessionStore.load(vault);
      final (_, auth) = await setUpAuth(
        FakeAccountsServer().client(),
        sessions: sessions,
      );
      expect(auth.needsSignIn, isTrue);
      expect(auth.notice, contains('session ended'));
      expect(sessions.tokenFor(cloudBase), isNull);
      expect(vault.values, isEmpty);
    });

    test('no answer: a saved session stays, nothing asks for sign-in', () async {
      final sessions = SessionStore.memory({cloudBase: 'tok'});
      final (backend, auth) = await setUpAuth(
        offlineBackend(),
        sessions: sessions,
      );
      expect(backend.state, BackendState.offline);
      expect(auth.needsSignIn, isFalse);
      expect(sessions.tokenFor(cloudBase), 'tok');
    });

    test('a /me broken at the network level is not asked again round and round', () async {
      var meCalls = 0;
      final client = MockClient((request) async {
        switch (request.url.path) {
          case '/healthz':
            return http.Response('{"status":"ok"}', 200);
          case '/api/auth/config':
            return jsonResponse({'localMode': true, 'signup': 'closed'});
          case '/api/auth/me':
            meCalls += 1;
            // Only /me's line is broken (a proxy in the way), for a while:
            // a failed request re-probes, the probe finds the server...
            if (meCalls <= 50) {
              throw http.ClientException('Connection reset by peer', request.url);
            }
            return jsonResponse({'id': 'local'});
        }
        return jsonResponse({'error': 'not found'}, 404);
      });
      final (_, auth) = await setUpAuth(client);
      await pumpEventQueue();
      expect(meCalls, 1, reason: 'asked again when the server comes back, not in a loop');
      expect(auth.status, AuthStatus.open);
      expect(auth.userUnknown, isTrue);
    });

    test('server trouble on /me keeps the session, and asks again when the server is back', () async {
      final server = FakeAccountsServer()..meStatus = 503;
      final token = server.issue('ryx@example.com');
      final sessions = SessionStore.memory({cloudBase: token});
      final reachable = {cloudHost};
      final (backend, auth) = await setUpAuth(
        server.client(reachableHosts: reachable),
        sessions: sessions,
      );
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.needsSignIn, isFalse);
      expect(sessions.tokenFor(cloudBase), token);
      expect(auth.userUnknown, isTrue, reason: 'who is signed in isn’t known yet');

      server.meStatus = null;
      reachable.clear();
      await backend.probe();
      reachable.add(cloudHost);
      await backend.probe();
      await pumpEventQueue();
      expect(auth.user!.email, 'ryx@example.com');
      expect(auth.status, AuthStatus.signedIn);
    });

    test('an older server without /api/auth/config: /me decides', () async {
      final (_, auth) = await setUpAuth(
        fakeBackend(
          routes: {
            'GET /api/auth/config': (_) =>
                jsonResponse({'error': 'Not found'}, 404),
          },
        ),
      );
      // An old LOCAL_MODE server answers /me without any token.
      expect(auth.status, AuthStatus.open);
      expect(auth.needsSignIn, isFalse);
    });
  });

  group('401 while using the app', () {
    test('a refused data request ends the session', () async {
      final server = FakeAccountsServer(
        routes: {'GET /api/documents': (_) => jsonResponse([])},
      );
      final sessions = SessionStore.memory({
        cloudBase: server.issue('ryx@example.com'),
      });
      final (backend, auth) = await setUpAuth(
        server.client(),
        sessions: sessions,
      );
      expect(auth.status, AuthStatus.signedIn);

      server.expireAll();
      await expectLater(
        backend.getJson('/api/documents'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
      );
      expect(auth.needsSignIn, isTrue);
      expect(auth.notice, contains('session ended'));
      expect(auth.lastEmail, 'ryx@example.com');
      expect(sessions.tokenFor(cloudBase), isNull);
    });

    test('a late 401 for an older token leaves the new session alone', () async {
      final (backend, auth) = await setUpAuth(FakeAccountsServer().client());
      expect(
        await auth.signIn(email: 'ryx@example.com', password: 'correct horse'),
        isNull,
      );
      backend.onUnauthorized!(cloudBase, 'tok-from-before');
      expect(auth.status, AuthStatus.signedIn);
      expect(backend.sessions.tokenFor(cloudBase), isNotNull);
    });
  });

  group('signing in, up and out', () {
    test('sign-in saves the session for that server', () async {
      final vault = MemorySessionVault();
      final sessions = await SessionStore.load(vault);
      final (_, auth) = await setUpAuth(
        FakeAccountsServer().client(),
        sessions: sessions,
      );
      final failure = await auth.signIn(
        email: ' Ryx@Example.com ',
        password: 'correct horse',
      );
      expect(failure, isNull);
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.needsSignIn, isFalse);
      expect(auth.user!.email, 'ryx@example.com');
      expect(vault.values['np.session.$cloudBase'], 'tok-1');
    });

    test('a wrong password is worded for the form, not a sign-out', () async {
      final (_, auth) = await setUpAuth(FakeAccountsServer().client());
      final failure = await auth.signIn(
        email: 'ryx@example.com',
        password: 'wrong',
      );
      expect(
        failure!.message,
        'That email and password don’t match an account on this server.',
      );
      expect(failure.field, isNull); // never says which one was wrong
      expect(auth.notice, isNull);
    });

    test('creating an account needs the right invite code', () async {
      final server = FakeAccountsServer();
      final (_, auth) = await setUpAuth(server.client());

      final wrong = await auth.register(
        email: 'new@example.com',
        password: 'long enough',
        inviteCode: 'guess',
      );
      expect(wrong!.field, AuthField.inviteCode);
      expect(wrong.message, 'That invite code is not right.');

      final right = await auth.register(
        email: 'new@example.com',
        password: 'long enough',
        name: 'New',
        inviteCode: ' open-sesame ',
      );
      expect(right, isNull);
      expect(auth.status, AuthStatus.signedIn);
      expect(server.accounts['new@example.com'], 'long enough');
    });

    test('an email that already has an account is flagged at the email', () async {
      final (_, auth) = await setUpAuth(
        FakeAccountsServer(signup: 'open').client(),
      );
      final failure = await auth.register(
        email: 'ryx@example.com',
        password: 'long enough',
      );
      expect(failure!.field, AuthField.email);
      expect(failure.message, contains('already has an account'));
    });

    test('rate limited: the wait comes back with the message', () async {
      final server = FakeAccountsServer()..lockedForSec = 420;
      final (_, auth) = await setUpAuth(server.client());
      final failure = await auth.signIn(
        email: 'ryx@example.com',
        password: 'correct horse',
      );
      expect(failure!.message, startsWith('Too many wrong passwords'));
      expect(failure.retryAfter, const Duration(minutes: 7));
    });

    test('sign out forgets this server’s session only', () async {
      final server = FakeAccountsServer();
      final sessions = SessionStore.memory({
        cloudBase: server.issue('ryx@example.com'),
        tailscaleBase: 'mac-token',
      });
      final (_, auth) = await setUpAuth(server.client(), sessions: sessions);
      expect(auth.status, AuthStatus.signedIn);

      await auth.signOut();
      expect(auth.needsSignIn, isTrue);
      expect(auth.notice, isNull); // the user's own choice: nothing to explain
      expect(sessions.tokenFor(cloudBase), isNull);
      expect(sessions.tokenFor(tailscaleBase), 'mac-token');
    });

    test('signing out while /me is under way stays signed out', () async {
      final server = FakeAccountsServer()..holdMe = Completer<void>();
      final sessions = SessionStore.memory({
        cloudBase: server.issue('ryx@example.com'),
      });
      SharedPreferences.setMockInitialValues({});
      final backend = Backend(
        prefs: await SharedPreferences.getInstance(),
        client: server.client(),
        sessions: sessions,
      );
      final auth = AuthController(backend: backend, sessions: sessions);
      await backend.probe(); // starts the check; /me now waits
      await pumpEventQueue();
      expect(auth.checking, isTrue);

      await auth.signOut();
      server.holdMe!.complete();
      await auth.check(); // joins the check still running
      expect(auth.status, AuthStatus.signedOut);
      expect(auth.needsSignIn, isTrue);
    });

    test('nothing reachable: signing in says so in words', () async {
      final (_, auth) = await setUpAuth(offlineBackend());
      final failure = await auth.signIn(
        email: 'ryx@example.com',
        password: 'correct horse',
      );
      expect(failure!.message, startsWith('Can’t reach the NeuroPal backend'));
    });
  });
}
