import NPCore
import NPTheme
import SwiftUI
import UIKit

/// The reading page's look. Page and text colours are Settings' reader
/// backgrounds (`theme.readerColors`, so the reader matches the Settings
/// preview); the accents drawn on the page — the spoken word, its
/// underline, maths, a citation's glow — come from the token palette made
/// for that kind of page, so they stay legible on it:
///   theme → the skin · paper → Classic light · sepia → Classic sepia
///   dusk → Signal Warm · night → Signal Black
/// The rest of the screen keeps the app's theme.
struct ReaderPage: Equatable {
    var page: Color
    var text: Color
    var dark: Bool
    /// Accents for this page.
    var palette: Palette

    init(background: AppPreferences.ReaderBackground, theme: NPTheme) {
        let colors = theme.readerColors(background)
        page = colors.page
        text = colors.text
        dark = theme.readerIsDark(background)
        let accent = theme.appearance.classic.accent
        var signal = theme.appearance.signal
        switch background.rawValue {
        case "paper":
            palette = Tokens.resolveClassicPalette(theme: "light", accent: accent)
        case "sepia":
            palette = Tokens.resolveClassicPalette(theme: "sepia", accent: accent)
        case "dusk":
            signal.base = "Warm"
            palette = Tokens.resolveSignalPalette(signal)
        case "night":
            signal.base = "Black"
            palette = Tokens.resolveSignalPalette(signal)
        default:
            palette = theme.palette
        }
    }

    var background: Color { page }
    var colorScheme: ColorScheme { dark ? .dark : .light }

    var uiBackground: UIColor { UIColor(page) }
    var uiText: UIColor { UIColor(text) }
    /// The spoken word's fill.
    var uiHighlight: UIColor { UIColor(Color(token: palette.accentFill).opacity(dark ? 0.34 : 0.26)) }
    /// The spoken word's underline (the non-colour cue).
    var uiUnderline: UIColor { UIColor(Color(token: palette.accentText)) }
    /// A citation target's brief glow.
    var uiFlash: UIColor { UIColor(Color(token: palette.tertiary).opacity(0.22)) }
    var uiMath: UIColor { UIColor(Color(token: palette.tertiary)) }

    /// Hex strings for the EPUB stylesheet.
    var css: (surface: String, text: String, accent: String, accentText: String, tertiary: String) {
        (Self.hex(page), Self.hex(text), palette.accentFill, palette.accentText, palette.tertiary)
    }

    static func hex(_ color: Color) -> String {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ v: CGFloat) -> Int { Int((min(1, max(0, v)) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", byte(r), byte(g), byte(b))
    }
}
