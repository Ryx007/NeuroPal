import NPTokens
import SwiftUI

/// The resolved look a view draws with: the palette as SwiftUI colours, the
/// skin's fonts and shape. Read it with `@Environment(\.npTheme)`.
public struct NPTheme: Equatable, Sendable {
    public var palette: Palette
    public var appearance: Appearance
    /// Motion after the OS Reduce Motion setting ("Still" = no animation).
    public var motionLevel: String
    /// The OS Reduce Motion setting this theme was resolved with.
    public var reduceMotion: Bool

    public init(palette: Palette, appearance: Appearance, reduceMotion: Bool = false) {
        self.palette = palette
        self.appearance = appearance
        self.reduceMotion = reduceMotion
        self.motionLevel = Tokens.effectiveMotion(palette.motion.level, reduceMotion: reduceMotion)
    }

    /// The theme of any appearance — e.g. a proposed look in a preview.
    public init(appearance: Appearance, reduceMotion: Bool = false) {
        self.init(palette: Tokens.palette(for: appearance), appearance: appearance, reduceMotion: reduceMotion)
    }

    public static let classic = NPTheme(palette: .classicDefault, appearance: .default)
    public static let signal = NPTheme(
        palette: .signalDefault, appearance: Appearance(skin: .signal))

    public var isSignal: Bool { palette.skin == "signal" }
    public var animates: Bool { motionLevel != "Still" }
    public var colorScheme: ColorScheme { palette.dark ? .dark : .light }
    public var isLight: Bool { !palette.dark }
    /// Field/animation speed multiplier after Reduce Motion (0 = still).
    public var motionSpeed: Double { animates ? palette.motion.speed : 0 }

    // Colours
    public var surface: Color { Color(token: palette.surface) }
    public var surfaceLowest: Color { Color(token: palette.surfaceLowest) }
    public var surfaceLow: Color { Color(token: palette.surfaceLow) }
    public var surfaceContainer: Color { Color(token: palette.surfaceContainer) }
    public var surfaceHigh: Color { Color(token: palette.surfaceHigh) }
    public var surfaceHighest: Color { Color(token: palette.surfaceHighest) }
    public var onSurface: Color { Color(token: palette.onSurface) }
    public var onSurfaceVariant: Color { Color(token: palette.onSurfaceVariant) }
    public var outline: Color { Color(token: palette.outline) }
    public var outlineVariant: Color { Color(token: palette.outlineVariant) }
    public var primary: Color { Color(token: palette.primary) }
    public var primaryContainer: Color { Color(token: palette.primaryContainer) }
    public var onPrimary: Color { Color(token: palette.onPrimary) }
    public var secondary: Color { Color(token: palette.secondary) }
    public var tertiary: Color { Color(token: palette.tertiary) }
    public var error: Color { Color(token: palette.error) }
    public var warn: Color { Color(token: palette.warn) }
    public var accent: Color { Color(token: palette.accent) }
    public var accentFill: Color { Color(token: palette.accentFill) }
    public var accentInk: Color { Color(token: palette.accentInk) }
    public var accentDeep: Color { Color(token: palette.accentDeep) }
    /// Accent for TEXT on the surface — always ≥ 4.5:1 (contrast-fitted).
    public var accentText: Color { Color(token: palette.accentText) }
    public var line: Color { Color(token: palette.line) }
    public var control: Color { Color(token: palette.control) }
    /// Signal's hard-shadow colour (black, or ink on light bases).
    public var shadowColor: Color { Color(token: palette.shadowColor) }
    public var panel: Color { Color(token: palette.panelColor).opacity(palette.panelAlpha) }
    /// Signal's engineering-grid line colour, with its alpha.
    public var grid: Color { Color(token: palette.grid).opacity(palette.gridAlpha) }

    /// Fill of a selected chip / segment: Signal fills with the accent,
    /// Classic tints it.
    public var selectionFill: Color { isSignal ? accentFill : accentText.opacity(0.16) }
    /// Text on `selectionFill`, contrast-checked.
    public var selectionInk: Color {
        guard !isSignal else { return accentInk }
        return Color(token: Self.pickedInk(palette))
    }

    // Shape
    public var radius: CGFloat { palette.shape.radius }
    public var radiusMedium: CGFloat { palette.shape.radiusMedium }
    public var radiusControl: CGFloat { palette.shape.radiusControl }
    public var border: CGFloat { palette.shape.border }
    public var shadow: CGFloat { palette.shape.shadow }

    /// A Classic-era radius in this skin (Expo `skinRadius`): Classic keeps
    /// it; Signal scales it into the corner setting (Sharp / Soft / Round).
    public func skinRadius(_ classicRadius: CGFloat) -> CGFloat {
        guard isSignal else { return classicRadius }
        guard classicRadius > 0 else { return 0 }
        return (palette.shape.radius * min(1, classicRadius / 24)).rounded()
    }

    /// The colour of a check-in state, for dots and the slider.
    public func stateColor(_ state: String) -> Color {
        switch state {
        case "green": return secondary
        case "yellow": return warn
        case "red": return error
        default: return outline
        }
    }

    /// The Classic picked-chip label: the accent, nudged until it reads at
    /// AA on its own 16 % tint (Expo SettingsScreen `pickedInk`).
    static func pickedInk(_ p: Palette) -> String {
        guard let accent = Tokens.hexToRgb(p.accentText), let group = Tokens.hexToRgb(p.surfaceContainer) else {
            return p.accentText
        }
        return Tokens.rgbToHex(Tokens.fitContrast(accent, Tokens.mix(group, accent, 0.16)))
    }
}

public extension EnvironmentValues {
    @Entry var npTheme: NPTheme = .classic
}

public extension View {
    /// Applies a theme to a subtree: environment, colour scheme, tint. Use
    /// at a window or sheet root (it sets the PRESENTATION's colour scheme).
    func npTheme(_ theme: NPTheme) -> some View {
        environment(\.npTheme, theme)
            .preferredColorScheme(theme.colorScheme)
            .tint(theme.accentText)
    }

    /// Draws a subtree in another look without touching the window — the
    /// studio's preview card, a preset tile (Expo `ThemeOverride`).
    func npThemeOverride(_ theme: NPTheme) -> some View {
        environment(\.npTheme, theme)
            .environment(\.colorScheme, theme.colorScheme)
            .tint(theme.accentText)
    }
}
