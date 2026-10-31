import Foundation

// Classic — port of packages/tokens/src/classic.js. The original NeuroPal
// look (4 themes × 4 accents), kept exactly as designed.

public extension Tokens {
    /// normalizeClassic(input): unknown theme → "dark", unknown accent → "ruby".
    static func normalizeClassic(_ json: JSONValue?) -> Appearance.Classic {
        let src = JS.object(json)
        let t = tables
        let theme = src["theme"]?.stringValue.flatMap { t.classicThemeNames.contains($0) ? $0 : nil } ?? "dark"
        let accent = src["accent"]?.stringValue.flatMap { t.classicAccentNames.contains($0) ? $0 : nil } ?? "ruby"
        return Appearance.Classic(theme: theme, accent: accent)
    }

    static func normalizeClassic(_ classic: Appearance.Classic) -> Appearance.Classic {
        let t = tables
        return Appearance.Classic(theme: t.classicThemeNames.contains(classic.theme) ? classic.theme : "dark",
                                  accent: t.classicAccentNames.contains(classic.accent) ? classic.accent : "ruby")
    }

    /// resolveClassicTokens(theme, accent): the Material-style token map of
    /// the original palette.js (contrast ignores accents; dark IS ruby).
    static func resolveClassicTokens(theme: String, accent: String) -> [String: String] {
        let t = tables
        let base = t.classicThemes[theme] ?? t.classicThemes["dark"] ?? [:]
        if theme == "contrast" { return base }
        let variants = t.classicAccentVariants[theme] ?? [:]
        let chosen = variants[accent] ?? (accent == "ruby" ? nil : variants["ruby"])
        return base.merging(chosen ?? variants["ruby"] ?? [:]) { _, new in new }
    }

    /// resolveClassicPalette({theme, accent}): Classic tokens + the skin
    /// extras skin-aware views read (shape, motion, field…).
    static func resolveClassicPalette(theme: String, accent: String) -> Palette {
        let c = normalizeClassic(Appearance.Classic(theme: theme, accent: accent))
        let tk = resolveClassicTokens(theme: c.theme, accent: c.accent)
        let shape = tables.classicShape
        func v(_ k: String) -> String { tk[k] ?? "#FF00FF" }
        let dark = c.theme == "dark" || c.theme == "contrast"
        let surf = hexToRgb(v("surfaceContainer")) ?? .black
        let accText = fitContrast(hexToRgb(v("accent")) ?? .white, surf)
        let ratio = min(contrastRatio(hexToRgb(v("onPrimary")) ?? .black, hexToRgb(v("primary")) ?? .white),
                        contrastRatio(accText, surf))
        return Palette(
            surface: v("surface"), surfaceLowest: v("surfaceLowest"), surfaceLow: v("surfaceLow"),
            surfaceContainer: v("surfaceContainer"), surfaceHigh: v("surfaceHigh"), surfaceHighest: v("surfaceHighest"),
            onSurface: v("onSurface"), onSurfaceVariant: v("onSurfaceVariant"), outline: v("outline"),
            outlineVariant: v("outlineVariant"), primary: v("primary"), primaryContainer: v("primaryContainer"),
            onPrimary: v("onPrimary"), secondary: v("secondary"), tertiary: v("tertiary"), error: v("error"),
            warn: v("warn"), accent: v("accent"), accentGlow: v("accentGlow"), skin: "classic", dark: dark,
            accentFill: v("primary"), accentInk: v("onPrimary"), accentDeep: v("primaryContainer"),
            accentText: rgbToHex(accText), line: v("outlineVariant"), control: v("outline"), shadowColor: "#000000",
            panelColor: v("surfaceContainer"), panelAlpha: shape["glassAlpha"] ?? 0.82, grid: "#000000", gridAlpha: 0,
            palBody: dark ? "#E4E2E1" : "#FFFFFF",
            shape: Palette.Shape(radius: shape["radius"] ?? 24, radiusMedium: shape["radiusMedium"] ?? 18,
                                 radiusControl: shape["radiusControl"] ?? 999, border: shape["border"] ?? 1,
                                 shadow: shape["shadow"] ?? 0),
            motion: Palette.Motion(level: "Calm", speed: 0.35), field: "None", texture: "None", type: "Classic",
            ratio: JS.round(ratio * 10) / 10)
    }

    /// resolveClassicPalette for any JSON input (normalised like the JS).
    static func resolveClassicPalette(json: JSONValue?) -> Palette {
        let c = normalizeClassic(json)
        return resolveClassicPalette(theme: c.theme, accent: c.accent)
    }
}
