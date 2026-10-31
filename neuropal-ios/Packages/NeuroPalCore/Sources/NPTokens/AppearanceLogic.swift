import Foundation

// The appearance object — port of packages/tokens/src/appearance.js:
// normalise, resolve, the human-readable change list, saved looks.

public extension Tokens {
    /// One line of a proposed change ("Motion: Lively → Calm"). `k` is the
    /// setting's name, as in the JS rows.
    struct ChangeRow: Codable, Hashable, Sendable, Identifiable {
        public var k: String
        public var from: String
        public var to: String
        public var id: String { k }

        public init(k: String, from: String, to: String) {
            self.k = k
            self.from = from
            self.to = to
        }
    }

    /// normalizeAppearance: any JSON (or nil) → a complete, valid appearance,
    /// exactly as the JS (and the server, which runs the same JS) makes it.
    static func normalizeAppearance(_ json: JSONValue?) -> Appearance {
        let src = JS.object(json)
        return Appearance(
            v: tables.appearanceVersion,
            skin: src["skin"]?.stringValue == "signal" ? .signal : .classic,
            classic: normalizeClassic(src["classic"]),
            signal: normalizeSignal(src["signal"]),
            suggestLooks: src["suggestLooks"] != .bool(false),
            pal: normalizePal(src["pal"]),
            home: normalizeHome(src["home"]),
            updatedAt: src["updatedAt"]?.stringValue)
    }

    /// normalizeAppearance for a typed value (repairs anything invalid).
    static func normalizeAppearance(_ appearance: Appearance) -> Appearance {
        Appearance(
            v: tables.appearanceVersion, skin: appearance.skin, classic: normalizeClassic(appearance.classic),
            signal: normalizeSignal(appearance.signal), suggestLooks: appearance.suggestLooks,
            pal: normalizePal(appearance.pal), home: normalizeHome(appearance.home), updatedAt: appearance.updatedAt)
    }

    /// diffAppearance(before, after): the change list for preview → apply → undo.
    static func diffAppearance(_ before: Appearance, _ after: Appearance) -> [ChangeRow] {
        let a = normalizeAppearance(before)
        let b = normalizeAppearance(after)
        var rows: [ChangeRow] = []
        func add(_ k: String, _ x: String, _ y: String) {
            if x != y { rows.append(ChangeRow(k: k, from: x, to: y)) }
        }
        add("Skin", JS.cap(a.skin.rawValue), JS.cap(b.skin.rawValue))
        if b.skin == .classic {
            add("Theme", JS.cap(a.classic.theme), JS.cap(b.classic.theme))
            if b.classic.theme != "contrast" { add("Accent", JS.cap(a.classic.accent), JS.cap(b.classic.accent)) }
        } else {
            let x = a.signal
            let y = b.signal
            add("Accent", accentName(x.acc), accentName(y.acc))
            add("Base", x.base, y.base)
            add("Motion", x.motion, y.motion)
            add("Background", x.field, y.field)
            add("Brutality", String(x.brutality), String(y.brutality))
            add("Corners", x.corners, y.corners)
            add("Texture", x.texture, y.texture)
            add("Type", x.type, y.type)
        }
        return rows
    }

    /// matchLook(appearance): the saved look (LOOKS) this appearance is, if any.
    static func matchLook(_ appearance: Appearance) -> String? {
        let a = normalizeAppearance(appearance)
        if a.skin == .signal {
            return tables.signalLooks.first { sameSignal($0.signal, a.signal) }?.name
        }
        return tables.classicLooks.first { $0.theme == a.classic.theme && $0.accent == a.classic.accent }?.name
    }

    /// applyLook(appearance, name): the appearance with that saved look on
    /// (for the current skin); unknown names change nothing.
    static func applyLook(_ appearance: Appearance, _ name: String) -> Appearance {
        var a = normalizeAppearance(appearance)
        if a.skin == .signal {
            guard let look = tables.signalLooks.first(where: { $0.name == name }) else { return a }
            a.signal = normalizeSignal(look.signal)
        } else {
            guard let look = tables.classicLooks.first(where: { $0.name == name }) else { return a }
            a.classic = normalizeClassic(Appearance.Classic(theme: look.theme, accent: look.accent))
        }
        return a
    }

    /// lookDescription(skin, name): the look's one-line description, or "".
    static func lookDescription(_ skin: Appearance.Skin, _ name: String) -> String {
        skin == .signal
            ? tables.signalLooks.first { $0.name == name }?.desc ?? ""
            : tables.classicLooks.first { $0.name == name }?.desc ?? ""
    }

    /// The saved looks of a skin, in LOOKS order.
    static func lookNames(_ skin: Appearance.Skin) -> [String] {
        skin == .signal ? tables.signalLooks.map(\.name) : tables.classicLooks.map(\.name)
    }
}
