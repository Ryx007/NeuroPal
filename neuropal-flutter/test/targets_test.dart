// Touch targets and big text on the screens round 4 added (Home, Pal, the
// anchors sheet, the calming steps, the upload row), in both skins:
//   * every control is at least 48 × 48 dp (the check sign_in_test makes
//     for the sign-in screen, applied here);
//   * a 360 dp wide phone at 200 % text raises no layout error (an overflow
//     is one): Home's tile heads wrap instead of clipping.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/app.dart';
import 'package:neuropal/app_routes.dart';
import 'package:neuropal/calm/calm_screen.dart';
import 'package:neuropal/calm/help_lines.dart';
import 'package:neuropal/day/day_models.dart';
import 'package:neuropal/home/anchors_sheet.dart';
import 'package:neuropal/home/home_screen.dart';
import 'package:neuropal/library/document_picker.dart';
import 'package:neuropal/library/upload_panel.dart';
import 'package:neuropal/pal/pal_logic.dart';
import 'package:neuropal/pal/pal_sheet.dart';
import 'package:neuropal/services.dart';
import 'package:neuropal/widgets/np_pressable.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fakes.dart';

const signalLook =
    '{"v":1,"skin":"signal","signal":{"acc":"#FF3D2E","base":"Graphite","motion":"Lively","field":"Chladni","brutality":2,"corners":"Soft","texture":"Grain","type":"Wide"}}';

Future<AppServices> boot(
  WidgetTester tester, {
  String? look,
  double width = 412,
  double text = 1,
}) async {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  if (text != 1) {
    tester.platformDispatcher.textScaleFactorTestValue = text;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }
  tester.view.physicalSize = Size(width * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({'np.appearance': ?look});
  // The upload fails, so its row offers Try again and Remove.
  final server = FakeUploadServer(routes: {'GET /api/documents': (_) => jsonResponse([])})
    ..status = 500;
  final services = AppServices(
    prefs: await SharedPreferences.getInstance(),
    engine: FakeSpeechEngine(),
    httpClient: server.client(),
    clock: () => DateTime(2026, 11, 19, 11, 35),
  );
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<PhoneDialer>.value(value: FakePhoneDialer()),
        Provider<DocumentPicker>.value(
          value: FakeDocumentPicker(next: fakePicked('paper.pdf', 2 * 1024 * 1024)),
        ),
      ],
      child: NeuroPalApp(services: services),
    ),
  );
  await tester.pumpAndSettle();
  return services;
}

/// A realistic day: anchors (one done), a fourth task, a dump line.
void seed(AppServices services) {
  final day = services.day;
  final meds = day.addAnchor(
    const AnchorInput(title: 'Morning meds', hour: 8, minute: 15, category: AnchorCategory.medication),
  )!;
  day.setAnchorDone(meds, true);
  day.addAnchor(const AnchorInput(title: 'Lunch break', hour: 12, minute: 30, flexMinutes: 15));
  day.addTask('Email the lab about the SPAD array');
  day.addDump('Ask Milena about the SPAD dead time and the new detector');
}

String describeControl(Element element) {
  final widget = element.widget;
  if (widget is NpPressable && widget.semanticLabel != null) return widget.semanticLabel!;
  String? text;
  void visit(Element child) {
    if (text != null) return;
    final w = child.widget;
    if (w is Text && w.data != null) {
      text = w.data;
    } else if (w is Icon) {
      text = 'icon ${w.icon?.codePoint.toRadixString(16)}';
    } else {
      child.visitChildren(visit);
    }
  }

  element.visitChildren(visit);
  return text ?? widget.runtimeType.toString();
}

/// Controls under [of] smaller than 48 × 48 dp, described.
List<String> under48(Finder of) => [
  for (final type in [NpPressable, TextField])
    for (final e in find.descendant(of: of, matching: find.byType(type)).evaluate())
      if (e.renderObject case final RenderBox box when box.hasSize)
        if (box.size.width < 48 || box.size.height < 48)
          '${describeControl(e)} ${box.size.width.toStringAsFixed(0)}x${box.size.height.toStringAsFixed(0)}',
];

BuildContext home(WidgetTester tester) => tester.element(find.byType(HomeScreen));

/// Every layout error (an overflow is one) since the last call.
List<String> errors(WidgetTester tester) {
  final out = <String>[];
  for (Object? e = tester.takeException(); e != null; e = tester.takeException()) {
    out.add(e.toString().split('\n').first);
  }
  return out;
}

void main() {
  for (final (skin, look) in [('Classic', null), ('Signal', signalLook)]) {
    testWidgets('$skin: every control on the new screens is at least 48 dp', (tester) async {
      final services = await boot(tester, look: look);
      seed(services);
      await tester.pumpAndSettle();
      expect(under48(find.byType(HomeScreen)), isEmpty, reason: 'Home');

      showPalSheet(home(tester), from: AppRoutes.home);
      await tester.pumpAndSettle();
      expect(under48(find.byType(PalSheet)), isEmpty, reason: 'Pal’s tools');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();

      showPalSheet(home(tester), tool: PalTool.dump, from: AppRoutes.home);
      await tester.pumpAndSettle();
      expect(under48(find.byType(PalSheet)), isEmpty, reason: 'the brain dump');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();

      showAnchorsSheet(home(tester));
      await tester.pumpAndSettle();
      expect(under48(find.byType(AnchorsSheet)), isEmpty, reason: 'the anchors list');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();

      showAnchorsSheet(home(tester), add: true);
      await tester.pumpAndSettle();
      expect(under48(find.byType(AnchorsSheet)), isEmpty, reason: 'the anchor editor');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();

      Navigator.of(home(tester)).pushNamed(AppRoutes.calm);
      await tester.pumpAndSettle();
      expect(under48(find.byType(CalmScreen)), isEmpty, reason: 'the calming steps');
      Navigator.of(tester.element(find.byType(CalmScreen))).pop();
      await tester.pumpAndSettle();

      Navigator.of(home(tester)).pushNamed(AppRoutes.library);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add a document'));
      for (var i = 0; i < 100; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsOneWidget);
      expect(under48(find.byType(UploadSection)), isEmpty, reason: 'the upload row');
    });

    testWidgets('$skin: 360 dp wide at 200 % text, nothing overflows', (tester) async {
      final services = await boot(tester, look: look, width: 360, text: 2);
      seed(services);
      services.day.recordCheckin(NervousState.red, 0.86);
      await tester.pumpAndSettle();
      expect(errors(tester), isEmpty, reason: 'Home');
      // The minimum day's head: its label and its count + Edit don't fit on
      // one line here, so they stack — nothing clipped.
      final label = tester.getRect(find.text('MINIMUM VIABLE DAY'));
      final edit = tester.getRect(find.bySemanticsLabel('Edit tasks'));
      expect(edit.top, greaterThanOrEqualTo(label.bottom), reason: 'under the label');

      for (final tool in [null, ...PalTool.values]) {
        showPalSheet(home(tester), tool: tool, from: AppRoutes.home);
        await tester.pumpAndSettle();
        expect(errors(tester), isEmpty, reason: 'Pal ${tool?.name ?? 'tools'}');
        Navigator.of(home(tester)).pop();
        await tester.pumpAndSettle();
      }
      showAnchorsSheet(home(tester));
      await tester.pumpAndSettle();
      expect(errors(tester), isEmpty, reason: 'the anchors list');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();
      showAnchorsSheet(home(tester), add: true);
      await tester.pumpAndSettle();
      expect(errors(tester), isEmpty, reason: 'the anchor editor');
      Navigator.of(home(tester)).pop();
      await tester.pumpAndSettle();

      Navigator.of(home(tester)).pushNamed(AppRoutes.calm);
      await tester.pumpAndSettle();
      expect(errors(tester), isEmpty, reason: 'the calming steps');
      Navigator.of(tester.element(find.byType(CalmScreen))).pop();
      await tester.pumpAndSettle();

      Navigator.of(home(tester)).pushNamed(AppRoutes.library);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add a document'));
      for (var i = 0; i < 100; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      await tester.pumpAndSettle();
      expect(errors(tester), isEmpty, reason: 'the upload row');
    });
  }
}
