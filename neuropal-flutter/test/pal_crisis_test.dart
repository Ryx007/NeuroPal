// Pal's crisis check must be the server's, exactly:
//   1. the pattern string is byte-identical to CRISIS in
//      neuropal-backend/src/routes/pal.js, with the same flags (read from
//      that file now, not copied into this test);
//   2. the phrase lists of neuropal-backend/test/pal.test.js (read from it
//      too) come out the same as on the server, plus whitespace variants
//      (double space, tab, newline, non-breaking space…), since the server
//      collapses whitespace before it tests;
//   3. when node is installed, a real JavaScript engine runs the server's
//      own pattern and normalisation on every phrase, and Dart must agree.
// The same approach as neuropal-platform/scripts/qa/web-shell-crisis.mjs.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:neuropal/pal/crisis.dart';

final _repo = Directory.current.parent.path;
String _read(String path) => File('$_repo/$path').readAsStringSync();

/// CRISIS's source and flags, as written in pal.js.
({String source, String flags}) _backendPattern() {
  final src = _read('neuropal-backend/src/routes/pal.js');
  final m = RegExp(r'const CRISIS\s*=\s*/(.+)/([dgimsuvy]*);').firstMatch(src);
  if (m == null) throw StateError('no CRISIS literal in pal.js');
  return (source: m.group(1)!, flags: m.group(2)!);
}

/// A JavaScript string literal's body → the string (\t, \n, \uXXXX …).
String _unescapeJs(String body) => body.replaceAllMapped(
  RegExp(r'\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)'),
  (m) {
    final e = m.group(1)!;
    if (e.startsWith('u') && e.length == 5) return String.fromCharCode(int.parse(e.substring(1), radix: 16));
    if (e.startsWith('x') && e.length == 3) return String.fromCharCode(int.parse(e.substring(1), radix: 16));
    return switch (e) {
      't' => '\t',
      'n' => '\n',
      'r' => '\r',
      'v' => '\v',
      'f' => '\f',
      'b' => '\b',
      '0' => '\u0000',
      _ => e,
    };
  },
);

final _quoted = RegExp(r"'((?:[^'\\]|\\.)*)'|" r'"((?:[^"\\]|\\.)*)"');
List<String> _strings(String code) => [
  for (final m in _quoted.allMatches(code)) _unescapeJs(m.group(1) ?? m.group(2)!),
];

/// The arrays of the first [count] `for (const <name> of [...])` loops after
/// [marker] in pal.test.js.
List<List<String>> _loops(String marker, String name, int count) {
  final src = _read('neuropal-backend/test/pal.test.js');
  final at = src.indexOf(marker);
  if (at < 0) throw StateError('pal.test.js has no test “$marker”');
  final block = src.substring(at);
  return RegExp('for \\(const $name of \\[([\\s\\S]*?)\\]\\)')
      .allMatches(block)
      .take(count)
      .map((m) => _strings(m.group(1)!))
      .toList();
}

/// The server's order (pal.js): collapse whitespace, trim (JavaScript's
/// trim removes exactly what `\s` matches), then the apostrophes. Written
/// out again here on purpose, apart from the app's own function.
bool _serverCheck(RegExp re, String text) {
  final s = text
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'^\s+|\s+$'), '')
      .replaceAll(RegExp('[’‘]'), "'");
  return re.hasMatch(s);
}

void main() {
  final backend = _backendPattern();
  final serverRe = RegExp(
    backend.source,
    caseSensitive: !backend.flags.contains('i'),
    multiLine: backend.flags.contains('m'),
    unicode: backend.flags.contains('u'),
    dotAll: backend.flags.contains('s'),
  );

  test('the pattern is byte-identical to the server’s, with the same flags', () {
    expect(kCrisisPattern, backend.source);
    expect(utf8.encode(kCrisisPattern), utf8.encode(backend.source));
    expect(kCrisis.pattern, backend.source);
    expect(backend.flags, 'i', reason: 'the server’s flags changed: update kCrisis');
    expect(kCrisis.isCaseSensitive, isFalse);
    expect(kCrisis.isMultiLine, isFalse);
    expect(kCrisis.isUnicode, isFalse);
    expect(kCrisis.isDotAll, isFalse);
  });

  // ---- the phrases ----------------------------------------------------------

  final lists = _loops('the crisis check covers common phrasings', 'm', 2);
  final crisis = [...lists[0]];
  final everyday = [...lists[1]];
  final whitespaceTasks = _loops('a crisis-sounding task never reaches the model', 'task', 1).single;

  // Phrases the server's other tests send (one with a curly apostrophe):
  // they must stay in pal.test.js for this list to be honest (checked below).
  final testSource = _read('neuropal-backend/test/pal.test.js');
  const otherCrisis = ['I don’t want to be alive anymore', 'I want to kill myself', 'I want to die'];
  const otherEveryday = ['this bug is killing me'];
  for (final m in otherCrisis) {
    if (!crisis.contains(m)) crisis.add(m);
  }
  for (final m in otherEveryday) {
    if (!everyday.contains(m)) everyday.add(m);
  }

  // Whitespace and typing variants: the server collapses \s+ before it
  // tests, so these must all be caught on the phone too.
  final variants = [
    ...whitespaceTasks,
    'I want to  die',
    'kill\tmyself',
    'I want to\nend my life',
    'I want to\r\nend my life',
    'voglio morire',
    'i want to die',
    'want to　die',
    '  \t I want to die \n ',
    'I WANT TO DIE',
    'I don’t want to live',
    'I don‘t want to exist',
    'nobody   would\tmiss me',
  ];

  test('the server’s phrase lists were read', () {
    for (final m in [...otherCrisis, ...otherEveryday]) {
      expect(testSource, contains(m), reason: 'pal.test.js no longer sends “$m”');
    }
    expect(crisis.length, greaterThanOrEqualTo(10));
    expect(everyday.length, greaterThanOrEqualTo(5));
    expect(whitespaceTasks, contains('kill\tmyself'), reason: 'JS escapes are read as characters');
    expect(whitespaceTasks, contains('voglio morire'));
  });

  test('every crisis phrase is caught, as on the server', () {
    for (final m in crisis) {
      expect(_serverCheck(serverRe, m), isTrue, reason: 'server: $m');
      expect(looksLikeCrisis(m), isTrue, reason: m);
    }
  });

  test('everyday talk is not a crisis, as on the server', () {
    for (final m in everyday) {
      expect(_serverCheck(serverRe, m), isFalse, reason: 'server: $m');
      expect(looksLikeCrisis(m), isFalse, reason: m);
    }
  });

  test('whitespace variants are caught (the text is normalised like the server’s)', () {
    for (final m in variants) {
      expect(looksLikeCrisis(m), isTrue, reason: jsonEncode(m));
      expect(_serverCheck(serverRe, m), isTrue, reason: 'server: ${jsonEncode(m)}');
    }
    expect(normalizeForCrisis('  kill\t my\nself  '), 'kill my self');
    expect(normalizeForCrisis('I don’t'), "I don't");
    expect(normalizeForCrisis('I don‘t'), "I don't");
    // Dart's trim() also strips U+0085; the server's doesn't. Mirror it.
    expect(normalizeForCrisis('\u0085kms'), '\u0085kms');
  });

  // ---- a real JavaScript engine, when there is one ------------------------------

  final node = Process.runSync('which', ['node']).exitCode == 0;
  test(
    'node runs the server’s own pattern and normalisation: Dart agrees on every phrase',
    () {
      final phrases = [...crisis, ...everyday, ...variants];
      const script = r'''
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const m = src.match(/const CRISIS\s*=\s*\/(.+)\/([dgimsuvy]*);/);
const re = new RegExp(m[1], m[2]);
const phrases = JSON.parse(fs.readFileSync(0, "utf8"));
// pal.js: the route collapses whitespace and trims; looksLikeCrisis maps the apostrophes.
const check = (t) => re.test(String(t || "").replace(/\s+/g, " ").trim().replace(/[’‘]/g, "'"));
process.stdout.write(JSON.stringify(phrases.map(check)));
''';
      final dir = Directory.systemTemp.createTempSync('np-crisis');
      addTearDown(() => dir.deleteSync(recursive: true));
      final file = File('${dir.path}/check.js')..writeAsStringSync(script);
      final input = File('${dir.path}/phrases.json')..writeAsStringSync(jsonEncode(phrases));
      final result = Process.runSync('sh', [
        '-c',
        'node "${file.path}" "$_repo/neuropal-backend/src/routes/pal.js" < "${input.path}"',
      ]);
      expect(result.exitCode, 0, reason: '${result.stderr}');
      final js = (jsonDecode(result.stdout as String) as List).cast<bool>();
      for (final (i, p) in phrases.indexed) {
        expect(looksLikeCrisis(p), js[i], reason: 'Dart and the server disagree on ${jsonEncode(p)}');
      }
    },
    skip: node ? false : 'node is not installed here',
  );
}
