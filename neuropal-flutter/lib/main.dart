// NeuroPal for Flutter — start-up.
//
// Loads the saved preferences, creates the long-lived services (backend
// connection, settings, appearance, speech engine) and starts the app.

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'reader/speech_engine.dart';
import 'services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _registerFontLicences();
  final prefs = await SharedPreferences.getInstance();
  final services = AppServices(prefs: prefs, engine: FlutterTtsEngine());
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
