// Backend address selection, error envelopes and the document API.

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/document_source.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const tailscale = 'ryx-mac-mini.tail73ed8.ts.net';
const lan = '192.168.3.169';

Future<Backend> makeBackend(http.Client client, {Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  return Backend(prefs: await SharedPreferences.getInstance(), client: client);
}

void main() {
  group('choosing the address', () {
    test('first reachable candidate in preference order wins', () async {
      final backend = await makeBackend(fakeBackend(reachableHosts: {lan}));
      await backend.probe();
      expect(backend.state, BackendState.online);
      expect(backend.active!.label, 'Home Wi-Fi');
      final tailscaleResult = backend.results.first;
      expect(tailscaleResult.reachable, isFalse);
      expect(tailscaleResult.error, 'connection refused');
    });

    test('never fastest-wins: a slower Tailscale answer still wins', () async {
      final client = MockClient((request) async {
        if (request.url.host == tailscale) {
          await Future<void>.delayed(const Duration(milliseconds: 80));
        }
        return http.Response('{"status":"ok"}', 200);
      });
      final backend = await makeBackend(client);
      await backend.probe();
      expect(backend.active!.label, 'Tailscale');
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
      expect(backend.offlineMessage(), contains('Tailscale: connection refused'));
      expect(backend.offlineMessage(), contains('Home Wi-Fi: connection refused'));
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
