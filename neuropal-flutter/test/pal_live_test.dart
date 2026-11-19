// Pal and the upload against a REAL NeuroPal API (the dev server or any):
//   node neuropal-platform/scripts/qa/dev-api.cjs 4425
//   NP_TEST_API=http://127.0.0.1:4425 flutter test test/pal_live_test.dart
// Skipped unless NP_TEST_API is set (NP_TEST_EMAIL / NP_TEST_PASSWORD
// override the dev account). Every request is recorded: Break it down and
// Talk get the server's answers; a crisis-sounding task and message send
// NOTHING; Clear chat deletes the server's copy; a small text file goes up
// as a multipart upload (field `file`) and is in the library.
//
// A plain test(), not testWidgets(): the widget-test binding would stub
// out the network.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/document_source.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/pal/crisis.dart';
import 'package:neuropal/pal/pal_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

final String? live = Platform.environment['NP_TEST_API'];

/// Forwards to the network and remembers each request (method and path).
class _Recorder extends http.BaseClient {
  final _inner = http.Client();
  final requests = <String>[];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    requests.add('${request.method} ${request.url.path}');
    return _inner.send(request);
  }

  @override
  void close() => _inner.close();
}

void main() {
  test(
    'live: Pal’s tools and an upload against a real NeuroPal API',
    () async {
      final base = Backend.normalizeBaseUrl(live)!;
      SharedPreferences.setMockInitialValues({});
      final net = _Recorder();
      addTearDown(net.close);
      final backend = Backend(
        prefs: await SharedPreferences.getInstance(),
        client: net,
        defaults: [BackendCandidate('Live', base)],
        sessions: SessionStore.memory(),
      );
      await backend.probe();
      expect(backend.isOnline, isTrue, reason: 'is the API running at $base?');

      final login = await backend.postJson('/api/auth/login', {
        'email': Platform.environment['NP_TEST_EMAIL'] ?? 'ryx@example.com',
        'password': Platform.environment['NP_TEST_PASSWORD'] ?? 'neuropal-dev-1',
      }, server: base);
      await backend.sessions.save(base, (login as Map)['token'] as String);

      final pal = PalApi(backend);
      int palCalls() => net.requests.where((r) => r.contains('/api/pal/')).length;

      // Break it down: the server's steps (cleaned, 3–7).
      final steps = await pal.breakdown('write the intro of my thesis');
      expect(steps.crisis, isFalse);
      expect(steps.offline, isNull, reason: 'the server answered');
      expect(steps.steps.length, inInclusiveRange(3, 7));
      expect(net.requests, contains('POST /api/pal/breakdown'));

      // Talk: the server's reply.
      final reply = await pal.chat('I can’t start the CPI paper', {'state': null, 'palName': 'Pal'});
      expect(reply.crisis, isFalse);
      expect(reply.text, isNotEmpty);
      expect(net.requests, contains('POST /api/pal/chat'));

      // A crisis never leaves the phone, in either tool.
      final before = palCalls();
      final careful = await pal.chat('I want to  end\tmy life', {'state': 'red'});
      expect(careful.crisis, isTrue);
      expect(careful.text, kCrisisReply);
      final task = await pal.breakdown('kill myself');
      expect(task.crisis, isTrue);
      expect(palCalls(), before, reason: 'NO request for a crisis message');

      // Clear chat deletes the server's copy.
      expect(await pal.clearChat(), isTrue);
      expect(net.requests, contains('DELETE /api/pal/chat'));

      // Upload: a small text file, with progress; then it is in the library.
      final bytes = utf8.encode('Live upload check.\n\nCorrelation plenoptic imaging, in two lines.\n');
      var sent = 0;
      final doc = await ApiDocumentSource(backend).uploadDocument(
        filename: 'np-live-check.txt',
        length: bytes.length,
        bytes: Stream.value(bytes),
        onProgress: (s, _) => sent = s,
      );
      expect(net.requests, contains('POST /api/documents/upload'));
      expect(doc.id, isNotEmpty);
      expect(sent, greaterThanOrEqualTo(bytes.length));
      final list = await backend.getJson('/api/documents');
      expect([for (final d in list as List) (d as Map)['_id'] ?? d['id']], contains(doc.id));
      await backend.deleteJson('/api/documents/${doc.id}');
    },
    skip: live == null ? 'set NP_TEST_API (e.g. http://127.0.0.1:4425) to run against a live API' : false,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
