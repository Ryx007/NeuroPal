// End-to-end sign-in: the real app against in-memory servers with and
// without accounts. Reduce-motion is on (nothing animates forever).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neuropal/app.dart';
import 'package:neuropal/auth/sign_in_screen.dart';
import 'package:neuropal/data/session_store.dart';
import 'package:neuropal/library/library_screen.dart';
import 'package:neuropal/services.dart';
import 'package:neuropal/widgets/np_banner.dart';
import 'package:neuropal/widgets/np_buttons.dart';
import 'package:neuropal/widgets/np_pressable.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const signalLook =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';

final Map<String, Handler> oneDocument = {
  'GET /api/documents': (_) => jsonResponse([
    {'_id': 'a', 'title': 'Ghost imaging review', 'type': 'pdf', 'status': 'ready'},
  ]),
};

Future<AppServices> boot(
  WidgetTester tester, {
  required http.Client client,
  SessionStore? sessions,
  Map<String, Object> prefs = const {},
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues(prefs);
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: client,
    sessions: sessions,
  );
  await tester.pumpWidget(NeuroPalApp(services: services));
  await tester.pumpAndSettle();
  return services;
}

Finder field(String label) => find.widgetWithText(TextField, label);
Finder button(String label) => find.widgetWithText(NpButton, label);

/// The screen's main scrollable (text fields have their own Scrollables).
Finder mainList() => find
    .descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable))
    .first;

/// Every control on screen (the app's pressables and the text fields) is
/// at least 48 × 48 dp. Flutter's androidTapTargetGuideline can't be used
/// for this: it skips everything inside a scroll view — the whole form.
void expectTargetsOf48dp(WidgetTester tester) {
  final controls = [
    ...find.byType(NpPressable).evaluate(),
    ...find.byType(TextField).evaluate(),
  ];
  expect(controls.length, greaterThan(5));
  for (final element in controls) {
    final size = (element.renderObject! as RenderBox).size;
    expect(
      size.width >= 48 && size.height >= 48,
      isTrue,
      reason: '“${describeControl(element)}” is only $size',
    );
  }
}

String describeControl(Element element) {
  final widget = element.widget;
  if (widget is NpPressable && widget.semanticLabel != null) {
    return widget.semanticLabel!;
  }
  String? text;
  void visit(Element child) {
    if (text != null) return;
    final w = child.widget;
    if (w is Text && w.data != null) {
      text = w.data;
    } else {
      child.visitChildren(visit);
    }
  }

  element.visitChildren(visit);
  return text ?? widget.runtimeType.toString();
}

Future<void> signIn(WidgetTester tester, {String password = 'correct horse'}) async {
  await tester.enterText(field('Email'), 'ryx@example.com');
  await tester.enterText(field('Password'), password);
  await tester.tap(button('Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a server with accounts and no session: sign-in, not the app', (
    tester,
  ) async {
    await boot(tester, client: FakeAccountsServer().client());
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(find.byType(LibraryScreen), findsNothing);
    // No way around it: no navigation drawer on this screen.
    expect(find.byIcon(Icons.menu_rounded), findsNothing);
    expect(find.text('Cloud · api.ryx007.work'), findsOneWidget);
  });

  testWidgets('signing in opens the library; requests carry the token', (
    tester,
  ) async {
    final server = FakeAccountsServer(routes: oneDocument);
    final services = await boot(tester, client: server.client());
    await signIn(tester);

    expect(find.byType(SignInScreen), findsNothing);
    expect(find.text('Ghost imaging review'), findsOneWidget);
    expect(server.authHeaders('/api/documents').last, 'Bearer tok-1');
    expect(services.sessions.tokenFor(cloudBase), 'tok-1');
  });

  testWidgets('a wrong password: the reason is in a banner that is read out', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await boot(tester, client: FakeAccountsServer().client());
    await signIn(tester, password: 'nope');

    const reason =
        'That email and password don’t match an account on this server.';
    expect(find.text(reason), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(NpBanner)),
      isSemantics(isLiveRegion: true),
    );
    expect(find.byType(SignInScreen), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('problems are written under their field and announced', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final server = FakeAccountsServer();
    await boot(tester, client: server.client());
    await tester.tap(button('Sign in'));
    await tester.pump();

    expect(find.text('Enter your email address.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    // Android reads a field's error out (a live region).
    expect(
      tester.getSemantics(find.text('Enter your email address.')),
      isSemantics(isLiveRegion: true),
    );
    // The first problem gets the focus; nothing was sent.
    expect(tester.widget<TextField>(field('Email')).focusNode!.hasFocus, isTrue);
    expect(server.requests.where((r) => r.url.path == '/api/auth/login'), isEmpty);

    // Typing in the field clears its message.
    await tester.enterText(field('Email'), 'ryx@');
    await tester.pump();
    expect(find.text('Enter your email address.'), findsNothing);
    semantics.dispose();
  });

  testWidgets('the password can be shown and hidden again', (tester) async {
    await boot(tester, client: FakeAccountsServer().client());
    expect(tester.widget<TextField>(field('Password')).obscureText, isTrue);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(tester.widget<TextField>(field('Password')).obscureText, isFalse);
    expect(find.byTooltip('Hide password'), findsOneWidget);
  });

  testWidgets('create account: name and invite code, then the library', (
    tester,
  ) async {
    final server = FakeAccountsServer(routes: oneDocument);
    final services = await boot(tester, client: server.client());
    await tester.tap(button('Create an account'));
    await tester.pumpAndSettle();
    expect(field('Name (optional)'), findsOneWidget);
    expect(field('Invite code'), findsOneWidget);

    await tester.enterText(field('Email'), 'new@example.com');
    await tester.enterText(field('Password'), 'short');
    await tester.tap(button('Create account'));
    await tester.pump();
    expect(find.text('Use at least 8 characters.'), findsOneWidget);
    expect(find.text('Enter the invite code.'), findsOneWidget);

    await tester.enterText(field('Password'), 'long enough');
    await tester.enterText(field('Invite code'), 'wrong');
    await tester.tap(button('Create account'));
    await tester.pumpAndSettle();
    // The server's answer lands under the field it is about.
    expect(find.text('That invite code is not right.'), findsOneWidget);

    await tester.enterText(field('Invite code'), 'open-sesame');
    await tester.tap(button('Create account'));
    await tester.pumpAndSettle();
    expect(find.text('Ghost imaging review'), findsOneWidget);
    expect(server.accounts['new@example.com'], 'long enough');
    expect(services.sessions.tokenFor(cloudBase), isNotNull);
  });

  testWidgets('open sign-up asks for no invite code', (tester) async {
    await boot(tester, client: FakeAccountsServer(signup: 'open').client());
    await tester.tap(button('Create an account'));
    await tester.pumpAndSettle();
    expect(field('Name (optional)'), findsOneWidget);
    expect(field('Invite code'), findsNothing);
  });

  testWidgets('closed sign-up offers no account creation', (tester) async {
    await boot(tester, client: FakeAccountsServer(signup: 'closed').client());
    expect(button('Create an account'), findsNothing);
    expect(find.text('This server isn’t taking new accounts.'), findsOneWidget);
  });

  testWidgets('a 401 while reading: back to sign-in, nothing left behind', (
    tester,
  ) async {
    final server = FakeAccountsServer(routes: oneDocument);
    final services = await boot(
      tester,
      client: server.client(),
      sessions: SessionStore.memory({cloudBase: server.issue('ryx@example.com')}),
    );
    expect(find.text('Ghost imaging review'), findsOneWidget);

    server.expireAll();
    await tester.tap(find.byTooltip('Refresh the library'));
    await tester.pumpAndSettle();

    expect(find.byType(SignInScreen), findsOneWidget);
    expect(
      find.text('Your session ended. Sign in again to carry on.'),
      findsOneWidget,
    );
    expect(find.text('Ghost imaging review'), findsNothing);
    expect(services.sessions.tokenFor(cloudBase), isNull);
    // The same account is offered again.
    expect(
      tester.widget<TextField>(field('Email')).controller!.text,
      'ryx@example.com',
    );

    // Signing in again loads the library afresh.
    await tester.enterText(field('Password'), 'correct horse');
    await tester.tap(button('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Ghost imaging review'), findsOneWidget);
  });

  testWidgets('a LOCAL_MODE server never shows sign-in', (tester) async {
    await boot(tester, client: fakeBackend(routes: oneDocument));
    expect(find.byType(SignInScreen), findsNothing);
    expect(find.text('Ghost imaging review'), findsOneWidget);
  });

  testWidgets('offline with a saved session: the app opens, offline', (
    tester,
  ) async {
    await boot(
      tester,
      client: offlineBackend(),
      sessions: SessionStore.memory({cloudBase: 'tok'}),
    );
    expect(find.byType(SignInScreen), findsNothing);
    expect(find.text('Can’t reach the NeuroPal backend'), findsOneWidget);
  });

  testWidgets('Settings → Sign out: back to sign-in, the token deleted', (
    tester,
  ) async {
    final server = FakeAccountsServer(routes: oneDocument);
    final vault = MemorySessionVault({
      'np.session.$cloudBase': server.issue('ryx@example.com'),
    });
    await boot(
      tester,
      client: server.client(),
      sessions: await SessionStore.load(vault),
    );
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Sign out'),
      300,
      scrollable: mainList(),
    );
    await tester.pump();
    expect(find.text('Signed in as ryx@example.com'), findsOneWidget);

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(vault.values, isEmpty);
  });

  testWidgets('the demo library opens from sign-in without an account', (
    tester,
  ) async {
    await boot(tester, client: FakeAccountsServer().client());
    await tester.tap(find.text('Try the demo library'));
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsNothing);
    expect(
      find.text('Correlation plenoptic imaging: the basics'),
      findsOneWidget,
    );
  });

  testWidgets('“Change server” opens the connection panel', (tester) async {
    await boot(tester, client: FakeAccountsServer().client());
    await tester.tap(find.text('Change server'));
    await tester.pumpAndSettle();
    expect(find.text('Backend connection'), findsOneWidget);
    expect(find.text('Cloud  ·  in use'), findsOneWidget);
    expect(field('Custom address (tried first)'), findsOneWidget);
  });

  for (final (skin, look) in [('Classic', null), ('Signal', signalLook)]) {
    testWidgets('$skin: 48 dp targets, labels and contrast', (tester) async {
      final semantics = tester.ensureSemantics();
      await boot(
        tester,
        client: FakeAccountsServer().client(),
        prefs: {'np.appearance': ?look},
      );
      for (final mode in ['sign in', 'create account']) {
        expectTargetsOf48dp(tester);
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        if (mode == 'sign in') {
          await tester.tap(button('Create an account'));
          await tester.pumpAndSettle();
        }
      }
      semantics.dispose();
    });
  }

  testWidgets('fits at 200% text size, in both modes', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await boot(
      tester,
      client: FakeAccountsServer().client(),
      prefs: {'np.appearance': signalLook},
    );
    await tester.ensureVisible(button('Create an account'));
    await tester.pumpAndSettle();
    await tester.tap(button('Create an account'));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.text('Try the demo library'),
      find.byType(SingleChildScrollView),
      const Offset(0, -300),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
