import Foundation

// Signal ("brutal glass") — port of packages/tokens/src/signal.js. Red on
// graphite by default; every value is a user setting, and every text colour
// is contrast-fitted so any accent hue stays readable.

public extension Tokens {
    /// normalizeSignal(input): anything (old saves, server payloads, typing)
    /// → valid settings. Unknown values fall back to the default.
    static func normalizeSignal(_ json: JSONValue?) -> Appearance.Signal {
        let src = JS.object(json)
        let t = tables
        var out = t.signalDefault
        if let acc = src["acc"]?.stringValue, isHex(acc), let rgb = hexToRgb(acc) { out.acc = rgbToHex(rgb) }
        func pick(_ key: String) -> String? {
            guard let v = src[key]?.stringValue, t.options(key).contains(v) else { return nil }
            return v
        }
        if let v = pick("base") { out.base = v }
        if let v = pick("motion") { out.motion = v }
        if let v = pick("field") { out.field = v }
        if let v = pick("corners") { out.corners = v }
        if let v = pick("texture") { out.texture = v }
        if let v = pick("type") { out.type = v }
        let b = JS.round(JS.number(src["brutality"]))
        if b.isFinite, b >= 0, b <= 3 { out.brutality = Int(b) }
        return out
    }

    static func normalizeSignal(_ signal: Appearance.Signal) -> Appearance.Signal {
        let t = tables
        var out = t.signalDefault
        if isHex(signal.acc), let rgb = hexToRgb(signal.acc) { out.acc = rgbToHex(rgb) }
        if t.options("base").contains(signal.base) { out.base = signal.base }
        if t.options("motion").contains(signal.motion) { out.motion = signal.motion }
        if t.options("field").contains(signal.field) { out.field = signal.field }
        if t.options("corners").contains(signal.corners) { out.corners = signal.corners }
        if t.options("texture").contains(signal.texture) { out.texture = signal.texture }
        if t.options("type").contains(signal.type) { out.type = signal.type }
        if (0...3).contains(signal.brutality) { out.brutality = signal.brutality }
        return out
    }

    /// sameSignal(a, b): the same look (accent compared case-insensitively).
    static func sameSignal(_ a: Appearance.Signal, _ b: Appearance.Signal) -> Bool {
        let x = normalizeSignal(a)
        let y = normalizeSignal(b)
        return x.acc.uppercased() == y.acc.uppercased() && x.base.uppercased() == y.base.uppercased()
            && x.motion.uppercased() == y.motion.uppercased() && x.field.uppercased() == y.field.uppercased()
            && x.brutality == y.brutality && x.corners.uppercased() == y.corners.uppercased()
            && x.texture.uppercased() == y.texture.uppercased() && x.type.uppercased() == y.type.uppercased()
    }

    /// accentName(hex): "Signal red", "Ember"… or the hex itself.
    static func accentName(_ hex: String) -> String {
        let h = hex.uppercased()
        if let extra = tables.signalExtraAccentNames[h] { return extra }
        return tables.signalAccents.first { $0.value == h }?.name ?? h
    }

    /// matchPreset(sig): the first SIGNAL_PRESETS name these settings match.
    static func matchPreset(_ signal: Appearance.Signal) -> String? {
        tables.signalPresets.first { sameSignal($0.signal, signal) }?.name
    }

    /// resolveSignalPalette(signal): the same Material-style token names
    /// Classic produces, plus the skin extras. Normalises its input.
    static func resolveSignalPalette(_ signal: Appearance.Signal) -> Palette {
        signalPalette(normalizeSignal(signal))
    }

    /// resolveSignalPalette for any JSON input (normalised like the JS).
    static func resolveSignalPalette(json: JSONValue?) -> Palette {
        signalPalette(normalizeSignal(json))
    }

    private static func signalPalette(_ s: Appearance.Signal) -> Palette {
        let t = tables
        guard let base = t.signalBase(s.base) ?? t.signalBase("Graphite") else { return .signalDefault }
        func v(_ k: String) -> String { base.color(k) }
        let acc = hexToRgb(s.acc) ?? RGB(255, 61, 46)
        let container = hexToRgb(v("surfaceContainer")) ?? .black
        let surface = hexToRgb(v("surface")) ?? .black
        // Accent used AS TEXT must read on both the page and the panels.
        let accText = fitContrast(fitContrast(acc, container), surface)
        let ink = inkFor(acc)
        let deep = mix(acc, .black, 0.5)
        let r = t.signalCorners[s.corners] ?? 14
        let ratio = min(contrastRatio(ink, acc), contrastRatio(accText, container), contrastRatio(accText, surface))
        let border = t.signalBrutalityBorder.indices.contains(s.brutality) ? t.signalBrutalityBorder[s.brutality] : 2
        let shadow = t.signalBrutalityShadow.indices.contains(s.brutality) ? t.signalBrutalityShadow[s.brutality] : 5
        return Palette(
            surface: v("surface"), surfaceLowest: v("surfaceLowest"), surfaceLow: v("surfaceLow"),
            surfaceContainer: v("surfaceContainer"), surfaceHigh: v("surfaceHigh"), surfaceHighest: v("surfaceHighest"),
            onSurface: v("onSurface"), onSurfaceVariant: v("onSurfaceVariant"), outline: v("outline"),
            outlineVariant: v("outlineVariant"), primary: s.acc, primaryContainer: rgbToHex(deep), onPrimary: rgbToHex(ink),
            secondary: v("secondary"), tertiary: v("tertiary"), error: v("error"), warn: v("warn"),
            accent: rgbToHex(accText), accentGlow: withAlpha(s.acc, 0.3), skin: "signal", dark: base.dark,
            accentFill: s.acc, accentInk: rgbToHex(ink), accentDeep: rgbToHex(deep), accentText: rgbToHex(accText),
            line: v("line"), control: v("control"), shadowColor: v("shadow"), panelColor: v("surfaceContainer"),
            panelAlpha: base.panelAlpha, grid: v("grid"), gridAlpha: base.gridAlpha, palBody: v("palBody"),
            shape: Palette.Shape(radius: r, radiusMedium: JS.round(r * 0.72), radiusControl: JS.round(r * 0.72),
                                 border: border, shadow: shadow),
            motion: Palette.Motion(level: s.motion, speed: t.signalMotionSpeed[s.motion] ?? 1),
            field: s.field, texture: s.texture, type: s.type, ratio: JS.round(ratio * 10) / 10)
    }
}
