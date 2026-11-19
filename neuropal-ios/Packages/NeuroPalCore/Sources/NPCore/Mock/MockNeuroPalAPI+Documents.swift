import CoreGraphics
import CoreText
import Foundation
#if canImport(PDFKit)
import PDFKit
#endif

// Documents, offline: the fixtures below plus anything uploaded in this
// session. Uploads walk through the ingest stages over ~13 s (pending →
// parsing → chunking → embedding → ready) and txt/md/pdf uploads get their
// real text (PDFKit), so the reader works on your own files without a server.
// The sample paper and review have an "original PDF" (drawn on demand), and
// an uploaded PDF keeps its own.
extension MockNeuroPalAPI {
    public func documents(query: String?) async throws -> [NPDocument] {
        await pause()
        try requireSession()
        let all = lock.withLock { documentsStore }.map { MockIngest.shared.current($0) }
        guard let q = query?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !q.isEmpty else { return all }
        return all.filter { $0.title.lowercased().contains(q) || ($0.subtitle ?? "").lowercased().contains(q) }
    }

    public func document(id: String) async throws -> NPDocument {
        await pause()
        try requireSession()
        guard let d = lock.withLock({ documentsStore.first { $0.id == id } }) else { throw APIError.notFound }
        return MockIngest.shared.current(d)
    }

    public func upload(fileURL: URL, title: String?) async throws -> NPDocument {
        await pause()
        try requireSession()
        var ext = fileURL.pathExtension.lowercased()
        if ext == "markdown" { ext = "md" }
        let accepted: Set<String> = ["pdf", "epub", "docx", "pptx", "md", "txt", "djvu"]
        guard accepted.contains(ext), let type = DocumentType(rawValue: ext) else {
            throw APIError.server(status: 415, message: "That kind of file can't be read.")
        }
        let id = String(format: "%024llx", UInt64.random(in: 1...UInt64.max))
        let name = title ?? fileURL.deletingPathExtension().lastPathComponent
        let text = MockIngest.extractText(fileURL, type: type, id: id, title: name)
        if type == .pdf { MockIngest.shared.keepOriginal(id, from: fileURL) }
        let doc = NPDocument(id: id, title: name, type: type, status: .pending, progress: 0, pageCount: text?.pageCount,
                             wordCount: text?.wordCount, readingProgress: 0, createdAt: Date())
        MockIngest.shared.begin(id, text: text)
        lock.withLock { documentsStore.insert(doc, at: 0) }
        return doc
    }

    public func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument {
        await pause()
        try requireSession()
        let updated = try lock.withLock {
            guard let i = documentsStore.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
            documentsStore[i].title = title
            documentsStore[i].subtitle = subtitle
            return documentsStore[i]
        }
        return MockIngest.shared.current(updated)
    }

    public func deleteDocument(id: String) async throws {
        await pause()
        try requireSession()
        lock.withLock {
            documentsStore.removeAll { $0.id == id }
            chatStore[id] = nil
        }
        MockIngest.shared.forget(id)
    }

    /// Reads it again: back through the stages (~13 s) to ready.
    public func reingestDocument(id: String) async throws {
        await pause()
        try requireSession()
        try lock.withLock {
            guard let i = documentsStore.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
            documentsStore[i].status = .pending
            documentsStore[i].progress = 0
            documentsStore[i].ingestError = nil
        }
        MockIngest.shared.begin(id, text: MockIngest.shared.text(for: id))
    }

    public func documentText(id: String) async throws -> DocumentText {
        await pause()
        try requireSession()
        guard let doc = lock.withLock({ documentsStore.first { $0.id == id } }) else { throw APIError.notFound }
        if let text = MockFixtures.texts[id] { return text }
        if let text = MockIngest.shared.text(for: id) { return text }
        return DocumentText(id: id, title: doc.title,
                            text: "Offline, NeuroPal can show the text of PDF, Markdown and text files. This one opens fully when you're connected to your server.",
                            source: "raw-file")
    }

    public func readingProgress(id: String) async throws -> ReadingProgress {
        await pause()
        try requireSession()
        if let saved = MockIngest.shared.progress(for: id) { return saved }
        let d = lock.withLock { documentsStore.first { $0.id == id } }
        return ReadingProgress(progress: d?.readingProgress, lastWordIndex: nil, lastPage: nil, lastOpenedAt: d?.lastReadAt)
    }

    public func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws {
        try requireSession()
        MockIngest.shared.save(id, ReadingProgress(progress: update.progress, lastWordIndex: update.lastWordIndex,
                                                   lastPage: update.lastPage, lastOpenedAt: Date()))
        lock.withLock {
            if let i = documentsStore.firstIndex(where: { $0.id == id }) {
                documentsStore[i].readingProgress = update.progress
                documentsStore[i].lastReadAt = Date()
            }
        }
    }

    public func ask(documentID: String, question: String, threadID: String?) async throws -> QueryAnswer {
        await pause()
        try await Task.sleep(for: latency) // answers take a little longer
        try requireSession()
        let thread = threadID ?? "mock-thread-\(documentID)"
        let reply = MockFixtures.answer(to: question, documentID: documentID)
        let answer = QueryAnswer(answer: reply.answer, citations: reply.citations, threadId: thread, mode: "rag",
                                 model: "mock", provider: "mock", chunksUsed: reply.citations.count)
        lock.withLock {
            var log = chatStore[documentID] ?? MockFixtures.chatHistory(documentID)
            log.append(ChatMessage(id: UUID().uuidString, role: .user, content: question, threadId: thread, createdAt: Date()))
            log.append(ChatMessage(id: UUID().uuidString, role: .assistant, content: answer.answer, citations: answer.citations,
                                   threadId: thread, createdAt: Date()))
            chatStore[documentID] = log
        }
        return answer
    }

    public func chat(documentID: String, threadID: String?) async throws -> [ChatMessage] {
        await pause()
        try requireSession()
        let log = lock.withLock {
            if chatStore[documentID] == nil { chatStore[documentID] = MockFixtures.chatHistory(documentID) }
            return chatStore[documentID] ?? []
        }
        guard let threadID else { return log }
        return log.filter { $0.threadId == threadID }
    }

    public func ticket(documentID: String) async throws -> DocTicket {
        DocTicket(ticket: "mock-ticket", expiresAt: Date().addingTimeInterval(12 * 3600))
    }

    public func epubManifest(documentID: String) async throws -> EpubManifest {
        await pause()
        try requireSession()
        guard documentID == MockFixtures.bookID else {
            throw APIError.server(status: 400, message: "Offline, only the sample book opens as an EPUB.")
        }
        return EpubManifest(
            id: documentID, title: "Quantum Light, Gently",
            spine: [.init(index: 0, href: "ch1.xhtml"), .init(index: 1, href: "ch2.xhtml"), .init(index: 2, href: "ch3.xhtml")],
            toc: [
                .init(title: "1. Light, counted one photon at a time", href: "ch1.xhtml", anchor: "c1"),
                .init(title: "2. Pairs from a crystal", href: "ch2.xhtml", anchor: "c2", children: [
                    .init(title: "2.1 What the split conserves", href: "ch2.xhtml#s21", anchor: "s21"),
                    .init(title: "2.2 Heralding", href: "ch2.xhtml#s22", anchor: "s22"),
                ]),
                .init(title: "3. Images from correlations", href: "ch3.xhtml", anchor: "c3"),
            ],
            pageList: [
                .init(page: "1", href: "ch1.xhtml", anchor: "page1"), .init(page: "2", href: "ch1.xhtml", anchor: "page2"),
                .init(page: "3", href: "ch2.xhtml", anchor: "page3"), .init(page: "4", href: "ch2.xhtml", anchor: "page4"),
                .init(page: "5", href: "ch3.xhtml", anchor: "page5"),
            ])
    }

    /// No page renders offline: the reader shows "Page image not available offline".
    public func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL {
        host.appending(path: "/api/documents/\(documentID)/page/\(page)")
    }

    /// The original PDF: uploaded PDFs keep theirs; the sample paper and
    /// review get one drawn from their text (a page per pageMap page).
    public func downloadOriginalFile(documentID: String) async throws -> URL {
        await pause()
        try requireSession()
        if let kept = MockIngest.shared.original(for: documentID) { return kept }
        guard documentID == MockFixtures.paperID || documentID == MockFixtures.spadID,
              let text = MockFixtures.texts[documentID] else { throw APIError.notFound }
        let url = FileManager.default.temporaryDirectory.appending(path: "np-original-\(documentID).pdf")
        guard MockPDF.write(text, to: url) else { throw APIError.notFound }
        return url
    }

    /// The bundled sample book (Mock/MockBook): real files, so the EPUB view works offline.
    public func epubBaseURL(documentID: String, ticket: String?) -> URL {
        guard let folder = Bundle.module.url(forResource: "MockBook", withExtension: nil) else { return host }
        return URL(fileURLWithPath: folder.path, isDirectory: true)
    }
}

/// Simulated ingest and saved reading positions for the mock (process-wide).
final class MockIngest: @unchecked Sendable {
    static let shared = MockIngest()
    private let lock = NSLock()
    private var started: [String: Date] = [:]
    private var texts: [String: DocumentText] = [:]
    private var positions: [String: ReadingProgress] = [:]
    private var originals: [String: URL] = [:]

    func begin(_ id: String, text: DocumentText?) {
        lock.withLock {
            started[id] = Date()
            texts[id] = text
        }
    }

    func forget(_ id: String) {
        lock.withLock {
            started[id] = nil
            texts[id] = nil
            positions[id] = nil
            if let copy = originals.removeValue(forKey: id) { try? FileManager.default.removeItem(at: copy) }
        }
    }

    func text(for id: String) -> DocumentText? { lock.withLock { texts[id] } }
    func original(for id: String) -> URL? { lock.withLock { originals[id] } }

    /// Copy an uploaded PDF aside (the app deletes its staged upload).
    func keepOriginal(_ id: String, from url: URL) {
        let copy = FileManager.default.temporaryDirectory.appending(path: "np-mock-original-\(id).pdf")
        try? FileManager.default.removeItem(at: copy)
        guard (try? FileManager.default.copyItem(at: url, to: copy)) != nil else { return }
        lock.withLock { originals[id] = copy }
    }
    func progress(for id: String) -> ReadingProgress? { lock.withLock { positions[id] } }
    func save(_ id: String, _ p: ReadingProgress) { lock.withLock { positions[id] = p } }

    /// The document as the server would report it right now.
    func current(_ doc: NPDocument) -> NPDocument {
        guard let start = lock.withLock({ started[doc.id] }) else { return doc }
        let t = Date().timeIntervalSince(start)
        var d = doc
        switch t {
        case ..<1.5:
            d.status = .pending
            d.progress = 0
        case ..<4:
            d.status = .parsing
            d.progress = 0
        case ..<6.5:
            d.status = .chunking
            d.progress = 0
        case ..<13:
            d.status = .embedding
            d.progress = min(1, (t - 6.5) / 6.5)
        default:
            d.status = .ready
            d.progress = 1
        }
        return d
    }

    static func extractText(_ url: URL, type: DocumentType, id: String, title: String) -> DocumentText? {
        switch type {
        case .txt, .md:
            guard let s = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            return DocumentText(id: id, title: title, text: s, wordCount: s.split(whereSeparator: \.isWhitespace).count,
                                source: "chunks")
        case .pdf:
            return pdfText(url, id: id, title: title)
        default:
            return nil
        }
    }

    static func pdfText(_ url: URL, id: String, title: String) -> DocumentText? {
        #if canImport(PDFKit)
        guard let pdf = PDFDocument(url: url) else { return nil }
        var paragraphs: [String] = []
        var pageMap: [PageAnchor] = []
        for i in 0..<pdf.pageCount {
            guard let raw = pdf.page(at: i)?.string, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            pageMap.append(PageAnchor(page: i + 1, startParagraph: paragraphs.count))
            // PDF text breaks every line; a line ending a sentence closes a paragraph.
            var current = ""
            for line in raw.components(separatedBy: .newlines) {
                let l = line.trimmingCharacters(in: .whitespaces)
                if l.isEmpty {
                    if !current.isEmpty { paragraphs.append(current) }
                    current = ""
                    continue
                }
                current += current.isEmpty ? l : " " + l
                if let last = l.last, ".!?:".contains(last), current.count > 280 {
                    paragraphs.append(current)
                    current = ""
                }
            }
            if !current.isEmpty { paragraphs.append(current) }
        }
        guard !paragraphs.isEmpty else { return nil }
        let text = paragraphs.joined(separator: "\n\n")
        return DocumentText(id: id, title: title, text: text, pageCount: pdf.pageCount,
                            wordCount: text.split(whereSeparator: \.isWhitespace).count, pageMap: pageMap, source: "chunks")
        #else
        return nil
        #endif
    }
}

/// Draws a plain "original" PDF from a fixture text: one page per pageMap
/// page, Times, the maths written out in Unicode.
enum MockPDF {
    static func write(_ doc: DocumentText, to url: URL) -> Bool {
        let paragraphs = doc.text.components(separatedBy: "\n\n")
            .map { $0.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
            .filter { !$0.isEmpty }
        guard !paragraphs.isEmpty else { return false }
        let marks = doc.pageMap.sorted { $0.page < $1.page }
        var pages: [Range<Int>] = []
        if marks.isEmpty {
            pages = [0..<paragraphs.count]
        } else {
            for (i, mark) in marks.enumerated() {
                let start = min(mark.startParagraph, paragraphs.count)
                let end = i + 1 < marks.count ? min(marks[i + 1].startParagraph, paragraphs.count) : paragraphs.count
                pages.append(start..<max(start, end))
            }
        }
        var box = CGRect(x: 0, y: 0, width: 595, height: 842)
        try? FileManager.default.removeItem(at: url)
        guard let consumer = CGDataConsumer(url: url as CFURL), let context = CGContext(consumer: consumer, mediaBox: &box, nil)
        else { return false }
        let headings = Set(doc.toc.compactMap(\.startParagraph))
        let fontKey = NSAttributedString.Key(kCTFontAttributeName as String)
        for (number, range) in pages.enumerated() {
            context.beginPDFPage(nil)
            let page = NSMutableAttributedString()
            for i in range {
                let p = unicodeMath(paragraphs[i])
                let heading = i == 0 || (headings.contains(i) && p.count < 80)
                let size: CGFloat = i == 0 ? 19 : (heading ? 13.5 : 11)
                let font = CTFontCreateWithName((heading ? "Times-Bold" : "Times-Roman") as CFString, size, nil)
                page.append(NSAttributedString(string: p + "\n\n", attributes: [fontKey: font]))
            }
            let frameRect = CGRect(x: 66, y: 72, width: box.width - 132, height: box.height - 136)
            let setter = CTFramesetterCreateWithAttributedString(page as CFAttributedString)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), CGPath(rect: frameRect, transform: nil), nil)
            CTFrameDraw(frame, context)
            let footer = NSAttributedString(string: "\(number + 1)",
                                            attributes: [fontKey: CTFontCreateWithName("Times-Roman" as CFString, 10, nil)])
            context.textPosition = CGPoint(x: box.width / 2 - 3, y: 40)
            CTLineDraw(CTLineCreateWithAttributedString(footer as CFAttributedString), context)
            context.endPDFPage()
        }
        context.closePDF()
        return true
    }

    /// The fixtures' few LaTeX islands, as they'd be typeset.
    static func unicodeMath(_ s: String) -> String {
        s.replacingOccurrences(of: "$$\\Gamma(\\rho_1, \\rho_2) = \\langle \\Delta I_1(\\rho_1)\\, \\Delta I_2(\\rho_2) \\rangle$$",
                               with: "Γ(ρ₁, ρ₂) = ⟨ΔI₁(ρ₁) ΔI₂(ρ₂)⟩")
            .replacingOccurrences(of: "$G^{(2)}(\\rho_1, \\rho_2)$", with: "G⁽²⁾(ρ₁, ρ₂)")
            .replacingOccurrences(of: "$\\rho_1$", with: "ρ₁")
            .replacingOccurrences(of: "$\\rho_2$", with: "ρ₂")
    }
}

public extension MockFixtures {
    static let paperID = "64f0c0ffee00000000000001"
    static let bookID = "64f0c0ffee00000000000002"
    static let notesID = "64f0c0ffee00000000000003"
    static let processingID = "64f0c0ffee00000000000004"
    static let failedID = "64f0c0ffee00000000000005"
    static let spadID = "64f0c0ffee00000000000006"

    static let documents: [NPDocument] = [
        NPDocument(id: paperID, title: "Correlation plenoptic imaging with entangled photons",
                   subtitle: "Reading group · week 3", type: .pdf, status: .ready, progress: 1, pageCount: 6, wordCount: 563,
                   readingProgress: 0.42, lastReadAt: Date().addingTimeInterval(-3600 * 5),
                   createdAt: Date().addingTimeInterval(-86400 * 3)),
        NPDocument(id: bookID, title: "Quantum Light, Gently", subtitle: "A sample book", type: .epub, status: .ready,
                   progress: 1, pageCount: 0, wordCount: 443, readingProgress: 0.1,
                   lastReadAt: Date().addingTimeInterval(-86400), createdAt: Date().addingTimeInterval(-86400 * 9)),
        NPDocument(id: spadID, title: "Single-photon avalanche diode arrays for quantum imaging",
                   subtitle: "Review · detectors", type: .arxiv, status: .ready, progress: 1, pageCount: 4, wordCount: 186,
                   readingProgress: 0.08, lastReadAt: Date().addingTimeInterval(-86400 * 4),
                   createdAt: Date().addingTimeInterval(-86400 * 6)),
        NPDocument(id: notesID, title: "PhD exam notes — second quantisation", type: .md, status: .ready, progress: 1,
                   wordCount: 120, readingProgress: 0, createdAt: Date().addingTimeInterval(-86400 * 14)),
        NPDocument(id: processingID, title: "Hong–Ou–Mandel interference, revisited", type: .pdf, status: .embedding,
                   progress: 0.62, createdAt: Date().addingTimeInterval(-120)),
        NPDocument(id: failedID, title: "scan_0042.djvu", type: .djvu, status: .failed, progress: 0,
                   createdAt: Date().addingTimeInterval(-86400 * 2), ingestError: "No text found in this file."),
    ]

    static let paperText = """
    Correlation plenoptic imaging with entangled photons

    Abstract. A plenoptic camera records both where light lands and the direction it came from, so a picture can be refocused after it is taken. Conventional plenoptic cameras pay for that freedom with spatial resolution. Correlation plenoptic imaging (CPI) splits the two measurements between two detectors and recovers both from the correlation of their intensity fluctuations. Using photon pairs from spontaneous parametric down-conversion, we refocus images over a depth of field six times larger than that of a conventional image at the same resolution.

    1 Introduction

    A conventional image is a map of intensity. Two objects at different depths cannot both be sharp unless the lens is stopped down, and stopping down throws light away and lowers the resolution. Plenoptic, or light-field, imaging also records the direction of each ray, so the focus can be chosen later in software.

    The price is a fixed budget of pixels. A microlens array divides the sensor between position and direction, and every gain in depth of field costs resolution. For microscopy, and for fragile samples that must be imaged in low light, that trade-off is the main limit.

    CPI separates the two jobs. One detector sees the object; the other sees the lens. Neither detector alone forms an image. The image appears only in the correlation between them, through the correlation function $G^{(2)}(\\rho_1, \\rho_2)$ measured pixel by pixel.

    2 Setup

    A continuous-wave pump laser at 405 nm drives a nonlinear crystal, which emits photon pairs by spontaneous parametric down-conversion. A beam splitter separates the pairs. One photon passes the object and reaches a spatially resolving detector in the focal plane of the lens; its twin travels to a second detector that images the lens itself.

    Because the photons are born together, each coincidence carries both a position and a direction. The quantity we measure is the correlation of intensity fluctuations between the two detectors:

    $$\\Gamma(\\rho_1, \\rho_2) = \\langle \\Delta I_1(\\rho_1)\\, \\Delta I_2(\\rho_2) \\rangle$$

    where $\\rho_1$ and $\\rho_2$ are pixel positions on the two sensors and the average runs over many frames.

    3 Refocusing

    Each point of the lens and each point of the object define one ray. Summing the correlation over the right combinations of pixels moves the plane of focus, just as a light-field camera does, but without dividing either sensor. The refocused image keeps the full resolution of the object detector.

    4 Results

    With a resolution target placed 8 mm out of focus, the conventional image is a blur. The refocused correlation image resolves lines 50 μm apart, the resolution of a focused image. Across the full range we tested, the depth of field is six times larger than that of a conventional image with the same numerical aperture.

    Entanglement matters for the visibility. With chaotic light the same geometry works, but a large background lowers the contrast of the correlation image. Photon pairs keep the visibility high, which classical sources cannot match at this resolution.

    5 Limits and outlook

    Only coincidences contribute, so acquisition is slower than taking an ordinary photograph: each of our images takes several minutes. Faster single-photon detector arrays, such as SPAD cameras, and brighter pair sources will shorten the measurement, and the refocusing step runs well in parallel on a graphics card.

    The same principle extends to three-dimensional imaging of biological samples, where low light and a large depth of field matter most.
    """

    static let notesText = """
    PhD exam notes — second quantisation

    Fock space

    Fock space is the direct sum of the n-particle spaces. The vacuum state |0⟩ has no particles, and every other state is built by creation operators acting on it.

    Bosons

    For bosons the creation and annihilation operators obey the commutator [a, a†] = 1. The number operator N = a†a counts quanta, and a† raises its eigenvalue by one.

    Coherent states

    Coherent states are eigenstates of the annihilation operator, a|α⟩ = α|α⟩. They are the closest quantum states to a classical field, and a laser far above threshold produces them.

    Exam tip: derive the commutator for field operators at two positions before memorising it. Then check the result against the single-mode case.
    """

    static let spadText = """
    Single-photon avalanche diode arrays for quantum imaging

    A single-photon avalanche diode, or SPAD, is a photodiode biased above its breakdown voltage. One absorbed photon can trigger an avalanche, so the diode answers single photons with a clean digital pulse and a timestamp good to tens of picoseconds.

    1 Why arrays matter

    Correlation imaging needs coincidences between many pixels at once. A single SPAD can only count; an array of them, each with its own timing electronics, records where and when every photon arrived. That turns an hours-long raster scan into a measurement of minutes.

    2 What limits them

    Three numbers decide whether an array is useful: the fill factor, the fraction of each pixel that actually detects light; the dark count rate, the clicks with no photon at all; and crosstalk, when one avalanche sets off its neighbours. Microlenses raise the fill factor, cooling lowers the dark counts, and trenches between pixels cut the crosstalk.

    3 Outlook

    Arrays of a million pixels now exist. Reading out every timestamp is the new bottleneck, so on-chip processing that keeps only the coincidences is where the field is heading.
    """

    static let texts: [String: DocumentText] = [
        paperID: DocumentText(
            id: paperID, title: "Correlation plenoptic imaging with entangled photons", text: paperText, pageCount: 6,
            wordCount: 563,
            toc: [
                TocEntry(title: "Abstract", order: 0, startParagraph: 1, startPage: 1),
                TocEntry(title: "1 Introduction", order: 1, startParagraph: 2, startPage: 1),
                TocEntry(title: "2 Setup", order: 2, startParagraph: 6, startPage: 2),
                TocEntry(title: "3 Refocusing", order: 3, startParagraph: 11, startPage: 4),
                TocEntry(title: "4 Results", order: 4, startParagraph: 13, startPage: 5),
                TocEntry(title: "5 Limits and outlook", order: 5, startParagraph: 16, startPage: 6),
            ],
            pageMap: [PageAnchor(page: 1, startParagraph: 0), PageAnchor(page: 2, startParagraph: 5),
                      PageAnchor(page: 3, startParagraph: 8), PageAnchor(page: 4, startParagraph: 11),
                      PageAnchor(page: 5, startParagraph: 13), PageAnchor(page: 6, startParagraph: 16)],
            source: "chunks"),
        notesID: DocumentText(
            id: notesID, title: "PhD exam notes — second quantisation", text: notesText, wordCount: 120,
            toc: [
                TocEntry(title: "Fock space", order: 0, startParagraph: 1),
                TocEntry(title: "Bosons", order: 1, startParagraph: 3),
                TocEntry(title: "Coherent states", order: 2, startParagraph: 5),
            ],
            source: "chunks"),
        spadID: DocumentText(
            id: spadID, title: "Single-photon avalanche diode arrays for quantum imaging", text: spadText, pageCount: 4,
            wordCount: 186,
            toc: [
                TocEntry(title: "1 Why arrays matter", order: 0, startParagraph: 2, startPage: 1),
                TocEntry(title: "2 What limits them", order: 1, startParagraph: 4, startPage: 2),
                TocEntry(title: "3 Outlook", order: 2, startParagraph: 6, startPage: 4),
            ],
            pageMap: [PageAnchor(page: 1, startParagraph: 0), PageAnchor(page: 2, startParagraph: 3),
                      PageAnchor(page: 3, startParagraph: 5), PageAnchor(page: 4, startParagraph: 7)],
            source: "chunks"),
    ]

    /// A conversation already in progress for the sample paper (Ask's first look).
    static func chatHistory(_ documentID: String) -> [ChatMessage] {
        guard documentID == paperID else { return [] }
        let thread = "mock-thread-\(paperID)"
        let reply = answer(to: "What's the main result?", documentID: paperID)
        return [
            ChatMessage(id: "mock-chat-1", role: .user, content: "What's the main result?", threadId: thread,
                        createdAt: Date().addingTimeInterval(-3600 * 5)),
            ChatMessage(id: "mock-chat-2", role: .assistant, content: reply.answer, citations: reply.citations,
                        threadId: thread, createdAt: Date().addingTimeInterval(-3600 * 5 + 8)),
        ]
    }

    /// Canned answers that quote the fixtures (their excerpts are real
    /// passages, so citations land on the right paragraph).
    static func answer(to question: String, documentID: String) -> (answer: String, citations: [Citation]) {
        let q = question.lowercased()
        if documentID == notesID {
            return ("**Coherent states** are eigenstates of the annihilation operator, so taking one quantum away leaves the state unchanged — that's why they behave most like a classical wave [1]. A laser far above threshold produces them [1].",
                    [Citation(chunkId: "mock-n1", sectionHeading: "Coherent states",
                              excerpt: "Coherent states are eigenstates of the annihilation operator")])
        }
        if documentID == spadID {
            return ("A SPAD array records **where and when** every photon arrives, which is what correlation imaging needs [1]. Its usefulness comes down to fill factor, dark counts and crosstalk [2].",
                    [Citation(chunkId: "mock-s1", page: 2, sectionHeading: "1 Why arrays matter",
                              excerpt: "records where and when every photon arrived"),
                     Citation(chunkId: "mock-s2", page: 3, sectionHeading: "2 What limits them",
                              excerpt: "Three numbers decide whether an array is useful")])
        }
        if documentID == bookID {
            return ("Detecting one photon of a pair tells you its twin exists — that's **heralding** [1]. It turns a weak, random source into one where you know when a photon is coming.",
                    [Citation(chunkId: "mock-b1", sectionHeading: "2.2 Heralding",
                              excerpt: "detecting one photon heralds the other")])
        }
        guard documentID == paperID else {
            return ("You're offline, so this is a sample answer. Connected to your server, answers come from the document itself, with the pages they cite.", [])
        }
        if q.contains("summar") || q.contains("plain") {
            return ("In plain words: a normal camera can focus at only one depth at a time. This method uses pairs of photons and two detectors — one looks at the object, one looks at the lens — and builds the picture from how their signals move together [1].\n\nBecause every pair tells you both *where* the light landed and *which way* it travelled, the focus can be changed after the measurement without losing detail [2].",
                    [Citation(chunkId: "mock-c1", page: 1, sectionHeading: "Abstract",
                              excerpt: "recovers both from the correlation of their intensity fluctuations"),
                     Citation(chunkId: "mock-c2", page: 3, sectionHeading: "2 Setup",
                              excerpt: "each coincidence carries both a position and a direction")])
        }
        if q.contains("setup") || q.contains("step") {
            return ("1. A 405 nm laser pumps a nonlinear crystal, which now and then splits a pump photon into a pair [1].\n2. A beam splitter sends the two photons of each pair different ways.\n3. One photon passes the object and lands on a detector in the focal plane; its twin goes to a second detector that images the lens [1].\n4. Counting coincidences gives the correlation $\\Gamma(\\rho_1, \\rho_2)$ between the two detectors, pixel by pixel [2].",
                    [Citation(chunkId: "mock-c3", page: 2, sectionHeading: "2 Setup",
                              excerpt: "drives a nonlinear crystal, which emits photon pairs"),
                     Citation(chunkId: "mock-c4", page: 3, sectionHeading: "2 Setup",
                              excerpt: "The quantity we measure is the correlation of intensity fluctuations")])
        }
        if q.contains("exam") || q.contains("remember") {
            return ("Three things to remember:\n• The image lives in the **correlation** between the detectors, not in either one [1].\n• Refocusing keeps the full resolution, because no sensor is divided [2].\n• The cost is time: only coincidences count [3].",
                    [Citation(chunkId: "mock-c5", page: 2, sectionHeading: "1 Introduction",
                              excerpt: "The image appears only in the correlation between them"),
                     Citation(chunkId: "mock-c6", page: 4, sectionHeading: "3 Refocusing",
                              excerpt: "keeps the full resolution of the object detector"),
                     Citation(chunkId: "mock-c7", page: 6, sectionHeading: "5 Limits and outlook",
                              excerpt: "Only coincidences contribute, so acquisition is slower")])
        }
        if q.contains("result") {
            return ("**Refocusing without losing resolution.** With a target 8 mm out of focus, the correlation image still resolves lines 50 μm apart — the resolution of a focused image [1]. Over the tested range the depth of field is about six times larger than a conventional image with the same numerical aperture [1].\n\nPhoton pairs also keep the visibility high, which chaotic light can't match at this resolution [2].",
                    [Citation(chunkId: "mock-c8", page: 5, sectionHeading: "4 Results",
                              excerpt: "The refocused correlation image resolves lines 50 μm apart"),
                     Citation(chunkId: "mock-c9", page: 5, sectionHeading: "4 Results",
                              excerpt: "Photon pairs keep the visibility high")])
        }
        return ("The paper measures correlations between two detectors instead of the intensity on one. Because the photons of a pair are born together, a coincidence tells you both where a photon hit the sensor and which way it travelled — so the image can be refocused after the fact [1]. The trade-off is light: only coincidences count, so acquisition takes longer [2].",
                [Citation(chunkId: "mock-c2", page: 3, sectionHeading: "2 Setup",
                          excerpt: "each coincidence carries both a position and a direction"),
                 Citation(chunkId: "mock-c7", page: 6, sectionHeading: "5 Limits and outlook",
                          excerpt: "Only coincidences contribute, so acquisition is slower")])
    }
}
