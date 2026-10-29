import Foundation

/// The reader's words, counted exactly the way the Expo app and the web
/// count them, so a word index — the highlight, the resume point,
/// `lastWordIndex`, which syncs between devices — means the same word on
/// every client.
///
/// A port of neuropal-expo-app/src/utils/math.js (`tokenizeMathParagraph`,
/// `blockMathOf`, `isUnicodeMathParagraph`, `splitParagraphMathSafe`) and of
/// the word stream both clients build from GET /documents/:id/text
/// (readerSlice.js `textToSections` + ReaderScreen;
/// neuropal-platform/src/lib/neuropal/reader/sections.ts), quirks included:
/// - paragraphs: the text split on two or more "\n", whitespace collapsed,
///   empties dropped (the server's toc and pageMap index this list);
/// - a paragraph that is one display equation ($$…$$, \[…\], one $…$) or
///   PDF "unicode maths" is ONE word;
/// - an inline $…$ island is ONE word, apart from the punctuation around it:
///   "($\rho$)," is "(", ρ, "),";
/// - paragraphs over 180 words are read as pieces (a piece can be an equation);
/// - without a table of contents that holds, a structured document's
///   chapter headings are chapter titles, not words.
///
/// Checked against fixtures generated from the JavaScript
/// (Tests/NPCoreTests/Fixtures/reader-words.json).
public enum ReaderWords {
    public struct Token: Equatable, Sendable {
        public enum Kind: String, Equatable, Sendable {
            case word, math, equation
        }

        public var kind: Kind
        /// The word, or the LaTeX source of maths ("" for an empty island or
        /// a paragraph of PDF unicode maths).
        public var text: String
        /// Whitespace came before it in its paragraph (false: it touches the
        /// one before, like "(" and "$x$").
        public var spaceBefore: Bool
        /// What it stands for in the paragraph: the word, the `$…$` island,
        /// or the whole paragraph (or piece) an equation replaces.
        public var source: String

        public init(kind: Kind, text: String, spaceBefore: Bool, source: String? = nil) {
            self.kind = kind
            self.text = text
            self.spaceBefore = spaceBefore
            self.source = source ?? text
        }
    }

    public struct Paragraph: Equatable, Sendable {
        /// The paragraph, whitespace collapsed.
        public var text: String
        /// Its words in the shared stream (none for a chapter title).
        public var tokens: [Token]
        /// A chapter heading the other clients show only as a title.
        public var isChapterTitle: Bool
    }

    static let maxParagraphWords = 180
    static let minChapterParagraphs = 5

    // MARK: The word stream

    /// Every paragraph of a document with its words; the paragraphs' tokens,
    /// in order, are the reader's word stream.
    public static func build(text: String, toc: [TocEntry], pageMap: [PageAnchor], pageCount: Int?) -> [Paragraph] {
        let rough = paragraphs(text)
        guard !rough.isEmpty else { return [] }
        var titles: Set<Int> = []
        if !(toc.count >= 2 && tocAnchorCount(paragraphs: rough.count, toc: toc, pageMap: pageMap,
                                               pageCount: pageCount ?? 0) >= 2) {
            titles = chapterTitles(rough)
        }
        return rough.enumerated().map { index, p in
            titles.contains(index)
                ? Paragraph(text: p, tokens: [], isChapterTitle: true)
                : Paragraph(text: p, tokens: streamTokens(p), isChapterTitle: false)
        }
    }

    /// `text.split(/\n{2,}/).map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean)`
    public static func paragraphs(_ text: String) -> [String] {
        var out: [String] = []
        var current = String.UnicodeScalarView()
        var newlines = 0
        func flush() {
            let p = collapse(current)
            if !p.isEmpty { out.append(p) }
            current = String.UnicodeScalarView()
        }
        for s in text.unicodeScalars {
            if s == "\n" {
                newlines += 1
                continue
            }
            if newlines >= 2 { flush() } else if newlines == 1 { current.append(" ") }
            newlines = 0
            current.append(s)
        }
        flush()
        return out
    }

    /// One paragraph's words in the stream: whole, or piece by piece when it's long.
    static func streamTokens(_ p: String) -> [Token] {
        let pieces = wordCount(p) <= maxParagraphWords || blockMath(p) != nil ? [p] : self.pieces(p, max: maxParagraphWords)
        var out: [Token] = []
        for (k, piece) in pieces.enumerated() {
            if let latex = blockMath(piece) {
                out.append(Token(kind: .equation, text: latex, spaceBefore: k > 0, source: piece))
            } else if isUnicodeMath(piece) {
                out.append(Token(kind: .equation, text: "", spaceBefore: k > 0, source: piece))
            } else {
                var t = tokens(piece)
                if k > 0, !t.isEmpty { t[0].spaceBefore = true }
                out += t
            }
        }
        return out
    }

    // MARK: One paragraph (tokenizeMathParagraph)

    /// The words of a paragraph: whitespace-separated words, with every
    /// `$$…$$` / `$…$` island (`/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g`) one word of its own.
    public static func tokens(_ paragraph: String) -> [Token] {
        let c = Array(paragraph.unicodeScalars)
        var out: [Token] = []
        var last = 0
        while let (start, end) = nextIsland(c, from: last) {
            words(c, last..<start, into: &out)
            let alt1 = c[start + 1] == "$"
            let inner = alt1 ? c[(start + 2)..<(end - 2)] : c[(start + 1)..<(end - 1)]
            out.append(Token(kind: .math, text: trimmed(inner), spaceBefore: start > 0 && isSpace(c[start - 1]),
                             source: string(c[start..<end])))
            last = end
        }
        words(c, last..<c.count, into: &out)
        return out
    }

    /// The island starting at or after `from`, leftmost first, as the regex finds it.
    static func nextIsland(_ c: [Unicode.Scalar], from: Int) -> (Int, Int)? {
        var s = from
        while s < c.count {
            if c[s] == "$", let end = island(c, at: s) { return (s, end) }
            s += 1
        }
        return nil
    }

    /// End of the island opening at `s`: `\$\$[\s\S]*?\$\$` first, then `\$[^$\n]+\$`.
    static func island(_ c: [Unicode.Scalar], at s: Int) -> Int? {
        if s + 1 < c.count, c[s + 1] == "$" {
            var j = s + 2
            while j + 1 < c.count {
                if c[j] == "$", c[j + 1] == "$" { return j + 2 }
                j += 1
            }
        }
        var j = s + 1
        while j < c.count, c[j] != "$", c[j] != "\n" { j += 1 }
        if j < c.count, c[j] == "$", j > s + 1 { return j + 1 }
        return nil
    }

    /// `str.split(/\s+/)`, empties dropped.
    static func words(_ c: [Unicode.Scalar], _ range: Range<Int>, into out: inout [Token]) {
        var i = range.lowerBound
        while i < range.upperBound {
            while i < range.upperBound, isSpace(c[i]) { i += 1 }
            guard i < range.upperBound else { break }
            let start = i
            while i < range.upperBound, !isSpace(c[i]) { i += 1 }
            out.append(Token(kind: .word, text: string(c[start..<i]), spaceBefore: start > 0 && isSpace(c[start - 1])))
        }
    }

    // MARK: Equations (blockMathOf, isUnicodeMathParagraph)

    /// The LaTeX of a paragraph that is one display equation —
    /// `/^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+)\$)\s*$/` —
    /// or nil (also when it's empty, which the JavaScript treats as no).
    public static func blockMath(_ paragraph: String) -> String? {
        guard paragraph.utf16.count >= 4 else { return nil }
        var t = Array(paragraph.unicodeScalars)[...]
        while let f = t.first, isSpace(f) { t = t.dropFirst() }
        while let l = t.last, isSpace(l) { t = t.dropLast() }
        let a = Array(t)
        let n = a.count
        var inner: ArraySlice<Unicode.Scalar>?
        if n >= 5, a[0] == "$", a[1] == "$", a[n - 2] == "$", a[n - 1] == "$" {
            inner = a[2..<(n - 2)]
        } else if n >= 5, a[0] == "\\", a[1] == "[", a[n - 2] == "\\", a[n - 1] == "]" {
            inner = a[2..<(n - 2)]
        } else if n >= 3, a[0] == "$", a[n - 1] == "$", !a[1..<(n - 1)].contains("$") {
            inner = a[1..<(n - 1)]
        }
        guard let inner else { return nil }
        let latex = trimmed(inner)
        return latex.isEmpty ? nil : latex
    }

    static let mathChars: Set<Unicode.Scalar> = scalars([
        0x3008, 0x3009, 0x27E8, 0x27E9, 0x2206, 0x2202, 0x02C6, 0x2020, 0x00B1, 0x00D7, 0x00F7, 0x2248, 0x2260, 0x2261,
        0x2264, 0x2265, 0x2211, 0x220F, 0x222B, 0x221A, 0x210F, 0x03C9, 0x03B8, 0x03C6, 0x03C7, 0x03C8, 0x03A8, 0x03A6,
        0x03A9, 0x03B1, 0x03B2, 0x03B3, 0x03B4, 0x03B5, 0x03C3, 0x03C1, 0x03BB, 0x03BC, 0x03BD, 0x03C0, 0x221E, 0x2032,
        0x2033, 0x007C,
    ])
    static let strongMathChars: Set<Unicode.Scalar> = scalars([
        0x3008, 0x3009, 0x27E8, 0x27E9, 0x2206, 0x2202, 0x02C6, 0x2020, 0x2211, 0x220F, 0x222B, 0x221A, 0x210F,
    ])
    static let equationChars: Set<Unicode.Scalar> = scalars([0x003D, 0x002B, 0x2212, 0x005E, 0x005F, 0x002F, 0x002D])

    /// A paragraph of typeset maths that PDF text extraction turned into
    /// fragments ("〈∆X 2 a 〉= 1 2 e −2r"): shown and counted as one equation.
    public static func isUnicodeMath(_ paragraph: String) -> Bool {
        let length = paragraph.utf16.count
        guard length >= 8, length <= 500 else { return false }
        let s = paragraph.unicodeScalars
        guard s.contains(where: { strongMathChars.contains($0) }) else { return false }
        let mathCount = s.reduce(0) { $0 + (mathChars.contains($1) ? 1 : 0) }
        let eqCount = s.reduce(0) { $0 + (equationChars.contains($1) ? 1 : 0) }
        let parts = jsSplit(Array(s))
        let short = parts.filter { part in
            part.reduce(0) { $0 + (isASCIILetter($1) ? 1 : 0) } <= 2
        }.count
        return mathCount + eqCount >= 6 && Double(short) / Double(max(1, parts.count)) > 0.55
    }

    // MARK: Long paragraphs (splitParagraphMathSafe)

    /// Pieces of at most `max` words, never cutting an island; joined with single spaces.
    static func pieces(_ paragraph: String, max: Int) -> [String] {
        let c = Array(paragraph.unicodeScalars)
        var units: [String] = []
        var last = 0
        func prose(_ range: Range<Int>) {
            var t: [Token] = []
            words(c, range, into: &t)
            units += t.map(\.text)
        }
        while let (start, end) = nextIsland(c, from: last) {
            if start > last { prose(last..<start) }
            units.append(string(c[start..<end]))
            last = end
        }
        if last < c.count { prose(last..<c.count) }
        var pieces: [String] = []
        var current: [String] = []
        for u in units {
            current.append(u)
            if current.count >= max {
                pieces.append(current.joined(separator: " "))
                current = []
            }
        }
        if !current.isEmpty { pieces.append(current.joined(separator: " ")) }
        return pieces.isEmpty ? [paragraph] : pieces
    }

    /// `p.split(" ").length`
    static func wordCount(_ p: String) -> Int {
        p.unicodeScalars.reduce(1) { $0 + ($1 == " " ? 1 : 0) }
    }

    // MARK: Chapters (only to know which headings aren't words)

    /// How many table-of-contents anchors hold (the clients use the toc when ≥ 2).
    static func tocAnchorCount(paragraphs count: Int, toc: [TocEntry], pageMap: [PageAnchor], pageCount: Int) -> Int {
        func paragraphForPage(_ page: Int) -> Int? {
            guard !pageMap.isEmpty else { return nil }
            var hit: Int?
            for e in pageMap {
                if e.page <= page { hit = e.startParagraph } else { break }
            }
            return hit
        }
        let raw: [(exact: Int?, est: Int?)] = toc.map { entry in
            var exact: Int?
            if let p = entry.startParagraph, p >= 0 { exact = min(p, count - 1) }
            if exact == nil, let page = entry.startPage, page != 0, let mapped = paragraphForPage(page) {
                exact = min(mapped, count - 1)
            }
            var est: Int?
            if exact == nil, let page = entry.startPage, page != 0, pageCount > 0 {
                est = min(count - 1, Int((Double(page - 1) / Double(pageCount) * Double(count) + 0.5).rounded(.down)))
            }
            return (exact, est)
        }
        var anchors: [Int] = []
        for (i, a) in raw.enumerated() {
            var idx = a.exact
            if idx == nil, let est = a.est {
                var lo = -1
                for j in stride(from: i - 1, through: 0, by: -1) {
                    if let e = raw[j].exact {
                        lo = e
                        break
                    }
                }
                var hi = count
                for j in (i + 1)..<raw.count {
                    if let e = raw[j].exact {
                        hi = e
                        break
                    }
                }
                idx = Swift.max(lo + 1, Swift.min(est, hi - 1))
            }
            guard let idx else { continue }
            if let last = anchors.last, idx <= last { continue }
            anchors.append(idx)
        }
        return anchors.count
    }

    /// The paragraphs that are chapter titles (not words) when a document
    /// without a usable toc is "structured": detected headings group it into
    /// chapters, slivers merge into the one before (their heading becomes a
    /// paragraph), and 3…max(6, paragraphs / 15) chapters remain.
    static func chapterTitles(_ rough: [String]) -> Set<Int> {
        var chapters: [(heading: Int?, count: Int)] = []
        var current: (heading: Int?, count: Int) = (nil, 0)
        for (i, p) in rough.enumerated() {
            let heading = isHeading(p)
            if heading && current.count > 0 {
                chapters.append(current)
                current = (i, 0)
                continue
            }
            if heading && current.heading == nil && current.count == 0 {
                current.heading = i
                continue
            }
            current.count += wordCount(p) <= maxParagraphWords || blockMath(p) != nil ? 1 : pieces(p, max: maxParagraphWords).count
        }
        if current.count > 0 || current.heading != nil { chapters.append(current) }

        var merged: [(heading: Int?, count: Int)] = []
        for ch in chapters {
            if !merged.isEmpty && ch.count < minChapterParagraphs {
                merged[merged.count - 1].count += ch.count + (ch.heading == nil ? 0 : 1)
            } else {
                merged.append(ch)
            }
        }
        let total = merged.reduce(0) { $0 + $1.count }
        let structured = merged.count >= 3 && Double(merged.count) <= Swift.max(6, Double(total) / 15)
        return structured ? Set(merged.compactMap(\.heading)) : []
    }

    /// The clients' chapter-heading test (readerSlice.js `isHeadingParagraph`).
    static func isHeading(_ p: String) -> Bool {
        if p.utf16.count > 70 { return false }
        let c = Array(p.unicodeScalars)
        guard let last = c.last, !".!?,;".unicodeScalars.contains(last) else { return false }
        // /^(chapter|part|appendix|preface|introduction|bibliography|epilogue|prologue)\b/i
        for word in ["chapter", "part", "appendix", "preface", "introduction", "bibliography", "epilogue", "prologue"] {
            let w = Array(word.unicodeScalars)
            guard c.count >= w.count else { continue }
            if zip(c, w).allSatisfy({ asciiLower($0) == $1 }), c.count == w.count || !isWordChar(c[w.count]) { return true }
        }
        // /^\d{1,2}\.?\s+[A-Z]/
        var digits = 0
        while digits < 2, digits < c.count, isDigit(c[digits]) { digits += 1 }
        for d in stride(from: digits, through: 1, by: -1) {
            var j = d
            if j < c.count, c[j] == "." { j += 1 }
            let spaces = j
            while j < c.count, isSpace(c[j]) { j += 1 }
            if j > spaces, j < c.count, isUpper(c[j]) { return true }
        }
        // /^[A-Z]/ && p === p.toUpperCase() && /[A-Z]{3}/
        guard isUpper(c[0]), c.elementsEqual(p.uppercased().unicodeScalars) else { return false }
        var run = 0
        for s in c {
            run = isUpper(s) ? run + 1 : 0
            if run >= 3 { return true }
        }
        return false
    }

    // MARK: Characters, as JavaScript sees them

    /// JavaScript's `\s`.
    static func isSpace(_ s: Unicode.Scalar) -> Bool {
        switch s.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        default: return false
        }
    }

    static func isDigit(_ s: Unicode.Scalar) -> Bool { (0x30...0x39).contains(s.value) }
    static func isUpper(_ s: Unicode.Scalar) -> Bool { (0x41...0x5A).contains(s.value) }
    static func isASCIILetter(_ s: Unicode.Scalar) -> Bool { isUpper(s) || (0x61...0x7A).contains(s.value) }
    static func isWordChar(_ s: Unicode.Scalar) -> Bool { isASCIILetter(s) || isDigit(s) || s == "_" }
    static func asciiLower(_ s: Unicode.Scalar) -> Unicode.Scalar { isUpper(s) ? Unicode.Scalar(s.value + 32)! : s }

    /// `p.replace(/\s+/g, " ").trim()`
    static func collapse(_ scalars: String.UnicodeScalarView) -> String {
        var out = String.UnicodeScalarView()
        var pending = false
        for s in scalars {
            if isSpace(s) {
                pending = !out.isEmpty
                continue
            }
            if pending {
                out.append(" ")
                pending = false
            }
            out.append(s)
        }
        return String(out)
    }

    /// `String(slice).trim()`
    static func trimmed(_ slice: ArraySlice<Unicode.Scalar>) -> String {
        var t = slice
        while let f = t.first, isSpace(f) { t = t.dropFirst() }
        while let l = t.last, isSpace(l) { t = t.dropLast() }
        return string(t)
    }

    /// `str.split(/\s+/)` — empties kept, as JavaScript keeps them.
    static func jsSplit(_ c: [Unicode.Scalar]) -> [ArraySlice<Unicode.Scalar>] {
        var parts: [ArraySlice<Unicode.Scalar>] = []
        var start = 0
        var i = 0
        while i < c.count {
            if isSpace(c[i]) {
                parts.append(c[start..<i])
                while i < c.count, isSpace(c[i]) { i += 1 }
                start = i
            } else {
                i += 1
            }
        }
        parts.append(c[start..<c.count])
        return parts
    }

    static func string(_ slice: ArraySlice<Unicode.Scalar>) -> String {
        var v = String.UnicodeScalarView()
        v.append(contentsOf: slice)
        return String(v)
    }

    static func scalars(_ values: [UInt32]) -> Set<Unicode.Scalar> {
        Set(values.compactMap(Unicode.Scalar.init))
    }
}
