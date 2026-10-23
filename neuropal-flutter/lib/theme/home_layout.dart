// Home layout (tiles + day rules) — the part of packages/tokens/src/home.js
// that M1 needs: normalizeHome, because the Home layout is stored inside
// the appearance object and must round-trip untouched.
//
// TODO(M2): port effectiveTiles / moveTile / patchTile with the Arrange
// Home screen (fixtures: `effectiveTiles` in token_cases.json).

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
