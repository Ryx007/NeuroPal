// Backend address selection, error envelopes, the session header and the
// document API.

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/document_source.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const tailscale = tailscaleHost;
const lan = '192.168.3.169';

Future<Backend> makeBackend(
  http.Client client, {
  Map<String, Object> prefs = const {},
  SessionStore? sessions,
}) async {
  SharedPreferences.setMockInitialValues(prefs);
  return Backend(
    prefs: await SharedPreferences.getInstance(),
    client: client,
    sessions: sessions,
  );
}

void main() {
  group('choosing the address', () {
    test('the cloud server comes first, then Tailscale, then home Wi-Fi', () {
      expect(kDefaultBackends.map((c) => c.base), [
        'https://api.ryx007.work',
        'http://ryx-mac-mini.tail73ed8.ts.net:4000',
        'http://192.168.3.169:4000',
      ]);
    });

    test('first reachable candidate in preference order wins', () async {
      final backend = await makeBackend(fakeBackend(reachableHosts: {lan}));
      await backend.probe();
      expect(backend.state, BackendState.online);
      expect(backend.active!.label, 'Home Wi-Fi');
      final cloudResult = backend.results.first;
      expect(cloudResult.candidate.label, 'Cloud');
      expect(cloudResult.reachable, isFalse);
      expect(cloudResult.error, 'connection refused');
    });

    test('never fastest-wins: a slower cloud answer still wins', () async {
      final client = MockClient((request) async {
        if (request.url.host == cloudHost) {
          await Future<void>.delayed(const Duration(milliseconds: 80));
        }
        return http.Response('{"status":"ok"}', 200);
      });
      final backend = await makeBackend(client);
      await backend.probe();
      expect(backend.active!.label, 'Cloud');
    });

    test('cloud down: a slower Tailscale answer beats the LAN', () async {
      final client = MockClient((request) async {
        if (request.url.host == cloudHost) {
          throw http.ClientException('Connection refused', request.url);
        }
        if (request.url.host == tailscale) {
          await Future<void>.delayed(const Duration(milliseconds: 80));
        }
        return http.Response('{"status":"ok"}', 200);
      });
      final backend = await makeBackend(client);
      await backend.probe();
      expect(backend.active!.label, 'Tailscale');
    });

    test('a name that can’t be found gets the right hint', () {
      final lookup = http.ClientException('Failed host lookup: x');
      expect(
        Backend.describeNetworkError(lookup, host: cloudHost),
        'name not found (is the phone online?)',
      );
      expect(
        Backend.describeNetworkError(lookup, host: tailscale),
        'name not found (is Tailscale on?)',
      );
    });

    test('a custom address from Settings is tried first', () async {
      final backend = await makeBackend(
        fakeBackend(reachableHosts: {'10.0.0.7', tailscale}),
      );
      expect(await backend.setCustomAddress('10.0.0.7:4000/'), isNull);
      expect(backend.customAddress, 'http://10.0.0.7:4000');
      expect(backend.active!.label, 'Custom');
      expect(backend.prefs.getString('np.backend.override'), 'http://10.0.0.7:4000');
    });

    test('rejects an unusable custom address', () async {
      final backend = await makeBackend(fakeBackend());
      expect(await backend.setCustomAddress('ftp://what'), isNotNull);
      expect(backend.customAddress, isNull);
    });

    test('nothing reachable → offline, with every reason in words', () async {
      final backend = await makeBackend(offlineBackend());
      await backend.probe();
      expect(backend.state, BackendState.offline);
      expect(backend.active, isNull);
      expect(backend.offlineMessage(), contains('Cloud: connection refused'));
      expect(backend.offlineMessage(), contains('Tailscale: connection refused'));
      expect(backend.offlineMessage(), contains('Home Wi-Fi: connection refused'));
    });
  });

  group('the session header', () {
    test('each server gets its own token, and only its own', () async {
      final requests = <http.Request>[];
      final sessions = SessionStore.memory({
        cloudBase: 'cloud-token',
        tailscaleBase: 'mac-token',
      });
      final backend = await makeBackend(
        fakeBackend(
          reachableHosts: {cloudHost, tailscale},
          requests: requests,
          routes: {'GET /api/documents': (_) => jsonResponse([])},
        ),
        sessions: sessions,
      );
      await backend.getJson('/api/documents');
      await backend.getJson('/api/documents', server: tailscaleBase);

      final sent = {
        for (final r in requests)
          if (r.url.path == '/api/documents')
            r.url.host: r.headers['Authorization'],
      };
      expect(sent, {
        cloudHost: 'Bearer cloud-token',
        tailscale: 'Bearer mac-token',
      });
      // The health probe never carries a token.
      expect(
        requests
            .where((r) => r.url.path == '/healthz')
            .map((r) => r.headers['Authorization']),
        everyElement(isNull),
      );
    });

    test('no saved session → no Authorization header', () async {
      final requests = <http.Request>[];
      final backend = await makeBackend(
        fakeBackend(
          requests: requests,
          routes: {'GET /api/documents': (_) => jsonResponse([])},
        ),
      );
      await backend.getJson('/api/documents');
      expect(
        requests.last.headers.containsKey('Authorization'),
        isFalse,
      );
    });

    test('a 401 from a data route is reported; from /api/auth/ it is not', () async {
      final calls = <(String, String?)>[];
      final backend = await makeBackend(
        fakeBackend(
          reachableHosts: {cloudHost},
          routes: {
            'GET /api/documents': (_) =>
                jsonResponse({'error': 'Invalid or expired token'}, 401),
            'POST /api/auth/login': (_) =>
                jsonResponse({'error': 'invalid email or password'}, 401),
          },
        ),
        sessions: SessionStore.memory({cloudBase: 'old'}),
      );
      backend.onUnauthorized = (server, token) => calls.add((server, token));

      await expectLater(
        backend.postJson('/api/auth/login', {'email': 'a@b', 'password': 'x'}),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
      );
      expect(calls, isEmpty); // a wrong password is the form's business

      await expectLater(
        backend.getJson('/api/documents'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
      );
      expect(calls, [(cloudBase, 'old')]);
    });

    test('429 carries how long to wait', () async {
      final backend = await makeBackend(
        fakeBackend(
          routes: {
            'POST /api/auth/login': (_) => jsonResponse({
              'error': 'Too many sign-in attempts',
              'retryAfterSec': 90,
            }, 429),
          },
        ),
      );
      await expectLater(
        backend.postJson('/api/auth/login', {}),
        throwsA(
          isA<ApiException>()
              .having((e) => e.status, 'status', 429)
              .having((e) => e.retryAfterSec, 'retryAfterSec', 90),
        ),
      );
    });
  });

  group('requests', () {
    test('error envelopes become ApiException with the message', () async {
      final backend = await makeBackend(
        fakeBackend(
          routes: {
            'GET /api/documents/x/text': (_) =>
                jsonResponse({'error': 'document not found'}, 404),
          },
        ),
      );
      await expectLater(
        backend.getJson('/api/documents/x/text'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.status, 'status', 404)
              .having((e) => e.message, 'message', 'document not found')
              .having((e) => e.unreachable, 'unreachable', isFalse),
        ),
      );
    });

    test('no answer at all → unreachable ApiException', () async {
      final backend = await makeBackend(offlineBackend());
      await expectLater(
        backend.getJson('/api/documents'),
        throwsA(isA<ApiException>().having((e) => e.unreachable, 'unreachable', isTrue)),
      );
    });
  });

  group('ApiDocumentSource', () {
    test('parses the library, text, progress and answers', () async {
      String? patched;
      final backend = await makeBackend(
        fakeBackend(
          routes: {
            'GET /api/documents': (_) => jsonResponse([
              {
                '_id': 'd1',
                'title': 'Sub-shot-noise imaging',
                'type': 'pdf',
                'status': 'embedding',
                'progress': 0.4,
                'readingProgress': 0.25,
                'pageCount': 12,
              },
            ]),
            'GET /api/documents/d1/text': (_) => jsonResponse({
              'id': 'd1',
              'title': 'Sub-shot-noise imaging',
              'text': 'Intro\n\nBody text.',
              'toc': [
                {'title': 'Intro', 'order': 1, 'startParagraph': 0},
              ],
              'source': 'chunks',
            }),
            'GET /api/documents/d1/progress': (_) =>
                jsonResponse({'progress': 0.5, 'lastWordIndex': 42}),
            'PATCH /api/documents/d1/progress': (r) {
              patched = r.body;
              return jsonResponse({'ok': true});
            },
            'POST /api/documents/d1/query': (_) => jsonResponse({
              'answer': r'**Yes.** It is $x$.',
              'citations': [
                {'chunkId': 'c1', 'page': 3, 'excerpt': 'the passage'},
              ],
              'mode': 'rag',
              'model': 'gemini-2.5-flash',
              'provider': 'gemini',
            }),
          },
        ),
      );
      final source = ApiDocumentSource(backend);

      final docs = await source.listDocuments();
      expect(docs.single.id, 'd1');
      expect(docs.single.isProcessing, isTrue);
      expect(docs.single.ingestProgress, 0.4);
      expect(docs.single.readingProgress, 0.25);

      final text = await source.getText('d1');
      expect(text.text, 'Intro\n\nBody text.');
      expect(text.toc.single.startParagraph, 0);

      final progress = await source.getProgress('d1');
      expect(progress.lastWordIndex, 42);

      await source.saveProgress('d1', progress: 0.5, lastWordIndex: 99);
      expect(patched, '{"progress":0.5,"lastWordIndex":99}');

      final answer = await source.ask('d1', 'Is it?');
      expect(answer.answer, startsWith('**Yes.**'));
      expect(answer.citations.single.page, 3);
      expect(answer.provider, 'gemini');
    });
  });
}
