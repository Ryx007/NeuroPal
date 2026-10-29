import NPTokens
import SwiftUI

/// The resolved look a view draws with: the palette as SwiftUI colours, the
/// skin's fonts and shape. Read it with `@Environment(\.npTheme)`.
public struct NPTheme: Equatable, Sendable {
    public var palette: Palette
    public var appearance: Appearance
    /// Motion after the OS Reduce Motion setting ("Still" = no animation).
    public var motionLevel: String

    public init(palette: Palette, appearance: Appearance, reduceMotion: Bool = false) {
        self.palette = palette
        self.appearance = appearance
        self.motionLevel = Tokens.effectiveMotion(palette.motion.level, reduceMotion: reduceMotion)
    }

    public static let classic = NPTheme(palette: .classicDefault, appearance: .default)
    public static let signal = NPTheme(
        palette: .signalDefault, appearance: Appearance(skin: .signal))

    public var isSignal: Bool { palette.skin == "signal" }
    public var animates: Bool { motionLevel != "Still" }
    public var colorScheme: ColorScheme { palette.dark ? .dark : .light }

    // Colours
    public var surface: Color { Color(token: palette.surface) }
    public var surfaceLow: Color { Color(token: palette.surfaceLow) }
    public var surfaceContainer: Color { Color(token: palette.surfaceContainer) }
    public var surfaceHigh: Color { Color(token: palette.surfaceHigh) }
    public var surfaceHighest: Color { Color(token: palette.surfaceHighest) }
    public var onSurface: Color { Color(token: palette.onSurface) }
    public var onSurfaceVariant: Color { Color(token: palette.onSurfaceVariant) }
    public var outline: Color { Color(token: palette.outline) }
    public var outlineVariant: Color { Color(token: palette.outlineVariant) }
    public var primary: Color { Color(token: palette.primary) }
    public var onPrimary: Color { Color(token: palette.onPrimary) }
    public var secondary: Color { Color(token: palette.secondary) }
    public var tertiary: Color { Color(token: palette.tertiary) }
    public var error: Color { Color(token: palette.error) }
    public var warn: Color { Color(token: palette.warn) }
    public var accent: Color { Color(token: palette.accent) }
    public var accentFill: Color { Color(token: palette.accentFill) }
    public var accentInk: Color { Color(token: palette.accentInk) }
    /// Accent for TEXT on the surface — always ≥ 4.5:1 in Signal.
    public var accentText: Color { Color(token: palette.accentText) }
    public var line: Color { Color(token: palette.line) }
    public var control: Color { Color(token: palette.control) }
    public var panel: Color { Color(token: palette.panelColor).opacity(palette.panelAlpha) }

    // Shape
    public var radius: CGFloat { palette.shape.radius }
    public var radiusMedium: CGFloat { palette.shape.radiusMedium }
    public var radiusControl: CGFloat { palette.shape.radiusControl }
    public var border: CGFloat { palette.shape.border }
    public var shadow: CGFloat { palette.shape.shadow }

    /// The colour of a check-in state, for dots and the slider.
    public func stateColor(_ state: String) -> Color {
        switch state {
        case "green": return secondary
        case "yellow": return warn
        case "red": return error
        default: return outline
        }
    }
}

public extension EnvironmentValues {
    @Entry var npTheme: NPTheme = .classic
}

public extension View {
    /// Applies a theme to a subtree: environment, colour scheme, tint.
    func npTheme(_ theme: NPTheme) -> some View {
        environment(\.npTheme, theme)
            .preferredColorScheme(theme.colorScheme)
            .tint(theme.accentText)
    }
}
