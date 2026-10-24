// The long-lived objects the app is made of, created once at start-up
// (lib/main.dart) and handed to the widget tree with provider.
//
// Tests build their own AppServices with fakes (an in-memory HTTP client,
// a fake speech engine, in-memory sessions), which is why nothing here
// reaches for globals.

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'auth/auth_controller.dart';
import 'data/backend.dart';
import 'data/demo_source.dart';
import 'data/document_source.dart';
import 'data/session_store.dart';
import 'data/settings_controller.dart';
import 'platform/widget_bridge.dart';
import 'reader/speech_engine.dart';
import 'theme/appearance_controller.dart';

class AppServices {
  /// [sessions] defaults to an in-memory store (tests, screenshots); the
  /// app passes the secure one loaded in main().
  AppServices({
    required this.prefs,
    required this.engine,
    http.Client? httpClient,
    AssetBundle? bundle,
    List<BackendCandidate> backends = kDefaultBackends,
    SessionStore? sessions,
  }) : sessions = sessions ?? SessionStore.memory(),
       settings = SettingsController(prefs) {
    backend = Backend(
      prefs: prefs,
      client: httpClient,
      defaults: backends,
      sessions: this.sessions,
    );
    auth = AuthController(backend: backend, sessions: this.sessions);
    api = ApiDocumentSource(backend);
    demo = DemoDocumentSource(prefs: prefs, bundle: bundle);
    appearance = AppearanceController(
      prefs: prefs,
      sync: (json) async {
        // Best effort: skipped while offline or without a session; a 404
        // from an older backend is ignored by the controller.
        if (!backend.isOnline || !auth.hasAccess) return;
        await backend.putJson('/api/me/appearance', {'appearance': json});
      },
    );
    // iOS Home/Lock Screen widgets wear the same look (no-op elsewhere).
    WidgetBridge.instance.attach(appearance);
  }

  final SharedPreferences prefs;
  final SpeechEngine engine;
  final SessionStore sessions;
  final SettingsController settings;
  late final Backend backend;
  late final AuthController auth;
  late final ApiDocumentSource api;
  late final DemoDocumentSource demo;
  late final AppearanceController appearance;

  /// The document source the user chose (demo is explicit opt-in only).
  DocumentSource get source => settings.demoMode ? demo : api;
}
