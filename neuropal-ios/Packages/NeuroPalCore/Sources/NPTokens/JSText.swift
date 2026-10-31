import Foundation

/// The handful of JS regular-expression shapes the "Ask Pal" interpreters
/// use, matched exactly the way JavaScript does: on UTF-16 code units, with
/// `\b` meaning a change between ASCII word characters ([A-Za-z0-9_]) and
/// anything else, and alternatives tried in order (the first that fits wins,
/// not the longest). NSRegularExpression's ICU `\b` is Unicode-aware and
/// would disagree on text like "café".
struct JSText {
    var units: [UInt16]

    init(_ string: String) { units = Array(string.utf16) }
    init(units: [UInt16]) { self.units = units }

    var string: String { String(decoding: units, as: UTF16.self) }
    var count: Int { units.count }

    static func isWord(_ c: UInt16) -> Bool {
        (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x5F
    }

    /// `[a-z0-9]`
    static func isLowerAlnum(_ c: UInt16) -> Bool { (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) }

    /// `[a-z0-9#-]`
    static func isTokenChar(_ c: UInt16) -> Bool { isLowerAlnum(c) || c == 0x23 || c == 0x2D }

    func isWord(at i: Int) -> Bool { i >= 0 && i < units.count && JSText.isWord(units[i]) }

    /// `\b` at position i.
    func boundary(_ i: Int) -> Bool { isWord(at: i - 1) != isWord(at: i) }

    func has(_ literal: [UInt16], at i: Int) -> Bool {
        guard i >= 0, i + literal.count <= units.count else { return false }
        for k in 0..<literal.count where units[i + k] != literal[k] { return false }
        return true
    }

    /// `\b(alt|alt|…)\b` at position i → the end of the match.
    func wordAlternation(_ alts: [[UInt16]], at i: Int) -> Int? {
        guard boundary(i) else { return nil }
        for a in alts where has(a, at: i) && boundary(i + a.count) { return i + a.count }
        return nil
    }

    /// `/\b(alt|alt|…)\b/.test(text)`
    func test(_ alts: [[UInt16]]) -> Bool {
        for i in 0...units.count where wordAlternation(alts, at: i) != nil { return true }
        return false
    }

    /// `text.replace(/\b(alt|alt|…)\b/g, replacement)`
    func replacingAll(_ alts: [[UInt16]], with replacement: [UInt16]) -> JSText {
        var out: [UInt16] = []
        var i = 0
        while i < units.count {
            if let end = wordAlternation(alts, at: i), end > i {
                out.append(contentsOf: replacement)
                i = end
            } else {
                out.append(units[i])
                i += 1
            }
        }
        return JSText(units: out)
    }

    /// `/needle/.test(text)` for a literal needle.
    func contains(_ needle: [UInt16]) -> Bool {
        guard needle.count <= units.count else { return false }
        for i in 0...(units.count - needle.count) where has(needle, at: i) { return true }
        return false
    }

    static func alts(_ words: [String]) -> [[UInt16]] { words.map { Array($0.utf16) } }
}
