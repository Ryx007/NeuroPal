// NeuroPal for Flutter — start-up.
//
// Loads the saved preferences and sign-in sessions, creates the long-lived
// services (backend connection, sign-in, settings, appearance, speech
// engine) and starts the app.

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'data/session_store.dart';
import 'reader/speech_engine.dart';
import 'services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _registerFontLicences();
  final prefs = await SharedPreferences.getInstance();
  // Read before the first frame, so a saved session opens the app straight
  // away (and every request can attach its token without waiting).
  final sessions = await SessionStore.load(SecureSessionVault());
  final services = AppServices(
    prefs: prefs,
    engine: FlutterTtsEngine(),
    sessions: sessions,
  );
  runApp(NeuroPalApp(services: services));
}

/// The bundled fonts are SIL OFL: their licences must ship with the app
/// and show up under Settings → Open-source licences.
void _registerFontLicences() {
  const licences = {
    'Archivo': 'archivo-OFL.txt',
    'Atkinson Hyperlegible': 'atkinsonhyperlegible-OFL.txt',
    'Atkinson Hyperlegible Mono': 'atkinsonhyperlegiblemono-OFL.txt',
    'Atkinson Hyperlegible Next': 'atkinsonhyperlegiblenext-OFL.txt',
    'Fraunces': 'fraunces-OFL.txt',
    'Inter': 'inter-OFL.txt',
    'JetBrains Mono': 'jetbrainsmono-OFL.txt',
    'Lora': 'lora-OFL.txt',
    'Space Grotesk': 'spacegrotesk-OFL.txt',
  };
  LicenseRegistry.addLicense(() async* {
    for (final entry in licences.entries) {
      final text = await rootBundle.loadString(
        'assets/fonts/LICENSES/${entry.value}',
      );
      yield LicenseEntryWithLineBreaks(['${entry.key} (font)'], text);
    }
  });
}
