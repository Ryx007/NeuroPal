import Foundation

// Colour maths shared by every NeuroPal client — a 1:1 port of
// packages/tokens/src/color.js. Pure functions; the fixtures prove it.

public extension Tokens {
    /// A colour as three 0–255 channels (the JS code's `[r, g, b]`).
    struct RGB: Hashable, Sendable {
        public var r: Int
        public var g: Int
        public var b: Int

        public init(_ r: Int, _ g: Int, _ b: Int) {
            self.r = r
            self.g = g
            self.b = b
        }

        public static let white = RGB(255, 255, 255)
        public static let black = RGB(0, 0, 0)
        /// The near-black ink the design uses instead of pure black.
        public static let ink = RGB(20, 20, 22)
    }

    /// `#RGB` or `#RRGGBB`, any case, nothing else.
    static func isHex(_ value: String) -> Bool {
        let u = Array(value.utf16)
        guard u.count == 4 || u.count == 7, u[0] == 0x23 else { return false }
        return u.dropFirst().allSatisfy(isHexDigit)
    }

    /// "#RRGGBB" / "#RGB" (the "#" optional) → channels; nil where the JS
    /// returns null. Mirrors JS quirks: only the first "#" is dropped, and
    /// `parseInt` reads leading hex digits ("12zzzz" → 0x12).
    static func hexToRgb(_ hex: String?) -> RGB? {
        var u = Array((hex ?? "").utf16)
        if let i = u.firstIndex(of: 0x23) { u.remove(at: i) }
        if u.count == 3 { u = u.flatMap { [$0, $0] } }
        guard u.count >= 6, let n = parseIntHex(Array(u.prefix(6))) else { return nil }
        return RGB((n >> 16) & 255, (n >> 8) & 255, n & 255)
    }

    /// "#RRGGBB", upper-case; channels clamped to 0…255.
    static func rgbToHex(_ c: RGB) -> String {
        func channel(_ v: Int) -> String {
            let s = String(max(0, min(255, v)), radix: 16, uppercase: true)
            return s.count < 2 ? "0" + s : s
        }
        return "#" + channel(c.r) + channel(c.g) + channel(c.b)
    }

    /// WCAG 2.x relative luminance (0 = black, 1 = white).
    static func luminance(_ c: RGB) -> Double {
        func f(_ v: Int) -> Double {
            let x = Double(v) / 255
            return x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
    }

    /// WCAG contrast ratio (1…21).
    static func contrastRatio(_ a: RGB, _ b: RGB) -> Double {
        let x = luminance(a)
        let y = luminance(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    /// Linear blend from `a` (t = 0) to `b` (t = 1), rounded per channel.
    static func mix(_ a: RGB, _ b: RGB, _ t: Double) -> RGB {
        func m(_ x: Int, _ y: Int) -> Int { JS.roundInt(Double(x) + Double(y - x) * t) }
        return RGB(m(a.r, b.r), m(a.g, b.g), m(a.b, b.b))
    }

    /// Nudges `fg` toward white (dark backgrounds) or black (light ones) in
    /// 10% steps until it reads at `min`:1 on `bg` — the auto-contrast that
    /// lets the user pick ANY accent hue and still get AA text.
    static func fitContrast(_ fg: RGB, _ bg: RGB, min: Double = 4.6) -> RGB {
        var c = fg
        let target: RGB = contrastRatio(.white, bg) >= contrastRatio(.black, bg) ? .white : .black
        var i = 0
        while i < 24, contrastRatio(c, bg) < min {
            c = mix(c, target, 0.1)
            i += 1
        }
        return c
    }

    /// Text colour for a filled accent surface: near-black ink or white,
    /// whichever reads better; pure black/white when neither clears 4.6:1.
    static func inkFor(_ fill: RGB, ink: RGB = .ink) -> RGB {
        var best: RGB = contrastRatio(ink, fill) >= contrastRatio(.white, fill) ? ink : .white
        if contrastRatio(best, fill) < 4.6 {
            best = contrastRatio(.black, fill) >= contrastRatio(.white, fill) ? .black : .white
        }
        return best
    }

    /// HSL (h in degrees, s and l in 0…1) → "#RRGGBB".
    static func hslToHex(_ h: Double, _ s: Double, _ l: Double) -> String {
        func f(_ n: Double) -> Int {
            let k = (n + h / 30).truncatingRemainder(dividingBy: 12) // JS `%`
            let q = s * Swift.min(l, 1 - l)
            return JS.roundInt(255 * (l - q * Swift.max(-1, Swift.min(k - 3, 9 - k, 1))))
        }
        return rgbToHex(RGB(f(0), f(8), f(4)))
    }

    /// Hue (0–359°) of a hex colour; 0 for greys and unreadable input.
    static func hueOf(_ hex: String?) -> Int {
        guard let c = hexToRgb(hex) else { return 0 }
        let r = Double(c.r) / 255
        let g = Double(c.g) / 255
        let b = Double(c.b) / 255
        let mx = Swift.max(r, g, b)
        let mn = Swift.min(r, g, b)
        let d = mx - mn
        if d == 0 { return 0 }
        var h: Double
        if mx == r {
            h = ((g - b) / d).truncatingRemainder(dividingBy: 6)
        } else if mx == g {
            h = (b - r) / d + 2
        } else {
            h = (r - g) / d + 4
        }
        h = JS.round(h * 60)
        return Int(h < 0 ? h + 360 : h)
    }

    /// "rgba(r,g,b,alpha)" (alpha printed like JS), or `hex` unchanged.
    static func withAlpha(_ hex: String, _ alpha: Double) -> String {
        guard let c = hexToRgb(hex) else { return hex }
        return "rgba(\(c.r),\(c.g),\(c.b),\(JS.numberToString(alpha)))"
    }

    // MARK: -

    private static func isHexDigit(_ u: UInt16) -> Bool {
        (u >= 0x30 && u <= 0x39) || (u >= 0x41 && u <= 0x46) || (u >= 0x61 && u <= 0x66)
    }

    /// JS `parseInt(str, 16)`: leading whitespace, a sign, an optional 0x,
    /// then as many hex digits as there are; nil where JS gives NaN.
    private static func parseIntHex(_ units: [UInt16]) -> Int? {
        var i = 0
        while i < units.count, JS.isSpace(units[i]) { i += 1 }
        var sign = 1
        if i < units.count, units[i] == 0x2D || units[i] == 0x2B {
            if units[i] == 0x2D { sign = -1 }
            i += 1
        }
        if i + 1 < units.count, units[i] == 0x30, units[i + 1] == 0x78 || units[i + 1] == 0x58 { i += 2 }
        var value = 0
        var any = false
        while i < units.count, isHexDigit(units[i]) {
            value = value * 16 + Int(String(UnicodeScalar(units[i])!), radix: 16)!
            any = true
            i += 1
        }
        return any ? sign * value : nil
    }
}
