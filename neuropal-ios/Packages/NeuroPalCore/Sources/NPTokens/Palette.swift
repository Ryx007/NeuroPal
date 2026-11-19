import Foundation

/// A resolved palette: every colour and shape value a screen draws with.
/// Field for field the object `resolveClassicPalette` / `resolveSignalPalette`
/// return in packages/tokens (the fixtures in cases.json pin every value).
/// Colours are "#RRGGBB" strings; `accentGlow` is a CSS "rgba(r,g,b,a)".
public struct Palette: Codable, Hashable, Sendable {
    public struct Shape: Codable, Hashable, Sendable {
        public var radius: Double
        public var radiusMedium: Double
        public var radiusControl: Double
        public var border: Double
        public var shadow: Double

        public init(radius: Double, radiusMedium: Double, radiusControl: Double, border: Double, shadow: Double) {
            self.radius = radius
            self.radiusMedium = radiusMedium
            self.radiusControl = radiusControl
            self.border = border
            self.shadow = shadow
        }
    }

    public struct Motion: Codable, Hashable, Sendable {
        /// "Still" | "Calm" | "Lively" | "Wild" ("Still" = no motion at all;
        /// the OS Reduce Motion setting must also stop it — effectiveMotion).
        public var level: String
        /// Multiplier for animation speed; 0 when still.
        public var speed: Double

        public init(level: String, speed: Double) {
            self.level = level
            self.speed = speed
        }
    }

    public var surface: String
    public var surfaceLowest: String
    public var surfaceLow: String
    public var surfaceContainer: String
    public var surfaceHigh: String
    public var surfaceHighest: String
    public var onSurface: String
    public var onSurfaceVariant: String
    public var outline: String
    public var outlineVariant: String
    public var primary: String
    public var primaryContainer: String
    public var onPrimary: String
    public var secondary: String
    public var tertiary: String
    public var error: String
    public var warn: String
    public var accent: String
    public var accentGlow: String
    /// "classic" | "signal"
    public var skin: String
    public var dark: Bool
    public var accentFill: String
    public var accentInk: String
    public var accentDeep: String
    public var accentText: String
    public var line: String
    public var control: String
    public var shadowColor: String
    public var panelColor: String
    public var panelAlpha: Double
    public var grid: String
    public var gridAlpha: Double
    public var palBody: String
    public var shape: Shape
    public var motion: Motion
    /// Signal background field: "Chladni" | "Interference" | "Grid" | "None" ("None" in Classic).
    public var field: String
    /// "Grain" | "Scanlines" | "None"
    public var texture: String
    /// The type set: "Classic" in Classic; Signal's "Wide" | "Condensed" | "Grotesk".
    public var type: String
    /// Contrast ratio of accentText on surface (rounded to 0.1), for display.
    public var ratio: Double
}

public extension Palette {
    /// Classic dark + ruby — the app's first-run look (normalizeAppearance({})).
    static let classicDefault = Palette(
        surface: "#131313", surfaceLowest: "#0E0E0E", surfaceLow: "#1B1C1C", surfaceContainer: "#1F2020",
        surfaceHigh: "#2A2A2A", surfaceHighest: "#353535", onSurface: "#E4E2E1", onSurfaceVariant: "#D0C6C8",
        outline: "#9F8D91", outlineVariant: "#534347", primary: "#FF7F8E", primaryContainer: "#8E1030",
        onPrimary: "#4A0316", secondary: "#FFAFC1", tertiary: "#F3C77B", error: "#FFB4AB", warn: "#FFD27A",
        accent: "#FF7F8E", accentGlow: "rgba(255,127,142,0.25)", skin: "classic", dark: true,
        accentFill: "#FF7F8E", accentInk: "#4A0316", accentDeep: "#8E1030", accentText: "#FF7F8E",
        line: "#534347", control: "#9F8D91", shadowColor: "#000000", panelColor: "#1F2020", panelAlpha: 0.82,
        grid: "#000000", gridAlpha: 0, palBody: "#E4E2E1",
        shape: Shape(radius: 24, radiusMedium: 18, radiusControl: 999, border: 1, shadow: 0),
        motion: Motion(level: "Calm", speed: 0.35), field: "None", texture: "None", type: "Classic", ratio: 6.6
    )

    /// Signal's default (Graphite base, #FF3D2E accent).
    static let signalDefault = Palette(
        surface: "#141416", surfaceLowest: "#0C0C0E", surfaceLow: "#19191C", surfaceContainer: "#1E1E22",
        surfaceHigh: "#2A2A30", surfaceHighest: "#36363D", onSurface: "#F2F2F0", onSurfaceVariant: "#C4C4CB",
        outline: "#ADADB6", outlineVariant: "#55555E", primary: "#FF3D2E", primaryContainer: "#801F17",
        onPrimary: "#141416", secondary: "#8FD9B6", tertiary: "#E9D98B", error: "#FFB547", warn: "#FFC54D",
        accent: "#FF3D2E", accentGlow: "rgba(255,61,46,0.3)", skin: "signal", dark: true,
        accentFill: "#FF3D2E", accentInk: "#141416", accentDeep: "#801F17", accentText: "#FF3D2E",
        line: "#55555E", control: "#C4C4CB", shadowColor: "#000000", panelColor: "#1E1E22", panelAlpha: 0.66,
        grid: "#FFFFFF", gridAlpha: 0.05, palBody: "#E4E4E8",
        shape: Shape(radius: 14, radiusMedium: 10, radiusControl: 10, border: 2, shadow: 5),
        motion: Motion(level: "Lively", speed: 1), field: "Chladni", texture: "Grain", type: "Wide", ratio: 4.7
    )
}
