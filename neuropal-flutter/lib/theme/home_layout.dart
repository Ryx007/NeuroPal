// Home layout (tiles + day rules) — port of packages/tokens/src/home.js:
// normalizeHome (the layout lives inside the appearance object and must
// round-trip untouched), and what Home shows on a given day
// (effectiveTiles, homeForSkin). Checked against the JS by the
// `effectiveTiles` fixtures in test/tokens_parity_test.dart.
//
// TODO(M2): moveTile / patchTile arrive with the Arrange Home screen.

import 'js_compat.dart';
import 'tokens.g.dart';

class HomeTile {
  const HomeTile({required this.id, required this.size, required this.hidden});

  final String id;

  /// "S" | "M" | "L".
  final String size;
  final bool hidden;

  Map<String, Object?> toJson() => {'id': id, 'size': size, 'hidden': hidden};
}

class HomeRule {
  const HomeRule({required this.scope, required this.tile, required this.act});

  /// "Weekdays" | "Weekends".
  final String scope;
  final String tile;

  /// "first" | "last" | "hide".
  final String act;

  Map<String, Object?> toJson() => {'scope': scope, 'tile': tile, 'act': act};
}

class HomeLayout {
  const HomeLayout({required this.tiles, required this.rules});

  final List<HomeTile> tiles;
  final List<HomeRule> rules;

  Map<String, Object?> toJson() => {
    'tiles': [for (final t in tiles) t.toJson()],
    'rules': [for (final r in rules) r.toJson()],
  };
}

/// Keeps every known tile exactly once (tiles shipped later get appended),
/// drops unknown ids, coerces sizes, and de-duplicates rules (one per
/// scope + tile).
HomeLayout normalizeHome(Object? input) {
  final src = jsObject(input);
  final tileIds = kHomeTiles.keys.toList();
  final seen = <String>{};
  final tiles = <HomeTile>[];

  final rawTiles = src['tiles'];
  for (final t in rawTiles is List ? rawTiles : const []) {
    if (t is! Map) continue;
    final id = t['id'];
    if (id is! String || !tileIds.contains(id) || seen.contains(id)) continue;
    seen.add(id);
    final size = t['size'];
    tiles.add(
      HomeTile(
        id: id,
        size: size is String && kHomeSizes.contains(size) ? size : 'M',
        hidden: jsTruthy(t['hidden']),
      ),
    );
  }
  for (final d in kHomeDefaultTiles) {
    final id = d['id'] as String;
    if (!seen.contains(id)) {
      tiles.add(
        HomeTile(id: id, size: d['size'] as String, hidden: d['hidden'] as bool),
      );
    }
  }

  final rules = <HomeRule>[];
  final ruleKeys = <String>{};
  final rawRules = src['rules'];
  for (final r in rawRules is List ? rawRules : const []) {
    if (r is! Map) continue;
    final scope = r['scope'];
    final tile = r['tile'];
    final act = r['act'];
    if (!kHomeRuleScopes.contains(scope) ||
        !tileIds.contains(tile) ||
        !kHomeRuleActs.contains(act)) {
      continue;
    }
    final key = '$scope:$tile';
    if (ruleKeys.contains(key)) continue;
    ruleKeys.add(key);
    rules.add(
      HomeRule(scope: scope as String, tile: tile as String, act: act as String),
    );
  }
  return HomeLayout(tiles: tiles, rules: rules);
}

/// "Weekdays" | "Weekends" — the day rules' scope for [date].
String scopeForDate(DateTime date) =>
    date.weekday == DateTime.saturday || date.weekday == DateTime.sunday
    ? 'Weekends'
    : 'Weekdays';

/// The tiles Home shows on [date]: the saved order with that day's rules
/// applied, hidden tiles removed. Position rules move a tile; they never
/// change whether it shows. [home] is a [HomeLayout] or its JSON.
List<HomeTile> effectiveTiles(Object? home, DateTime date) {
  final h = normalizeHome(home is HomeLayout ? home.toJson() : home);
  final scope = scopeForDate(date);
  final out = List<HomeTile>.of(h.tiles);
  for (final r in h.rules.where((x) => x.scope == scope)) {
    final i = out.indexWhere((t) => t.id == r.tile);
    if (i < 0) continue;
    final t = out.removeAt(i);
    switch (r.act) {
      case 'hide':
        out.insert(i, HomeTile(id: t.id, size: t.size, hidden: true));
      case 'first':
        out.insert(0, t);
      default:
        out.add(t);
    }
  }
  return [
    for (final t in out)
      if (!t.hidden) t,
  ];
}

/// True while the person has never arranged Home (the v2 default layout,
/// no rules).
bool isDefaultHome(Object? home) {
  final h = normalizeHome(home is HomeLayout ? home.toJson() : home);
  if (h.rules.isNotEmpty || h.tiles.length != kHomeDefaultTiles.length) {
    return false;
  }
  for (var i = 0; i < h.tiles.length; i++) {
    final t = h.tiles[i];
    final d = kHomeDefaultTiles[i];
    if (t.id != d['id'] || t.size != d['size'] || t.hidden != d['hidden']) {
      return false;
    }
  }
  return true;
}

/// tokens.js CLASSIC_HOME_DEFAULT: the Classic skin's original Home (check-in,
/// minimum day, anchor, reading). Not exported to tokens.g.dart yet, so it
/// is written out here; it must stay identical to the JS value.
const List<Map<String, Object>> _classicHomeDefaultTiles = [
  {'id': 'state', 'size': 'L', 'hidden': false},
  {'id': 'mvd', 'size': 'L', 'hidden': false},
  {'id': 'anchor', 'size': 'M', 'hidden': false},
  {'id': 'reading', 'size': 'M', 'hidden': false},
  {'id': 'focus', 'size': 'M', 'hidden': true},
  {'id': 'pal', 'size': 'S', 'hidden': true},
];

/// The layout a skin shows. Until the person arranges Home, Classic keeps
/// its original screen and Signal uses the v2 default; once arranged, their
/// layout applies to both skins.
HomeLayout homeForSkin(Object? home, String skin) {
  final h = normalizeHome(home is HomeLayout ? home.toJson() : home);
  if (skin == 'classic' && isDefaultHome(h)) {
    return normalizeHome({'tiles': _classicHomeDefaultTiles, 'rules': const []});
  }
  return h;
}
