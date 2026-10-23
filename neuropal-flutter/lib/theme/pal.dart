// Pal (the little companion) — port of packages/tokens/src/pal.js.
//
// M1 only needs normalizePal (part of the appearance object) and the two
// colour helpers. "Build your Pal" itself is an M2 screen.

import 'color_math.dart';
import 'js_compat.dart';
import 'tokens.g.dart';

class PalSettings {
  const PalSettings({
    required this.name,
    required this.shape,
    required this.colour,
    required this.eyes,
    required this.mouth,
    required this.extra,
    required this.talk,
    required this.voice,
    required this.people,
  });

  final String name;
  final String shape;
  final String colour;
  final String eyes;
  final String mouth;
  final String extra;
  final String talk;
  final String voice;

  /// Pal nudges the user toward people (body doubling with humans).
  final bool people;

  Map<String, Object?> toJson() => {
    'name': name,
    'shape': shape,
    'colour': colour,
    'eyes': eyes,
    'mouth': mouth,
    'extra': extra,
    'talk': talk,
    'voice': voice,
    'people': people,
  };
}

/// Repairs any Pal object; unknown values fall back to the defaults.
PalSettings normalizePal(Object? input) {
  final src = jsObject(input);
  final d = kPalDefault;
  final rawName = src['name'];
  final trimmed = rawName is String ? rawName.trim() : '';
  final name = trimmed.length > 14 ? trimmed.substring(0, 14) : trimmed;

  String inMap(String key, Map<String, Object> options) {
    final v = src[key];
    return v is String && options.containsKey(v) ? v : d[key] as String;
  }

  String inList(String key, List<String> options) {
    final v = src[key];
    return v is String && options.contains(v) ? v : d[key] as String;
  }

  return PalSettings(
    name: name.isNotEmpty ? name : d['name'] as String,
    shape: inMap('shape', kPalShapes),
    colour: inMap('colour', kPalColours),
    eyes: inList('eyes', kPalEyes),
    mouth: inList('mouth', kPalMouths),
    extra: inList('extra', kPalExtras),
    talk: inMap('talk', kPalTalk),
    voice: inMap('voice', kPalVoice),
    people: src['people'] is bool ? src['people'] as bool : d['people'] as bool,
  );
}

/// Face ink (eyes/mouth) that reads on the chosen body colour.
String palFaceInk(String? bodyHex) {
  final body = hexToRgb(bodyHex) ?? const Rgb(228, 228, 232);
  return contrastRatio(Rgb.ink, body) >= contrastRatio(Rgb.white, body)
      ? '#141416'
      : '#FFFFFF';
}

/// The visor is the accent — unless the body IS (nearly) the accent, in
/// which case it would vanish, so it takes the face ink instead.
String palVisor(String? bodyHex, String accentHex) {
  final body = hexToRgb(bodyHex) ?? const Rgb(228, 228, 232);
  final acc = hexToRgb(accentHex) ?? const Rgb(255, 61, 46);
  return contrastRatio(acc, body) < 1.6 ? palFaceInk(bodyHex) : accentHex;
}
