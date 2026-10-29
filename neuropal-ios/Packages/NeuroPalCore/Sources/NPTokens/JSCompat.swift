import Foundation

/// The few JavaScript rules the port must reproduce exactly.
///
/// The look logic runs as JavaScript in the Expo app, the web platform and
/// the backend (packages/tokens/src). Swift disagrees with JS on small
/// things — how halves round, how `1.0` prints, what `Number(null)` is, what
/// counts as "true", which characters `\s` and `trim()` know — so the port
/// routes those through these helpers instead of the Swift built-ins.
enum JS {
    // MARK: Numbers

    /// `Math.round`: halves round UP (towards +∞). Swift's `.rounded()`
    /// rounds halves away from zero (-2.5 → -3; JS gives -2).
    static func round(_ x: Double) -> Double {
        guard x.isFinite else { return x }
        let f = x.rounded(.down)
        return (x - f) >= 0.5 ? f + 1 : f
    }

    static func roundInt(_ x: Double) -> Int { Int(round(x)) }

    /// `Number(value)` for a JSON value; `nil` is `undefined` (→ NaN).
    /// Yes: `Number(null)` is 0, `Number([])` is 0, `Number(["7"])` is 7.
    static func number(_ value: JSONValue?) -> Double {
        guard let value else { return .nan }
        switch value {
        case .null: return 0
        case .bool(let b): return b ? 1 : 0
        case .number(let n): return n
        case .string(let s): return stringToNumber(s)
        case .array: return stringToNumber(toString(value))
        case .object: return .nan
        }
    }

    /// `String(value)` for a JSON value.
    static func toString(_ value: JSONValue) -> String {
        switch value {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(let n): return numberToString(n)
        case .string(let s): return s
        // Array.prototype.join: null elements print as "".
        case .array(let a): return a.map { $0.isNull ? "" : toString($0) }.joined(separator: ",")
        case .object: return "[object Object]"
        }
    }

    /// The spec's StringToNumber: trimmed; "" → 0; 0x/0o/0b integers;
    /// ±Infinity; a decimal literal; anything else NaN.
    static func stringToNumber(_ string: String) -> Double {
        let s = Array(trim(string).unicodeScalars)
        if s.isEmpty { return 0 }
        func digits(_ scalars: ArraySlice<Unicode.Scalar>, radix: Int) -> Double {
            guard !scalars.isEmpty else { return .nan }
            var v = 0.0
            for c in scalars {
                guard let d = Int(String(c), radix: radix) else { return .nan }
                v = v * Double(radix) + Double(d)
            }
            return v
        }
        if s.count > 2, s[0] == "0" {
            switch s[1] {
            case "x", "X": return digits(s[2...], radix: 16)
            case "o", "O": return digits(s[2...], radix: 8)
            case "b", "B": return digits(s[2...], radix: 2)
            default: break
            }
        }
        var i = 0
        var negative = false
        if s[0] == "+" || s[0] == "-" {
            negative = s[0] == "-"
            i = 1
        }
        let rest = String(String.UnicodeScalarView(s[i...]))
        if rest == "Infinity" { return negative ? -.infinity : .infinity }
        // [digits][.digits] with at least one digit, then [e[+-]digits].
        var j = i
        var intDigits = 0
        var fracDigits = 0
        func isDigit(_ k: Int) -> Bool { k < s.count && s[k].value >= 0x30 && s[k].value <= 0x39 }
        while isDigit(j) { j += 1; intDigits += 1 }
        if j < s.count, s[j] == "." {
            j += 1
            while isDigit(j) { j += 1; fracDigits += 1 }
        }
        guard intDigits + fracDigits > 0 else { return .nan }
        if j < s.count, s[j] == "e" || s[j] == "E" {
            var k = j + 1
            if k < s.count, s[k] == "+" || s[k] == "-" { k += 1 }
            guard isDigit(k) else { return .nan }
            while isDigit(k) { k += 1 }
            j = k
        }
        guard j == s.count else { return .nan }
        // Spell it the way Swift's parser surely accepts: "5." → "5.0", ".5" → "0.5".
        var literal = String(String.UnicodeScalarView(s[i...]))
        if intDigits == 0 { literal = "0" + literal }
        literal = literal.replacingOccurrences(of: ".e", with: ".0e").replacingOccurrences(of: ".E", with: ".0E")
        if literal.hasSuffix(".") { literal += "0" }
        guard let v = Double(literal) else { return .nan }
        return negative ? -v : v
    }

    /// `Number.prototype.toString()`: `1` not `1.0`, `0.3`, `1e-7`, `1e+21`.
    static func numberToString(_ x: Double) -> String {
        if x.isNaN { return "NaN" }
        if x == 0 { return "0" }
        if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
        if x < 0 { return "-" + numberToString(-x) }
        // Swift's description is the shortest round-trip form too; only the
        // layout differs. Take its digits and exponent, lay them out like JS.
        let description = "\(x)"
        var mantissa = Substring(description)
        var exponent = 0
        if let e = description.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = description[..<e]
            exponent = Int(description[description.index(after: e)...]) ?? 0
        }
        var intPart = mantissa
        var fracPart = Substring("")
        if let dot = mantissa.firstIndex(of: ".") {
            intPart = mantissa[..<dot]
            fracPart = mantissa[mantissa.index(after: dot)...]
        }
        var digits = Array(intPart + fracPart)
        var point = intPart.count + exponent
        while digits.count > 1, digits.first == "0" {
            digits.removeFirst()
            point -= 1
        }
        while digits.count > 1, digits.last == "0" { digits.removeLast() }
        let k = digits.count
        let n = point
        let d = String(digits)
        if k <= n, n <= 21 { return d + String(repeating: "0", count: n - k) }
        if n > 0, n <= 21 { return String(digits[0..<n]) + "." + String(digits[n...]) }
        if n > -6, n <= 0 { return "0." + String(repeating: "0", count: -n) + d }
        let e = n - 1
        let sign = e < 0 ? "-" : "+"
        let head = k == 1 ? d : String(digits[0]) + "." + String(digits[1...])
        return head + "e" + sign + String(abs(e))
    }

    // MARK: Truthiness and objects

    /// `Boolean(value)`: null, false, 0, NaN and "" are false; everything
    /// else (including "false", [] and {}) is true. `nil` is `undefined`.
    static func truthy(_ value: JSONValue?) -> Bool {
        guard let value else { return false }
        switch value {
        case .null: return false
        case .bool(let b): return b
        case .number(let n): return n != 0 && !n.isNaN
        case .string(let s): return !s.isEmpty
        case .array, .object: return true
        }
    }

    /// `input && typeof input === "object" ? input : {}`. Arrays are objects
    /// in JS but carry none of the named keys the port reads, so they count
    /// as empty.
    static func object(_ value: JSONValue?) -> [String: JSONValue] {
        if case .object(let o)? = value { return o }
        return [:]
    }

    // MARK: Strings

    /// JS WhiteSpace + LineTerminator — what `\s` and `trim()` match.
    static func isSpace(_ u: UInt16) -> Bool {
        switch u {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F,
             0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    /// `String.prototype.trim()`.
    static func trim(_ s: String) -> String {
        let u = Array(s.utf16)
        var start = 0
        var end = u.count
        while start < end, isSpace(u[start]) { start += 1 }
        while end > start, isSpace(u[end - 1]) { end -= 1 }
        return String(decoding: u[start..<end], as: UTF16.self)
    }

    /// `s.slice(0, n)`, counted in UTF-16 code units like JS. A cut through
    /// an emoji drops its orphaned first half (Swift strings can't hold one).
    static func prefixUTF16(_ s: String, _ n: Int) -> String {
        var u = Array(s.utf16.prefix(n))
        if let last = u.last, UTF16.isLeadSurrogate(last) { u.removeLast() }
        return String(decoding: u, as: UTF16.self)
    }

    /// `str.replace(search, replacement)` with a STRING search: only the
    /// first match, and the replacement's `$$`, `$&`, `` $` ``, `$'` patterns
    /// apply (JS does that even for plain strings).
    static func replaceFirst(_ str: String, _ search: String, with replacement: String) -> String {
        guard let range = str.range(of: search, options: .literal) else { return str }
        var out = ""
        let rep = Array(replacement)
        var i = 0
        while i < rep.count {
            let c = rep[i]
            if c == "$", i + 1 < rep.count {
                switch rep[i + 1] {
                case "$": out.append("$"); i += 2; continue
                case "&": out += str[range]; i += 2; continue
                case "`": out += str[..<range.lowerBound]; i += 2; continue
                case "'": out += str[range.upperBound...]; i += 2; continue
                default: break
                }
            }
            out.append(c)
            i += 1
        }
        return String(str[..<range.lowerBound]) + out + String(str[range.upperBound...])
    }

    /// `String(s).charAt(0).toUpperCase() + String(s).slice(1)`.
    static func cap(_ s: String) -> String {
        guard let first = s.first else { return s }
        return first.uppercased() + s.dropFirst()
    }
}
