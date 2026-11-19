import Foundation

// Home layout (tiles + day rules) — port of packages/tokens/src/home.js.

public extension Tokens {
    /// normalizeHome(input): every known tile exactly once (tiles shipped
    /// later are appended), unknown ids dropped, sizes coerced, one rule per
    /// scope + tile.
    static func normalizeHome(_ json: JSONValue?) -> Appearance.Home {
        let src = JS.object(json)
        let t = tables
        let ids = t.homeTiles.map(\.id)
        var seen = Set<String>()
        var tiles: [Appearance.HomeTile] = []
        for item in src["tiles"]?.arrayValue ?? [] {
            // JS: `!t || !TILE_IDS.includes(t.id) || seen.has(t.id)` — only an
            // object can carry an id.
            guard case .object(let o) = item, let id = o["id"]?.stringValue, ids.contains(id), !seen.contains(id)
            else { continue }
            seen.insert(id)
            let size = o["size"]?.stringValue.flatMap { t.homeSizes.contains($0) ? $0 : nil } ?? "M"
            tiles.append(Appearance.HomeTile(id: id, size: size, hidden: JS.truthy(o["hidden"])))
        }
        for d in t.homeDefault.tiles where !seen.contains(d.id) { tiles.append(d) }
        var rules: [Appearance.HomeRule] = []
        var keys = Set<String>()
        for item in src["rules"]?.arrayValue ?? [] {
            guard case .object(let o) = item,
                  let scope = o["scope"]?.stringValue, t.homeRuleScopes.contains(scope),
                  let tile = o["tile"]?.stringValue, ids.contains(tile),
                  let act = o["act"]?.stringValue, t.homeRuleActs.contains(act)
            else { continue }
            let key = "\(scope):\(tile)"
            if keys.contains(key) { continue }
            keys.insert(key)
            rules.append(Appearance.HomeRule(scope: scope, tile: tile, act: act))
        }
        return Appearance.Home(tiles: tiles, rules: rules)
    }

    /// normalizeHome for a typed value.
    static func normalizeHome(_ home: Appearance.Home) -> Appearance.Home {
        let t = tables
        let ids = t.homeTiles.map(\.id)
        var seen = Set<String>()
        var tiles: [Appearance.HomeTile] = []
        for tile in home.tiles where ids.contains(tile.id) && !seen.contains(tile.id) {
            seen.insert(tile.id)
            tiles.append(Appearance.HomeTile(id: tile.id, size: t.homeSizes.contains(tile.size) ? tile.size : "M",
                                             hidden: tile.hidden))
        }
        for d in t.homeDefault.tiles where !seen.contains(d.id) { tiles.append(d) }
        var rules: [Appearance.HomeRule] = []
        var keys = Set<String>()
        for r in home.rules where t.homeRuleScopes.contains(r.scope) && ids.contains(r.tile) && t.homeRuleActs.contains(r.act) {
            let key = "\(r.scope):\(r.tile)"
            if keys.contains(key) { continue }
            keys.insert(key)
            rules.append(r)
        }
        return Appearance.Home(tiles: tiles, rules: rules)
    }

    /// scopeForDate(date): "Weekends" on Saturday and Sunday (local time),
    /// "Weekdays" otherwise.
    static func scopeForDate(_ date: Date = Date(), timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let day = calendar.component(.weekday, from: date) // 1 = Sunday … 7 = Saturday
        return day == 1 || day == 7 ? "Weekends" : "Weekdays"
    }

    /// effectiveTiles(home, date): the tiles Home shows that day, in order —
    /// the base order with that day's rules applied, hidden tiles removed.
    /// Position rules move a tile; they never change whether it shows.
    static func effectiveTiles(_ home: Appearance.Home, date: Date = Date()) -> [Appearance.HomeTile] {
        let h = normalizeHome(home)
        let scope = scopeForDate(date)
        var out = h.tiles
        for r in h.rules where r.scope == scope {
            guard let i = out.firstIndex(where: { $0.id == r.tile }) else { continue }
            var t = out.remove(at: i)
            switch r.act {
            case "hide":
                t.hidden = true
                out.insert(t, at: i)
            case "first":
                out.insert(t, at: 0)
            default:
                out.append(t)
            }
        }
        return out.filter { !$0.hidden }
    }

    /// moveTile(home, id, dir): swaps a tile with its neighbour (dir −1 / +1).
    static func moveTile(_ home: Appearance.Home, _ id: String, _ dir: Int) -> Appearance.Home {
        var h = normalizeHome(home)
        guard let i = h.tiles.firstIndex(where: { $0.id == id }) else { return h }
        let j = i + dir
        guard j >= 0, j < h.tiles.count else { return h }
        h.tiles.swapAt(i, j)
        return h
    }

    /// patchTile(home, id, patch): changes one tile's size and/or visibility.
    static func patchTile(_ home: Appearance.Home, _ id: String, size: String? = nil, hidden: Bool? = nil) -> Appearance.Home {
        var h = normalizeHome(home)
        for i in h.tiles.indices where h.tiles[i].id == id {
            if let size { h.tiles[i].size = size }
            if let hidden { h.tiles[i].hidden = hidden }
        }
        return h
    }

    /// ordinal(n): "1st", "2nd", "3rd", "4th", "11th"…
    static func ordinal(_ n: Int) -> String {
        let m100 = n % 100
        let suffix: String
        if m100 >= 11, m100 <= 13 {
            suffix = "th"
        } else {
            switch n % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: suffix = "th"
            }
        }
        return "\(n)\(suffix)"
    }

    /// isDefaultHome(home): never arranged (default tiles, no rules).
    static func isDefaultHome(_ home: Appearance.Home) -> Bool {
        let h = normalizeHome(home)
        return h.rules.isEmpty && h.tiles == tables.homeDefault.tiles
    }

    /// homeForSkin(home, skin): until the user arranges Home, Classic keeps
    /// its original screen and Signal the v2 default; once arranged, the
    /// user's layout applies to both skins.
    static func homeForSkin(_ home: Appearance.Home, _ skin: Appearance.Skin) -> Appearance.Home {
        let h = normalizeHome(home)
        if skin == .classic, isDefaultHome(h) { return normalizeHome(tables.classicHomeDefault) }
        return h
    }
}
