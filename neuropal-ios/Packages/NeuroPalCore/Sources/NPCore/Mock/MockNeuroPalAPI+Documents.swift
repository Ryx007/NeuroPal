import Foundation

extension MockNeuroPalAPI {
    public func documents(query: String?) async throws -> [NPDocument] {
        await pause()
        try requireSession()
        let all = lock.withLock { documentsStore }
        guard let q = query?.trimmingCharacters(in: .whitespaces).lowercased(), !q.isEmpty else { return all }
        return all.filter { $0.title.lowercased().contains(q) || ($0.subtitle ?? "").lowercased().contains(q) }
    }

    public func document(id: String) async throws -> NPDocument {
        await pause()
        try requireSession()
        guard let d = lock.withLock({ documentsStore.first { $0.id == id } }) else { throw APIError.notFound }
        return d
    }

    public func upload(fileURL: URL, title: String?) async throws -> NPDocument {
        await pause()
        try requireSession()
        let ext = fileURL.pathExtension.lowercased()
        let doc = NPDocument(
            id: String(format: "%024llx", UInt64.random(in: 1...UInt64.max)),
            title: title ?? fileURL.deletingPathExtension().lastPathComponent,
            type: DocumentType(rawValue: ext) ?? .txt,
            status: .pending, progress: 0, createdAt: Date())
        lock.withLock { documentsStore.insert(doc, at: 0) }
        return doc
    }

    public func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument {
        await pause()
        try requireSession()
        return try lock.withLock {
            guard let i = documentsStore.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
            documentsStore[i].title = title
            documentsStore[i].subtitle = subtitle
            return documentsStore[i]
        }
    }

    public func deleteDocument(id: String) async throws {
        await pause()
        try requireSession()
        lock.withLock { documentsStore.removeAll { $0.id == id } }
    }

    public func documentText(id: String) async throws -> DocumentText {
        await pause()
        try requireSession()
        guard let doc = lock.withLock({ documentsStore.first { $0.id == id } }) else { throw APIError.notFound }
        if let text = MockFixtures.texts[id] { return text }
        return DocumentText(id: id, title: doc.title, text: "This document has no text yet.", source: "raw-file")
    }

    public func readingProgress(id: String) async throws -> ReadingProgress {
        await pause()
        try requireSession()
        let d = lock.withLock { documentsStore.first { $0.id == id } }
        return ReadingProgress(progress: d?.readingProgress, lastWordIndex: nil, lastPage: nil, lastOpenedAt: d?.lastReadAt)
    }

    public func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws {
        try requireSession()
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
        let answer = QueryAnswer(
            answer: "The paper measures correlations between two detectors instead of the intensity on one. "
                + "Because the entangled photons are born together, a coincidence tells you both where a photon "
                + "hit the sensor and which way it travelled — so the image can be refocused after the fact [1]. "
                + "The trade-off is light: only coincidences count, so acquisition takes longer [2].",
            citations: [
                Citation(chunkId: "mock-c1", page: 2, sectionHeading: "2 Setup",
                         excerpt: "each coincidence carries both a position and a direction"),
                Citation(chunkId: "mock-c2", page: 4, sectionHeading: "4 Limits",
                         excerpt: "only coincidences contribute, so acquisition is slower"),
            ],
            threadId: thread, mode: "rag", model: "mock", provider: "mock", chunksUsed: 2)
        lock.withLock {
            var log = chatStore[documentID] ?? []
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
        let log = lock.withLock { chatStore[documentID] ?? [] }
        guard let threadID else { return log }
        return log.filter { $0.threadId == threadID }
    }

    public func ticket(documentID: String) async throws -> DocTicket {
        DocTicket(ticket: "mock-ticket", expiresAt: Date().addingTimeInterval(12 * 3600))
    }

    public func epubManifest(documentID: String) async throws -> EpubManifest {
        await pause()
        try requireSession()
        guard documentID == MockFixtures.bookID else { throw APIError.server(status: 400, message: "not an EPUB") }
        return EpubManifest(
            id: documentID, title: "Quantum Light, Gently",
            spine: [.init(index: 0, href: "ch1.xhtml"), .init(index: 1, href: "ch2.xhtml")],
            toc: [
                .init(title: "1. Light, counted one photon at a time", href: "ch1.xhtml", anchor: "c1"),
                .init(title: "2. Pairs from a crystal", href: "ch2.xhtml", anchor: "c2"),
            ])
    }

    /// No page renders offline: a placeholder the reader shows as "page unavailable".
    public func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL {
        host.appending(path: "/api/documents/\(documentID)/page/\(page)")
    }

    /// The bundled sample book (Mock/MockBook) — real files, so the EPUB view works offline.
    public func epubBaseURL(documentID: String, ticket: String?) -> URL {
        Bundle.module.url(forResource: "MockBook", withExtension: nil) ?? host
    }
}

public extension MockFixtures {
    static let paperID = "64f0c0ffee00000000000001"
    static let bookID = "64f0c0ffee00000000000002"
    static let notesID = "64f0c0ffee00000000000003"
    static let processingID = "64f0c0ffee00000000000004"
    static let failedID = "64f0c0ffee00000000000005"

    static let documents: [NPDocument] = [
        NPDocument(id: paperID, title: "Correlation plenoptic imaging with entangled photons",
                   subtitle: "Reading group · week 3", type: .pdf, status: .ready, progress: 1, pageCount: 6, wordCount: 412,
                   readingProgress: 0.42, lastReadAt: Date().addingTimeInterval(-3600 * 5),
                   createdAt: Date().addingTimeInterval(-86400 * 3)),
        NPDocument(id: bookID, title: "Quantum Light, Gently", subtitle: "A sample book", type: .epub, status: .ready,
                   progress: 1, pageCount: 0, wordCount: 260, readingProgress: 0.1,
                   lastReadAt: Date().addingTimeInterval(-86400), createdAt: Date().addingTimeInterval(-86400 * 9)),
        NPDocument(id: notesID, title: "PhD exam notes — second quantisation", type: .md, status: .ready, progress: 1,
                   wordCount: 180, readingProgress: 0, createdAt: Date().addingTimeInterval(-86400 * 14)),
        NPDocument(id: processingID, title: "Hong–Ou–Mandel interference, revisited", type: .pdf, status: .embedding,
                   progress: 0.62, createdAt: Date().addingTimeInterval(-120)),
        NPDocument(id: failedID, title: "scan_0042.djvu", type: .djvu, status: .failed, progress: 0,
                   createdAt: Date().addingTimeInterval(-86400 * 2), ingestError: "No text found in this file."),
    ]

    static let paperText = """
    Correlation plenoptic imaging with entangled photons

    Abstract. A plenoptic camera records both where light lands and which direction it came from, so a picture can be refocused after it is taken. Ordinary plenoptic cameras pay for that with resolution. Measuring correlations between two detectors, instead of intensity on one, removes the trade-off.

    1 Introduction

    A conventional image is a map of intensity. Two objects at different depths cannot both be sharp unless the lens stops down, and stopping down throws light away. Plenoptic imaging records the direction of each ray as well, at the cost of spatial resolution.

    Correlation plenoptic imaging, or CPI, separates the two jobs. One detector sees the object; the other sees the lens. Neither detector alone forms an image. The image appears only in the correlation between them.

    2 Setup

    A pump laser drives a nonlinear crystal, which emits photon pairs by spontaneous parametric down-conversion. One photon of each pair passes the object and reaches a spatially resolving detector. Its twin travels to a second detector placed to image the lens.

    Because the photons are born together, each coincidence carries both a position and a direction. Summing coincidences over the right combinations of pixels refocuses the image to any plane within the depth of field.

    3 Results

    The refocused images keep the resolution of a focused conventional image over a depth of field several times larger. With entangled photons the visibility of the correlation stays high, which classical light sources cannot match.

    4 Limits

    Only coincidences contribute, so acquisition is slower than taking an ordinary photograph. Faster detectors and brighter pair sources shorten the measurement, and the processing parallelises well.
    """

    static let notesText = """
    PhD exam notes — second quantisation

    Fock space is the direct sum of the n-particle spaces. The vacuum state has no particles, and every other state is built by creation operators acting on it.

    For bosons the creation and annihilation operators obey the commutator [a, a†] = 1. The number operator N = a†a counts quanta, and a† raises its eigenvalue by one.

    Coherent states are eigenstates of the annihilation operator. They are the closest quantum states to a classical field, and a laser far above threshold produces them.

    Exam tip: derive the commutator for field operators at two positions before memorising it.
    """

    static let texts: [String: DocumentText] = [
        paperID: DocumentText(
            id: paperID, title: "Correlation plenoptic imaging with entangled photons", text: paperText, pageCount: 6,
            wordCount: 412,
            toc: [
                TocEntry(title: "Abstract", order: 0, startParagraph: 1, startPage: 1),
                TocEntry(title: "1 Introduction", order: 1, startParagraph: 2, startPage: 1),
                TocEntry(title: "2 Setup", order: 2, startParagraph: 5, startPage: 2),
                TocEntry(title: "3 Results", order: 3, startParagraph: 8, startPage: 3),
                TocEntry(title: "4 Limits", order: 4, startParagraph: 10, startPage: 4),
            ],
            pageMap: [PageAnchor(page: 1, startParagraph: 0), PageAnchor(page: 2, startParagraph: 5),
                      PageAnchor(page: 3, startParagraph: 8), PageAnchor(page: 4, startParagraph: 10)],
            source: "chunks"),
        notesID: DocumentText(id: notesID, title: "PhD exam notes — second quantisation", text: notesText, wordCount: 180,
                              source: "chunks"),
    ]
}
