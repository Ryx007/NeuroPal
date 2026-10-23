// The long-lived objects the app is made of, created once at start-up
// (lib/main.dart) and handed to the widget tree with provider.
//
// Tests build their own AppServices with fakes (an in-memory HTTP client,
// a fake speech engine), which is why nothing here reaches for globals.

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'data/backend.dart';
import 'data/demo_source.dart';
import 'data/document_source.dart';
import 'data/settings_controller.dart';
import 'reader/speech_engine.dart';
import 'theme/appearance_controller.dart';

class AppServices {
  AppServices({
    required this.prefs,
    required this.engine,
    http.Client? httpClient,
    AssetBundle? bundle,
    List<BackendCandidate> backends = kDefaultBackends,
  }) : backend = Backend(prefs: prefs, client: httpClient, defaults: backends),
       settings = SettingsController(prefs) {
    api = ApiDocumentSource(backend);
    demo = DemoDocumentSource(prefs: prefs, bundle: bundle);
    appearance = AppearanceController(
      prefs: prefs,
      sync: (json) async {
        // Best effort: skipped while offline; a 404 from an older backend
        // is ignored by the controller.
        if (!backend.isOnline) return;
        await backend.putJson('/api/me/appearance', {'appearance': json});
      },
    );
  }

  final SharedPreferences prefs;
  final SpeechEngine engine;
  final Backend backend;
  final SettingsController settings;
  late final ApiDocumentSource api;
  late final DemoDocumentSource demo;
  late final AppearanceController appearance;

  /// The document source the user chose (demo is explicit opt-in only).
  DocumentSource get source => settings.demoMode ? demo : api;
}
