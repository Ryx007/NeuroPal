import Foundation
import NPCore

/// A document's text shaped for reading and speaking: one display block per
/// server paragraph (DocumentText.text split on blank lines, exactly like the
/// Expo reader, so `toc.startParagraph` and `pageMap` index the blocks
/// directly), every word with its UTF-16 range in `string`, what the voice
/// says for it, and the chapters, pages and sentences mapped onto words.
/// Immutable once built (built off the main thread for big books).
struct ReadingText: @unchecked Sendable {
    enum Kind: Equatable {
        case title, heading, paragraph, equation
    }

    struct Block {
        var kind: Kind
        /// UTF-16 range in `string` (without the separating newline).
        var range: NSRange
        var words: Range<Int>
    }

    struct Word {
        var location: Int
        var length: Int
        var block: Int
        var isMath: Bool
        var range: NSRange { NSRange(location: location, length: length) }
    }

    struct Chapter: Identifiable, Hashable {
        /// The block it starts at (unique).
        var id: Int { block }
        var title: String
        var block: Int
        var page: Int?
    }

    struct PageMark: Hashable {
        var page: Int
        var block: Int
    }

    let documentID: String
    let title: String
    /// Every block's display text, joined with "\n".
    let string: NSString
    let blocks: [Block]
    let words: [Word]
    /// What the voice says for each word ("" = silent).
    let speech: [String]
    let chapters: [Chapter]
    let pages: [PageMark]
    let pageCount: Int?
    /// Word indices that begin a sentence (ascending).
    let sentenceStarts: [Int]
    /// Word ranges the voice speaks as one utterance (paragraphs, long ones split at sentences).
    let units: [Range<Int>]
    /// Pause after each unit, seconds (longer after headings).
    let unitPauses: [Double]
    /// The server's paragraphs (whitespace-normalised source), for finding citations.
    let paragraphs: [String]

    var isEmpty: Bool { words.isEmpty }

    // MARK: Lookups

    /// The word at (or just before) a UTF-16 offset.
    func word(atUTF16 offset: Int) -> Int? {
        guard !words.isEmpty else { return nil }
        var lo = 0
        var hi = words.count - 1
        var hit = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if words[mid].location <= offset {
                hit = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return hit
    }

    func clamp(_ word: Int) -> Int { min(max(0, word), max(0, words.count - 1)) }

    func block(ofWord word: Int) -> Int { words.isEmpty ? 0 : words[clamp(word)].block }

    func blockText(_ block: Int) -> String {
        guard blocks.indices.contains(block) else { return "" }
        return string.substring(with: blocks[block].range)
    }

    /// The chapter a block belongs to (nil before the first one).
    func chapterIndex(forBlock block: Int) -> Int? {
        chapters.lastIndex { $0.block <= block }
    }

    func chapterIndex(forWord word: Int) -> Int? { chapterIndex(forBlock: block(ofWord: word)) }

    /// Word range of a chapter (to the next chapter or the end).
    func wordRange(ofChapter index: Int) -> Range<Int> {
        guard chapters.indices.contains(index), !words.isEmpty else { return 0..<words.count }
        let start = blocks[chapters[index].block].words.lowerBound
        let end = index + 1 < chapters.count ? blocks[chapters[index + 1].block].words.lowerBound : words.count
        return start..<max(start, end)
    }

    /// The real page a block sits on (pageMap), nil when the document has none.
    func page(forBlock block: Int) -> Int? {
        guard !pages.isEmpty else { return nil }
        return (pages.last { $0.block <= block } ?? pages[0]).page
    }

    func page(forWord word: Int) -> Int? { page(forBlock: block(ofWord: word)) }

    /// First word of a page (exact with a pageMap, proportional otherwise).
    func word(forPage page: Int) -> Int? {
        guard !words.isEmpty else { return nil }
        if let mark = pages.last(where: { $0.page <= page }) { return blocks[mark.block].words.lowerBound }
        if let count = pageCount, count > 0 {
            return clamp(Int(Double(page - 1) / Double(count) * Double(words.count)))
        }
        return nil
    }

    var lastPage: Int? { pages.last?.page ?? pageCount }

    // Sentence and paragraph steps. "Previous" goes to the start of the
    // current one unless the voice is already there (like a music player).

    func sentenceStart(before word: Int) -> Int {
        let w = clamp(word)
        guard let i = sentenceStarts.lastIndex(where: { $0 <= w }) else { return 0 }
        if w - sentenceStarts[i] > 1 { return sentenceStarts[i] }
        return i > 0 ? sentenceStarts[i - 1] : 0
    }

    func sentenceStart(after word: Int) -> Int? {
        sentenceStarts.first { $0 > word }
    }

    func blockStart(before word: Int) -> Int {
        let b = block(ofWord: word)
        let start = blocks[b].words.lowerBound
        if word - start > 1 || b == 0 { return start }
        // Chapter titles hold no words: step over them.
        var p = b - 1
        while p > 0, blocks[p].words.isEmpty { p -= 1 }
        return blocks[p].words.lowerBound
    }

    func blockStart(after word: Int) -> Int? {
        let b = block(ofWord: word)
        guard let next = blocks[(b + 1)...].first(where: { !$0.words.isEmpty }) else { return nil }
        return next.words.lowerBound
    }

    /// The first word at or after a block (a chapter title has none of its own).
    func firstWord(ofBlock block: Int) -> Int {
        guard blocks.indices.contains(block) else { return clamp(0) }
        return clamp(blocks[block].words.lowerBound)
    }

    /// The first word of the passage a citation quotes (nil when the excerpt isn't found).
    func word(matching excerpt: String) -> Int? {
        let needle = Self.searchKey(excerpt)
        guard needle.count >= 6 else { return nil }
        let keys = paragraphs.map(Self.searchKey)
        for length in [needle.count, 90, 48, 24] where length <= needle.count {
            let probe = String(needle.prefix(length))
            for (index, key) in keys.enumerated() where !blocks[index].words.isEmpty {
                guard let r = key.range(of: probe) else { continue }
                let before = key[..<r.lowerBound].split(separator: " ").count
                let block = blocks[index]
                return min(block.words.lowerBound + before, block.words.upperBound - 1)
            }
        }
        return nil
    }

    static func searchKey(_ s: String) -> String {
        var out = ""
        var space = false
        for ch in s.lowercased() {
            if ch.isLetter || ch.isNumber {
                if space, !out.isEmpty { out.append(" ") }
                space = false
                out.append(ch)
            } else {
                space = true
            }
        }
        return out
    }

    // MARK: Building

    /// The words come from `ReaderWords` (NPCore), which counts them exactly
    /// as the Expo app and the web do: the saved `lastWordIndex` is the same
    /// word on every device. Display and speech are this app's own.
    static func build(_ doc: DocumentText, documentID: String, fallbackTitle: String) -> ReadingText {
        let stream = ReaderWords.build(text: doc.text, toc: doc.toc, pageMap: doc.pageMap, pageCount: doc.pageCount)
        let paragraphs = stream.map(\.text)
        let title = doc.title.isEmpty ? fallbackTitle : doc.title
        let tocStarts = Set(doc.toc.compactMap(\.startParagraph))
        let string = NSMutableString()
        var blocks: [Block] = []
        var words: [Word] = []
        var speech: [String] = []
        var shown: [String] = []
        blocks.reserveCapacity(stream.count)

        for (index, para) in stream.enumerated() {
            if index > 0 { string.append("\n") }
            let paragraph = para.text
            let equation = para.tokens.count == 1 && para.tokens[0].kind == .equation
            var kind: Kind = equation ? .equation : classify(paragraph, index: index, tocStarts: tocStarts, title: title,
                                                             hasToc: !doc.toc.isEmpty)
            // A chapter title of a document without a toc: shown, but not a
            // word (the other clients show it as the chapter's name).
            if para.isChapterTitle { kind = index == 0 ? .title : .heading }
            let start = string.length
            let first = words.count
            if equation {
                let display = render(para.tokens[0]).display
                string.append(display)
                words.append(Word(location: start, length: string.length - start, block: index, isMath: true))
                speech.append("Equation.")
                shown.append(display)
            } else if para.tokens.isEmpty {
                string.append(paragraph)
            } else {
                for (k, token) in para.tokens.enumerated() {
                    let (display, spoken, isMath) = render(token)
                    if k > 0, token.spaceBefore { string.append(" ") }
                    let location = string.length
                    string.append(display)
                    words.append(Word(location: location, length: string.length - location, block: index, isMath: isMath))
                    speech.append(spoken)
                    shown.append(display)
                }
            }
            blocks.append(Block(kind: kind, range: NSRange(location: start, length: string.length - start),
                                words: first..<words.count))
        }

        // Pages (real anchors only) and chapters.
        let lastBlock = max(0, blocks.count - 1)
        let pages: [PageMark] = blocks.isEmpty ? [] : doc.pageMap
            .sorted { $0.page < $1.page }
            .map { PageMark(page: $0.page, block: min(max(0, $0.startParagraph), lastBlock)) }
        func pageFor(_ block: Int) -> Int? {
            guard !pages.isEmpty else { return nil }
            return (pages.last { $0.block <= block } ?? pages[0]).page
        }

        var chapters: [Chapter] = []
        if !blocks.isEmpty {
            for entry in doc.toc {
                var block: Int?
                if let p = entry.startParagraph, p >= 0 {
                    block = min(p, lastBlock)
                } else if let page = entry.startPage {
                    if let mark = pages.last(where: { $0.page <= page }) {
                        block = mark.block
                    } else if let count = doc.pageCount, count > 0 {
                        block = min(lastBlock, Int(Double(page - 1) / Double(count) * Double(blocks.count)))
                    }
                }
                guard let block else { continue }
                if let last = chapters.last, block <= last.block { continue }
                let name = entry.title.trimmingCharacters(in: .whitespacesAndNewlines)
                chapters.append(Chapter(title: name.isEmpty ? "Chapter \(chapters.count + 1)" : name, block: block,
                                        page: entry.startPage ?? pageFor(block)))
            }
            if chapters.isEmpty {
                for (i, b) in blocks.enumerated() where b.kind == .heading {
                    chapters.append(Chapter(title: string.substring(with: b.range), block: i, page: pageFor(i)))
                }
            }
        }

        // Sentences, then speech units (paragraphs; long ones split at a sentence).
        var isStart = [Bool](repeating: false, count: words.count)
        for b in blocks where !b.words.isEmpty {
            isStart[b.words.lowerBound] = true
            var w = b.words.lowerBound + 1
            while w < b.words.upperBound {
                if endsSentence(shown[w - 1]) { isStart[w] = true }
                w += 1
            }
        }
        var sentenceStarts: [Int] = []
        for (i, s) in isStart.enumerated() where s { sentenceStarts.append(i) }

        var units: [Range<Int>] = []
        var pauses: [Double] = []
        for b in blocks where !b.words.isEmpty {
            var s = b.words.lowerBound
            var w = s + 1
            while w < b.words.upperBound {
                let length = w - s
                if (length >= 90 && isStart[w]) || length >= 220 {
                    units.append(s..<w)
                    pauses.append(0)
                    s = w
                }
                w += 1
            }
            units.append(s..<b.words.upperBound)
            pauses.append(b.kind == .paragraph ? 0.15 : 0.45)
        }

        return ReadingText(documentID: documentID, title: title, string: string.copy() as? NSString ?? string,
                           blocks: blocks, words: words, speech: speech, chapters: chapters, pages: pages,
                           pageCount: doc.pageCount, sentenceStarts: sentenceStarts, units: units, unitPauses: pauses,
                           paragraphs: paragraphs)
    }

    /// How a word of the stream is shown and spoken: maths through
    /// MathText (never read out as LaTeX), a piece of PDF maths as written.
    static func render(_ token: ReaderWords.Token) -> (display: String, speech: String, isMath: Bool) {
        switch token.kind {
        case .word:
            return (token.text, token.text, false)
        case .math:
            guard !token.text.isEmpty else { return ("…", "", true) }
            let shown = MathText.display(token.text)
            return (shown.isEmpty ? token.text : shown, MathText.tidySpeech(MathText.speech(token.text)), true)
        case .equation:
            let shown = token.text.isEmpty ? "" : MathText.display(token.text)
            return (shown.isEmpty ? token.source : shown, "Equation.", true)
        }
    }

    /// Title and heading lines, for display (equations come from the word stream).
    static func classify(_ p: String, index: Int, tocStarts: Set<Int>, title: String, hasToc: Bool) -> Kind {
        let headingShaped = p.count <= 120 && !(p.last.map { ".!?,;:".contains($0) } ?? true)
        if index == 0, headingShaped, searchKey(p) == searchKey(title) { return .title }
        if tocStarts.contains(index), headingShaped { return .heading }
        if !hasToc, looksLikeHeading(p) { return index == 0 ? .title : .heading }
        return .paragraph
    }

    /// Expo's heading heuristic, for documents without a table of contents.
    static func looksLikeHeading(_ p: String) -> Bool {
        guard p.count <= 70, let last = p.last, !".!?,;".contains(last) else { return false }
        let first = (p.split(separator: " ").first.map(String.init) ?? "")
            .lowercased().trimmingCharacters(in: .punctuationCharacters)
        let starters: Set<String> = [
            "chapter", "part", "appendix", "preface", "introduction", "bibliography", "epilogue", "prologue",
            "references", "acknowledgements", "acknowledgments", "conclusion", "conclusions", "contents", "abstract",
            "summary",
        ]
        if starters.contains(first) { return true }
        let c = Array(p)
        var k = 0
        while k < c.count, k < 2, c[k].isNumber { k += 1 }
        if k > 0 {
            if k < c.count, c[k] == "." { k += 1 }
            if k + 1 < c.count, c[k] == " ", c[k + 1].isUppercase { return true }
        }
        let letters = p.filter(\.isLetter)
        return letters.count >= 3 && p == p.uppercased() && letters.contains(where: \.isUppercase)
    }

    static let abbreviations: Set<String> = [
        "e.g.", "i.e.", "fig.", "figs.", "eq.", "eqs.", "ref.", "refs.", "sec.", "ch.", "vol.", "no.", "al.", "cf.",
        "vs.", "approx.", "resp.", "dr.", "prof.", "mr.", "mrs.", "ms.", "st.", "pp.", "p.",
    ]

    static func endsSentence(_ word: String) -> Bool {
        var w = Substring(word)
        while let last = w.last, ")\"”’]".contains(last) { w = w.dropLast() }
        guard let last = w.last, ".!?…".contains(last) else { return false }
        if abbreviations.contains(w.lowercased()) { return false }
        if w.count == 2, w.first?.isUppercase == true { return false } // an initial: "A."
        return true
    }
}
