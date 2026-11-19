// The library upload as a state machine, against an in-memory server that
// reads the multipart body as it streams: real progress, Cancel and Try
// again, every failure as one plain sentence, the checks made on the phone
// before anything is sent, sign-out stopping it, and the demo library.

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/data/backend.dart';
import 'package:neuropal/data/document_source.dart';
import 'package:neuropal/data/models.dart';
import 'package:neuropal/library/upload_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const mb = 1024 * 1024;

class Rig {
  Rig(this.controller, this.server, this.backend, this.added);

  final UploadController controller;
  final FakeUploadServer server;
  final Backend backend;
  final List<DocumentSummary> added;

  UploadItem get item => controller.items.single;
}

Future<Rig> rig({bool demo = false, http.Client? client, FakeUploadServer? server}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final s = server ?? FakeUploadServer();
  final backend = Backend(prefs: prefs, client: client ?? s.client());
  await backend.probe();
  final added = <DocumentSummary>[];
  final controller = UploadController(
    source: ApiDocumentSource(backend),
    isDemo: () => demo,
    onUploaded: added.add,
    stall: const Duration(milliseconds: 300),
  );
  addTearDown(controller.dispose);
  return Rig(controller, s, backend, added);
}

void main() {
  test('progress while it goes up; then the new document joins the library', () async {
    final r = await rig();
    r.server.pauseAfter = mb ~/ 2;
    final percents = <int>[];
    r.controller.addListener(() {
      final items = r.controller.items;
      if (items.isNotEmpty) percents.add(items.first.percent);
    });
    final run = r.controller.upload(fakePicked('paper.pdf', mb));
    await r.server.paused.future;
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(r.controller.busy, isTrue);
    expect(r.item.phase, UploadPhase.uploading);
    expect(r.item.percent, inInclusiveRange(40, 62), reason: 'half the file is out');
    expect(r.controller.news, 'Uploading “paper.pdf”.');

    r.server.release.complete();
    await run;
    expect(r.controller.busy, isFalse);
    expect(r.controller.items, isEmpty, reason: 'the document card takes over');
    expect(r.controller.status, '“paper.pdf” is in your library. Processing has started.');
    expect(r.added.single.id, 'up1');
    expect(r.added.single.isProcessing, isTrue);
    expect(r.server.received, greaterThan(mb), reason: 'the whole file arrived');
    expect(percents.first, lessThan(10));
    expect(percents.where((p) => p > 0 && p < 100), isNotEmpty);
    // One repaint per percent at most, not one per network chunk.
    expect(percents.length, lessThan(110));

    final request = r.server.uploads.single;
    expect(request.method, 'POST');
    expect(request.url.path, '/api/documents/upload');
    expect(request.headers['content-type'], startsWith('multipart/form-data; boundary='));
    expect(request, isA<http.MultipartRequest>());
    final file = (request as http.MultipartRequest).files.single;
    expect((file.field, file.filename, file.length), ('file', 'paper.pdf', mb));
  });

  test('Cancel stops it, nothing is added; Try again sends the same file', () async {
    final r = await rig();
    r.server.pauseAfter = 300 * 1024;
    final run = r.controller.upload(fakePicked('book.epub', mb));
    await r.server.paused.future;
    final key = r.item.key;
    r.controller.cancel(key);
    await run;
    expect(r.item.phase, UploadPhase.cancelled);
    expect(r.item.canRetry, isTrue);
    expect(r.controller.status, 'Upload cancelled. Nothing was added.');
    expect(r.added, isEmpty);

    r.server
      ..pauseAfter = null
      ..received = 0;
    await r.controller.retry(key);
    expect(r.controller.items, isEmpty);
    expect(r.added.single.id, 'up1');
    expect(r.server.uploads, hasLength(2));
    expect(r.server.received, greaterThan(mb));
  });

  test('each refusal from the server is one plain sentence', () async {
    final cases = <(int, Object?, String)>[
      (401, {'error': 'Invalid or expired token'}, 'Your session ended. Sign in again, then add the file again.'),
      (413, {'error': 'File too large'}, 'This file is larger than the server accepts.'),
      (400, {'error': 'file is required'}, 'The file didn’t arrive in one piece. Try again.'),
      (429, {'error': 'slow down', 'retryAfterSec': 30}, 'Too many uploads at once. Wait 30 s, then try again.'),
      (500, {'error': 'Mongo said no'}, 'The server couldn’t take the file this time. Try again in a moment.'),
      (503, null, 'The server couldn’t take the file this time. Try again in a moment.'),
    ];
    for (final (status, body, sentence) in cases) {
      final r = await rig();
      final refused = <String>[];
      r.backend.onUnauthorized = (server, token) => refused.add(server);
      r.server
        ..status = status
        ..answer = body ?? 'not json';
      await r.controller.upload(fakePicked('notes.md', 4096));
      expect(r.item.phase, UploadPhase.failed, reason: '$status');
      expect(r.item.error, sentence, reason: '$status');
      expect(r.item.canRetry, isTrue);
      expect(r.controller.news, '“notes.md” wasn’t uploaded. $sentence');
      expect(r.controller.status, isNull, reason: 'the row says why; it is only spoken');
      expect(r.added, isEmpty);
      // The 401 rule: a refused data request ends the session.
      expect(refused, status == 401 ? [tailscaleBase] : isEmpty);
    }
  });

  test('offline: nothing answers, so nothing goes up', () async {
    final r = await rig(client: offlineBackend());
    await r.controller.upload(fakePicked('paper.pdf', 2048));
    expect(
      r.item.error,
      'Can’t reach your NeuroPal server, so the file didn’t go up. Check the connection and try again.',
    );
    expect(r.item.canRetry, isTrue);
  });

  test('the connection drops halfway: said plainly, Try again offered', () async {
    final r = await rig();
    r.server.dropAfter = 200 * 1024;
    await r.controller.upload(fakePicked('paper.pdf', mb));
    expect(r.item.phase, UploadPhase.failed);
    expect(r.item.error, startsWith('Can’t reach your NeuroPal server'));
    expect(r.added, isEmpty);
  });

  test('a stall gives up after the silence limit (no overall time limit)', () async {
    final r = await rig();
    r.server.pauseAfter = 100 * 1024; // and never released
    await r.controller.upload(fakePicked('huge.pdf', mb));
    expect(r.item.phase, UploadPhase.failed);
    expect(
      r.item.error,
      'The upload stalled: nothing got through for a minute. Check the connection and try again.',
    );
  });

  test('checked on the phone first: a wrong file is never sent', () async {
    final r = await rig();
    final cases = <(String, int?, String)>[
      ('photo.jpg', 2048, 'NeuroPal can’t read .jpg files yet. It reads $kUploadKindsWords.'),
      ('README', 2048, 'NeuroPal can’t tell what kind of file this is. It reads $kUploadKindsWords.'),
      ('empty.txt', 0, 'This file is empty.'),
      ('atlas.pdf', 301 * mb, 'This file is larger than 300 MB, the most the server takes.'),
      ('cloud.pdf', null, 'The phone couldn’t tell how big this file is. Try picking it again.'),
    ];
    for (final (name, size, sentence) in cases) {
      await r.controller.upload(fakePicked(name, size));
      final item = r.controller.items.first;
      expect((item.name, item.phase, item.error), (name, UploadPhase.failed, sentence));
      expect(item.canRetry, isFalse);
      expect(r.controller.news, '“$name” wasn’t uploaded. $sentence');
    }
    expect(r.server.uploads, isEmpty, reason: 'nothing was sent');
    // Every kind the server reads passes (upper case too).
    for (final ext in ['pdf', 'EPUB', 'docx', 'pptx', 'md', 'markdown', 'txt', 'djvu', 'djv']) {
      expect(uploadProblem(fakePicked('a.$ext', 10)), isNull, reason: ext);
    }
    expect(uploadProblem(fakePicked('exactly.pdf', 300 * mb)), isNull);
  });

  test('a file the phone can’t read is said so (not blamed on the network)', () async {
    final r = await rig();
    await r.controller.upload(
      fakePicked(
        'moved.pdf',
        4096,
        open: () => Stream<List<int>>.error(const FileSystemException('gone')),
      ),
    );
    expect(r.item.error, 'The phone couldn’t read this file. Pick it again, then try once more.');
    expect(r.item.canRetry, isFalse);
  });

  test('signing out stops the upload and forgets the list, names included', () async {
    final r = await rig();
    r.server.pauseAfter = 200 * 1024;
    final run = r.controller.upload(fakePicked('private-diary.txt', mb));
    await r.server.paused.future;
    r.controller.reset();
    expect(r.controller.items, isEmpty);
    expect(r.controller.busy, isFalse);
    expect(r.controller.status, isNull);
    expect(r.controller.news, isNull);
    await run;
    expect(r.controller.items, isEmpty, reason: 'the stopped upload reports nothing afterwards');
    expect(r.added, isEmpty);
  });

  test('the demo library: the picker never opens, and it says why', () async {
    final r = await rig(demo: true);
    final picker = FakeDocumentPicker(next: fakePicked('paper.pdf', 10));
    await r.controller.pickAndUpload(picker);
    expect(picker.picks, 0);
    expect(r.controller.status, startsWith('Uploading needs your NeuroPal server. The demo library'));
    expect(r.server.uploads, isEmpty);
  });

  test('the picker: closed is nothing, a big file says "getting ready", a failure is a sentence', () async {
    final r = await rig();
    final picker = FakeDocumentPicker(preparing: true)..hold = Completer<void>();
    final run = r.controller.pickAndUpload(picker);
    await Future<void>.delayed(Duration.zero);
    expect(r.controller.picking, isTrue);
    expect(r.controller.preparing, isTrue);
    picker.hold!.complete();
    await run;
    expect(r.controller.preparing, isFalse);
    expect(r.controller.items, isEmpty, reason: 'closed without a file');

    await r.controller.pickAndUpload(FakeDocumentPicker(error: StateError('no activity')));
    expect(r.controller.status, 'The file picker didn’t work this time. Try again.');

    await r.controller.pickAndUpload(FakeDocumentPicker(next: fakePicked('ok.txt', 100)));
    expect(r.added.single.id, 'up1');
    expect(r.controller.items, isEmpty);
  });
}
