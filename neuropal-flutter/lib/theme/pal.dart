// Pal (the little companion) — port of packages/tokens/src/pal.js:
// normalizePal (part of the appearance object), Pal's lines in the user's
// talk style (palLine, palSay; the words live in tokens.g.dart), the
// description screen readers hear, and the two colour helpers. "Build your
// Pal" itself is an M2 screen.

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

/// Pal's "two minutes on {task}" line in the user's talk style. [task] is
/// a complete phrase ("the CPI notes", or a quoted task title): the
/// templates carry no article of their own.
String palLine(Object? pal, [String task = 'the CPI notes']) {
  final p = normalizePal(pal is PalSettings ? pal.toJson() : pal);
  return kPalTalk[p.talk]!.replaceFirst('{task}', task);
}

/// One of Pal's assistant lines (kPalLines) in the user's talk style. A key
/// a style doesn't define falls back to Gentle; an unknown key gives "".
/// [vars] fill {placeholders}; one without a value stays as written.
String palSay(Object? pal, String key, [Map<String, Object?> vars = const {}]) {
  final p = normalizePal(pal is PalSettings ? pal.toJson() : pal);
  final style = kPalLines[p.talk] ?? kPalLines['Gentle']!;
  final line = style[key] ?? kPalLines['Gentle']![key] ?? '';
  return line.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) {
    final k = m.group(1)!;
    return vars.containsKey(k) ? '${vars[k]}' : m.group(0)!;
  });
}

/// "Pal: pebble shape, chalk body, visor eyes, smile mouth, headphones".
String palDescription(Object? pal) {
  final p = normalizePal(pal is PalSettings ? pal.toJson() : pal);
  final extra = p.extra == 'None' ? 'no extras' : p.extra.toLowerCase();
  final mouth = p.mouth == 'None' ? 'no mouth' : '${p.mouth.toLowerCase()} mouth';
  return '${p.name}: ${p.shape.toLowerCase()} shape, '
      '${p.colour.toLowerCase()} body, ${p.eyes.toLowerCase()} eyes, '
      '$mouth, $extra';
}
