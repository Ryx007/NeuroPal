import Foundation

/// The shared look object — skin, Classic theme/accent, Signal settings, Pal,
/// Home layout. Exactly the shape `normalizeAppearance` returns in
/// packages/tokens/src/appearance.js; the server stores it (User.appearance,
/// GET/PUT /api/me/appearance) and every client syncs it.
public struct Appearance: Codable, Hashable, Sendable {
    public enum Skin: String, Codable, Sendable, CaseIterable { case classic, signal }

    public struct Classic: Codable, Hashable, Sendable {
        /// CLASSIC_THEME_NAMES: "dark" | "sepia" | "light" | "contrast"
        public var theme: String
        /// CLASSIC_ACCENT_NAMES: "ruby" | "cyan" | "purple" | "green"
        public var accent: String
        public init(theme: String = "dark", accent: String = "ruby") {
            self.theme = theme
            self.accent = accent
        }
    }

    public struct Signal: Codable, Hashable, Sendable {
        public var acc: String
        public var base: String
        public var motion: String
        public var field: String
        public var brutality: Int
        public var corners: String
        public var texture: String
        public var type: String
        public init(acc: String = "#FF3D2E", base: String = "Graphite", motion: String = "Lively", field: String = "Chladni",
                    brutality: Int = 2, corners: String = "Soft", texture: String = "Grain", type: String = "Wide") {
            self.acc = acc
            self.base = base
            self.motion = motion
            self.field = field
            self.brutality = brutality
            self.corners = corners
            self.texture = texture
            self.type = type
        }
    }

    public struct Pal: Codable, Hashable, Sendable {
        public var name: String
        public var shape: String
        public var colour: String
        public var eyes: String
        public var mouth: String
        public var extra: String
        /// How Pal talks: "Gentle" | "Direct" | "Nerdy" (PAL_OPTIONS.talk)
        public var talk: String
        /// "Soft" | "Bright" | "Low" (PAL_OPTIONS.voice — rate/pitch pairs)
        public var voice: String
        /// Whether Pal may mention the people in the user's life.
        public var people: Bool
        public init(name: String = "Pal", shape: String = "Pebble", colour: String = "Chalk", eyes: String = "Visor",
                    mouth: String = "Smile", extra: String = "Headphones", talk: String = "Gentle", voice: String = "Soft",
                    people: Bool = true) {
            self.name = name
            self.shape = shape
            self.colour = colour
            self.eyes = eyes
            self.mouth = mouth
            self.extra = extra
            self.talk = talk
            self.voice = voice
            self.people = people
        }
    }

    public struct HomeTile: Codable, Hashable, Sendable, Identifiable {
        /// "state" | "anchor" | "focus" | "mvd" | "reading" | "pal"
        public var id: String
        /// "S" | "M" | "L"
        public var size: String
        public var hidden: Bool
        public init(id: String, size: String, hidden: Bool = false) {
            self.id = id
            self.size = size
            self.hidden = hidden
        }
    }

    public struct HomeRule: Codable, Hashable, Sendable {
        /// "Weekdays" | "Weekends" (HOME_RULE_SCOPES)
        public var scope: String
        public var tile: String
        /// "first" | "last" | "hide" (HOME_RULE_ACTS)
        public var act: String
        public init(scope: String, tile: String, act: String) {
            self.scope = scope
            self.tile = tile
            self.act = act
        }
    }

    public struct Home: Codable, Hashable, Sendable {
        public var tiles: [HomeTile]
        public var rules: [HomeRule]
        public init(tiles: [HomeTile] = Home.defaultTiles, rules: [HomeRule] = []) {
            self.tiles = tiles
            self.rules = rules
        }
        public static let defaultTiles: [HomeTile] = [
            HomeTile(id: "state", size: "L"), HomeTile(id: "anchor", size: "M"), HomeTile(id: "focus", size: "M"),
            HomeTile(id: "mvd", size: "L"), HomeTile(id: "reading", size: "M"), HomeTile(id: "pal", size: "S"),
        ]
    }

    public var v: Int
    public var skin: Skin
    public var classic: Classic
    public var signal: Signal
    public var suggestLooks: Bool
    public var pal: Pal
    public var home: Home
    /// ISO-8601 time of the last change; the server keeps the newest copy.
    public var updatedAt: String?

    public init(v: Int = 1, skin: Skin = .classic, classic: Classic = Classic(), signal: Signal = Signal(),
                suggestLooks: Bool = true, pal: Pal = Pal(), home: Home = Home(), updatedAt: String? = nil) {
        self.v = v
        self.skin = skin
        self.classic = classic
        self.signal = signal
        self.suggestLooks = suggestLooks
        self.pal = pal
        self.home = home
        self.updatedAt = updatedAt
    }

    public static let `default` = Appearance()
}
