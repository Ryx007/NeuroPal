// Tiny helpers that reproduce JavaScript number/truthiness rules exactly.
//
// WHY this file exists: the colour and appearance logic is shared with the
// Expo app and the web platform, which run it as JavaScript
// (packages/tokens/src). The Dart port must produce byte-identical output —
// test/tokens_parity_test.dart compares every value against JS-computed
// fixtures. Dart and JS disagree on a few small things (how halves round,
// how `1.0` prints, what counts as "true"), so the port routes those through
// the functions below instead of using the Dart built-ins directly.

/// JS `Math.round`: halves round UP (towards +∞).
///
/// Dart's `round()` rounds halves AWAY from zero, so `(-2.5).round()` is -3
/// in Dart but `Math.round(-2.5)` is -2 in JS. Using `floor(x + 0.5)` would
/// also be wrong for 0.49999999999999994, so we compare the fraction instead.
double jsRound(num x) {
  final d = x.toDouble();
  if (d.isNaN || d.isInfinite) return d;
  final f = d.floorToDouble();
  return (d - f) >= 0.5 ? f + 1 : f;
}

/// [jsRound] for values that are known to be finite, as an `int`.
int jsRoundInt(num x) => jsRound(x).toInt();

/// JS `String(number)`: whole numbers print without a decimal point
/// (`1`, not Dart's `1.0`). Used where numbers are baked into strings, e.g.
/// `rgba(255,61,46,0.3)`.
String jsNumberToString(num x) {
  if (x is int) return x.toString();
  final d = x.toDouble();
  if (d.isFinite && d == d.truncateToDouble() && d.abs() < 1e21) {
    return d.toInt().toString();
  }
  return d.toString();
}

/// JS `Number(value)` for the kinds of values that arrive from JSON:
/// `null` → 0, booleans → 0/1, numeric strings → their value, anything
/// else → NaN. (Yes, `Number(null)` really is 0 in JS.)
double jsNumber(Object? value) {
  if (value == null) return 0;
  if (value is bool) return value ? 1 : 0;
  if (value is num) return value.toDouble();
  if (value is String) {
    final s = value.trim();
    if (s.isEmpty) return 0;
    final lower = s.toLowerCase();
    if (lower.startsWith('0x')) {
      final hex = int.tryParse(s.substring(2), radix: 16);
      return hex == null ? double.nan : hex.toDouble();
    }
    // JS accepts "Infinity" / "-Infinity" but not "inf" or "NaN" spellings
    // beyond that; double.tryParse matches closely enough for our inputs.
    return double.tryParse(s) ?? double.nan;
  }
  return double.nan;
}

/// JS truthiness (`Boolean(value)`): null, false, 0, NaN and "" are false;
/// everything else (including "false", lists and maps) is true.
bool jsTruthy(Object? value) {
  if (value == null) return false;
  if (value is bool) return value;
  if (value is num) return value != 0 && !value.isNaN;
  if (value is String) return value.isNotEmpty;
  return true;
}

/// Reads `input` as a JSON object (map with string keys). JS code like
/// `input && typeof input === "object" ? input : {}` maps to this.
Map<String, Object?> jsObject(Object? input) {
  if (input is Map) {
    return input.map((key, value) => MapEntry(key.toString(), value));
  }
  return const {};
}
