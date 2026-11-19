// "Add a document" in the real app, by semantics actions: a file goes up
// with visible progress and Cancel, Try again sends it, and the new
// document's card takes over with its processing status. A wrong file is
// one sentence and nothing is sent; the demo library says why it can't
// take uploads; signing out stops an upload and forgets it.

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/app.dart';
import 'package:neuropal/auth/sign_in_screen.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/library/document_picker.dart';
import 'package:neuropal/library/library_controller.dart';
import 'package:neuropal/library/library_screen.dart';
import 'package:neuropal/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const mb = 1024 * 1024;

final List<Map<String, Object?>> library = [];

class Rig {
  Rig(this.services, this.server, this.picker);

  final AppServices services;
  final FakeUploadServer server;
  final FakeDocumentPicker picker;
}

Future<Rig> boot(
  WidgetTester tester, {
  Map<String, Object> prefs = const {},
  Map<String, Handler> routes = const {},
  SessionStore? sessions,
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(prefs);
  library.clear();
  final server = FakeUploadServer(
    routes: {'GET /api/documents': (_) => jsonResponse(library), ...routes},
  );
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: server.client(),
    sessions: sessions,
  );
  final picker = FakeDocumentPicker();
  await tester.pumpWidget(
    Provider<DocumentPicker>.value(value: picker, child: NeuroPalApp(services: services)),
  );
  await tester.pumpAndSettle();
  return Rig(services, server, picker);
}

SemanticsFinder tappable(String label) => find.semantics.byPredicate(
  (n) => n.label == label && n.getSemanticsData().hasAction(SemanticsAction.tap),
  describeMatch: (_) => 'tappable "$label"',
);

Future<void> press(WidgetTester tester, String label) async {
  tester.semantics.tap(tappable(label));
  await tester.pumpAndSettle();
}

Future<void> goLibrary(WidgetTester tester) async {
  await press(tester, 'Open navigation');
  tester.semantics.tap(find.semantics.byLabel(RegExp('^Library')));
  await tester.pumpAndSettle();
  expect(find.byType(LibraryScreen), findsOneWidget);
}

/// Pumps until [done] (the fake server works through microtasks).
Future<void> pumpUntil(WidgetTester tester, bool Function() done) async {
  for (var i = 0; i < 200 && !done(); i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
  expect(done(), isTrue);
}

void main() {
  testWidgets('a file goes up with progress; Cancel; Try again; the card takes over', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    await goLibrary(tester);
    expect(find.text('No documents yet'), findsOneWidget);
    expect(find.textContaining('“Add a document” above'), findsOneWidget);

    rig.picker.next = fakePicked('Quantum optics notes.pdf', mb);
    rig.server.pauseAfter = 300 * 1024;
    tester.semantics.tap(tappable('Add a document'));
    await pumpUntil(tester, () => rig.server.paused.isCompleted);
    await tester.pump();
    expect(find.text('Quantum optics notes.pdf'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^Uploading · \d+% of 1\.0 MB$')), findsOneWidget);
    final bar = tester.getSemantics(find.bySemanticsLabel('Uploading Quantum optics notes.pdf'));
    expect(int.parse(bar.value.replaceAll('%', '')), inInclusiveRange(15, 40));
    expect(
      tester.getSemantics(find.bySemanticsLabel('Add a document')),
      isSemantics(hasEnabledState: true, isEnabled: false, isButton: true),
      reason: 'one file at a time',
    );

    tester.semantics.tap(tappable('Cancel uploading Quantum optics notes.pdf'));
    await pumpUntil(tester, () => find.text('Cancelled. Nothing was added.').evaluate().isNotEmpty);
    expect(rig.server.aborts, 1);
    expect(find.text('Upload cancelled. Nothing was added.'), findsOneWidget);
    expect(find.text('No documents yet'), findsOneWidget);

    // Try again: this time it goes all the way; the server lists it next.
    rig.server.pauseAfter = null;
    library.add({'_id': 'up1', 'title': 'Quantum optics notes', 'type': 'pdf', 'status': 'pending', 'progress': 0});
    tester.semantics.tap(tappable('Try uploading Quantum optics notes.pdf again'));
    await pumpUntil(tester, () => find.text('“Quantum optics notes.pdf” is in your library. Processing has started.').evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    expect(find.text('Quantum optics notes.pdf'), findsNothing, reason: 'the upload row is gone');
    expect(find.text('Quantum optics notes'), findsOneWidget, reason: 'the document card took over');
    expect(find.textContaining('Processing · pending'), findsOneWidget);
    expect(rig.server.uploads, hasLength(2));

    // Processing done: the list's own polling moves it on (and stops).
    library[0] = {...library[0], 'status': 'ready'};
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Not started'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('a wrong file is one sentence, and nothing is sent', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester);
    await goLibrary(tester);
    rig.picker.next = fakePicked('holiday.jpg', 2048);
    await press(tester, 'Add a document');
    expect(find.text('holiday.jpg'), findsOneWidget);
    expect(
      find.text(
        'NeuroPal can’t read .jpg files yet. It reads PDF, EPUB, Word (.docx), PowerPoint (.pptx), '
        'Markdown, plain text and DjVu.',
      ),
      findsOneWidget,
    );
    expect(rig.server.uploads, isEmpty);
    await press(tester, 'Remove holiday.jpg from this list');
    expect(find.text('holiday.jpg'), findsNothing);
    semantics.dispose();
  });

  testWidgets('the demo library: no uploads, and it says why', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(tester, prefs: {'np.demoMode': true});
    await goLibrary(tester);
    expect(
      tester.getSemantics(find.bySemanticsLabel('Add a document')),
      isSemantics(hasEnabledState: true, isEnabled: false, isButton: true),
    );
    expect(find.textContaining('Uploading needs your NeuroPal server. The demo library is built into'), findsOneWidget);
    expect(rig.picker.picks, 0);
    semantics.dispose();
  });

  testWidgets('signing out stops an upload and forgets it', (tester) async {
    final semantics = tester.ensureSemantics();
    final rig = await boot(
      tester,
      routes: {
        'GET /api/auth/config': (_) => jsonResponse({'localMode': false, 'signup': 'invite'}),
        'GET /api/auth/me': (_) => jsonResponse({'id': 'u1', 'email': 'ryx@example.com', 'name': 'Ryx'}),
      },
      sessions: SessionStore.memory({tailscaleBase: 'tok-1'}),
    );
    await goLibrary(tester);
    rig.picker.next = fakePicked('private.txt', mb);
    rig.server.pauseAfter = 200 * 1024;
    tester.semantics.tap(tappable('Add a document'));
    await pumpUntil(tester, () => rig.server.paused.isCompleted);
    expect(rig.server.uploads.single.headers['Authorization'], 'Bearer tok-1');

    await rig.services.auth.signOut();
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(rig.server.aborts, 1, reason: 'the request was stopped');
    final uploads = tester.element(find.byType(SignInScreen)).read<LibraryController>().uploads;
    expect(uploads.busy, isFalse);
    expect(uploads.items, isEmpty, reason: 'the list goes, file names included');
    expect(uploads.status, isNull);
    semantics.dispose();
  });
}
